import { useEffect, useState, createContext, useContext, ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";

// Generate or retrieve a persistent local ID
function getLocalId(): string {
  const key = "claude-sessions-local-id";
  let localId = localStorage.getItem(key);
  if (!localId) {
    localId = `local_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(key, localId);
  }
  return localId;
}

export interface ConvexUser {
  _id: Id<"users">;
  name: string;
  email: string;
  imageUrl?: string;
  tokenIdentifier: string;
}

interface ConvexUserContextType {
  user: ConvexUser | null;
  userId: Id<"users"> | null;
  isLoading: boolean;
  error: string | null;
  isAuthenticated: boolean;
}

const ConvexUserContext = createContext<ConvexUserContextType | null>(null);

export function useConvexUser() {
  const [userId, setUserId] = useState<Id<"users"> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const getOrCreateAnonymous = useMutation(api.users.getOrCreateAnonymous);

  useEffect(() => {
    const initUser = async () => {
      try {
        const localId = getLocalId();
        const id = await getOrCreateAnonymous({ localId });
        setUserId(id);
        setIsLoading(false);
      } catch (err) {
        console.error("[useConvexUser] Failed to init user:", err);
        setError(String(err));
        setIsLoading(false);
      }
    };

    initUser();
  }, [getOrCreateAnonymous]);

  // Query user data once we have ID
  const user = useQuery(
    api.users.get,
    userId ? { id: userId } : "skip"
  );

  return {
    user: user as ConvexUser | null,
    userId,
    isLoading: isLoading || !!(userId && !user),
    error,
    isAuthenticated: !!userId,
  };
}

// Context provider for sharing user across app
export function ConvexUserProvider({ children }: { children: ReactNode }) {
  const userState = useConvexUser();

  return (
    <ConvexUserContext.Provider value={userState}>
      {children}
    </ConvexUserContext.Provider>
  );
}

export function useCurrentUser() {
  const context = useContext(ConvexUserContext);
  if (!context) {
    throw new Error("useCurrentUser must be used within ConvexUserProvider");
  }
  return context;
}
