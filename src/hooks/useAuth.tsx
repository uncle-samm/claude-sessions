import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useCallback,
  useRef,
} from "react";
import { useConvexAuth } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-shell";

// Generate or retrieve a persistent local ID for anonymous/offline mode
function getLocalId(): string {
  const key = "claude-sessions-local-id";
  let localId = localStorage.getItem(key);
  if (!localId) {
    localId = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(key, localId);
  }
  return localId;
}

export type AuthMode = "anonymous" | "authenticated";

export interface AuthUser {
  id: Id<"users">;
  name?: string;
  email?: string;
  image?: string;
}

interface AuthContextType {
  // Auth state
  mode: AuthMode;
  isLoading: boolean;
  isAuthenticated: boolean;
  user: AuthUser | null;

  // Local ID for offline/anonymous mode
  localId: string;

  // Auth actions - returns cancel function
  signIn: (provider: "google") => { cancel: () => void };
  signInWithPassword: (email: string, password: string, flow: "signIn" | "signUp") => Promise<void>;
  signOut: () => Promise<void>;

  // Convex user ID (null if anonymous/offline)
  userId: Id<"users"> | null;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [localId] = useState(() => getLocalId());
  const popupRef = useRef<Window | null>(null);
  const pollIntervalRef = useRef<number | null>(null);

  // Try to use Convex auth - this will fail gracefully if Convex is not configured
  let convexAuth: { isLoading: boolean; isAuthenticated: boolean } = {
    isLoading: false,
    isAuthenticated: false,
  };
  let authActions: ReturnType<typeof useAuthActions> | null = null;

  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    convexAuth = useConvexAuth();
    // eslint-disable-next-line react-hooks/rules-of-hooks
    authActions = useAuthActions();
  } catch {
    // Convex not configured, use anonymous mode
  }

  const { isLoading: authLoading, isAuthenticated } = convexAuth;

  // Get current user if authenticated
  const currentUser = useQuery(
    api.users.current,
    isAuthenticated ? {} : "skip"
  );

  // Link local ID to user on first sign-in
  const linkLocalId = useMutation(api.users.linkLocalId);

  // Effect to link local ID when user signs in
  useEffect(() => {
    if (isAuthenticated && currentUser) {
      linkLocalId({ localId }).catch((err) => {
        console.warn("[useAuth] Failed to link local ID:", err);
      });
    }
  }, [isAuthenticated, currentUser, linkLocalId, localId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
      if (popupRef.current && !popupRef.current.closed) {
        popupRef.current.close();
      }
    };
  }, []);

  const signIn = useCallback(
    (provider: "google") => {
      if (!authActions) {
        console.warn("[useAuth] Auth not configured");
        return { cancel: () => {} };
      }

      // Clear any existing poll interval
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }

      let cancelled = false;

      // Start the OAuth flow
      (async () => {
        try {
          // 1. Start the localhost OAuth server to capture the callback
          const port = await invoke<number>("start_oauth_flow");
          console.log("[useAuth] OAuth server started on port:", port);

          if (cancelled) return;

          // 2. Build the redirect URL pointing to our localhost server
          // The /cb path is required by tauri-plugin-oauth to trigger the callback
          const redirectTo = `http://localhost:${port}/cb`;

          // HACK: Convex Auth checks navigator.product !== "ReactNative" to decide
          // whether to auto-redirect via window.location.href. We temporarily
          // override this to prevent the redirect in Tauri.
          const originalProduct = navigator.product;
          Object.defineProperty(navigator, "product", {
            value: "ReactNative",
            writable: true,
            configurable: true,
          });

          // 3. Get the OAuth URL from Convex Auth
          const result = await authActions.signIn(provider, { redirectTo });

          // Restore original navigator.product
          Object.defineProperty(navigator, "product", {
            value: originalProduct,
            writable: true,
            configurable: true,
          });

          if (cancelled) return;

          console.log("[useAuth] signIn result:", result);

          if (result.redirect) {
            const url = result.redirect.toString();
            console.log("[useAuth] Opening OAuth URL in browser:", url);

            // 4. Open OAuth in the system browser (has proper WebAuthn/Bluetooth support)
            await open(url);
            console.log("[useAuth] Opened in external browser");

            // 5. Start polling for the callback URL
            pollIntervalRef.current = window.setInterval(async () => {
              if (cancelled) {
                if (pollIntervalRef.current) {
                  clearInterval(pollIntervalRef.current);
                  pollIntervalRef.current = null;
                }
                return;
              }

              try {
                const callbackUrl = await invoke<string | null>("poll_oauth_callback");
                if (callbackUrl) {
                  console.log("[useAuth] Received callback URL from poll:", callbackUrl);
                  if (pollIntervalRef.current) {
                    clearInterval(pollIntervalRef.current);
                    pollIntervalRef.current = null;
                  }
                  // Process the callback
                  const parsedUrl = new URL(callbackUrl);
                  const code = parsedUrl.searchParams.get("code");
                  // state param is available but not needed for Convex Auth verification
                  // const state = parsedUrl.searchParams.get("state");

                  if (code && authActions) {
                    console.log("[useAuth] Completing OAuth with code from poll");
                    // The code from Convex callback is verified by calling signIn without a provider
                    const oauthResult = await authActions.signIn(undefined as any, {
                      code,
                    });
                    console.log("[useAuth] OAuth result:", oauthResult);
                  }
                }
              } catch (err) {
                console.error("[useAuth] Poll error:", err);
              }
            }, 500); // Poll every 500ms

          } else if (result.signingIn) {
            console.log("[useAuth] Sign in completed without redirect");
          }
        } catch (err) {
          console.error("[useAuth] Sign in failed:", err);
        }
      })();

      // Return cancel function
      return {
        cancel: () => {
          cancelled = true;
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
        },
      };
    },
    [authActions]
  );

  const signInWithPassword = useCallback(
    async (email: string, password: string, flow: "signIn" | "signUp") => {
      if (!authActions) {
        throw new Error("Auth not configured");
      }

      try {
        console.log(`[useAuth] Password ${flow} for:`, email);
        const result = await authActions.signIn("password", { email, password, flow });
        console.log("[useAuth] Password auth result:", result);
      } catch (err) {
        console.error("[useAuth] Password auth failed:", err);
        throw err;
      }
    },
    [authActions]
  );

  const signOut = useCallback(async () => {
    if (!authActions) {
      console.warn("[useAuth] Auth not configured");
      return;
    }

    try {
      await authActions.signOut();
    } catch (err) {
      console.error("[useAuth] Sign out failed:", err);
      throw err;
    }
  }, [authActions]);

  const mode: AuthMode = isAuthenticated ? "authenticated" : "anonymous";

  const user: AuthUser | null = currentUser
    ? {
        id: currentUser._id,
        name: currentUser.name ?? undefined,
        email: currentUser.email ?? undefined,
        image: currentUser.image ?? undefined,
      }
    : null;

  const value: AuthContextType = {
    mode,
    isLoading: authLoading || (isAuthenticated && !currentUser),
    isAuthenticated,
    user,
    localId,
    signIn,
    signInWithPassword,
    signOut,
    userId: currentUser?._id ?? null,
  };

  // Expose auth functions globally for E2E tests
  useEffect(() => {
    (window as any).__CLAUDE_SESSIONS_AUTH__ = {
      signInWithPassword: (email: string, password: string, flow: "signIn" | "signUp") =>
        signInWithPassword(email, password, flow),
      signOut: () => signOut(),
      getState: () => ({
        mode,
        isAuthenticated,
        isLoading: authLoading,
        user,
      }),
    };
    return () => {
      delete (window as any).__CLAUDE_SESSIONS_AUTH__;
    };
  }, [signInWithPassword, signOut, mode, isAuthenticated, authLoading, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}

// Legacy hook for backwards compatibility
export function useCurrentUser() {
  const auth = useAuth();
  return {
    user: auth.user
      ? {
          _id: auth.user.id,
          name: auth.user.name ?? "Anonymous",
          email: auth.user.email ?? "",
          imageUrl: auth.user.image,
          tokenIdentifier: auth.localId,
        }
      : null,
    userId: auth.userId,
    isLoading: auth.isLoading,
    error: null,
    isAuthenticated: auth.isAuthenticated,
  };
}
