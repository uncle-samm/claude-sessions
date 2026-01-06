import Google from "@auth/core/providers/google";
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Google, Password],
  callbacks: {
    async redirect({ redirectTo }) {
      // Allow localhost URLs for desktop app OAuth callback (tauri-plugin-oauth)
      if (redirectTo.startsWith("http://localhost:")) {
        return redirectTo;
      }
      // Allow relative paths and same-origin URLs (default behavior)
      const siteUrl = process.env.SITE_URL;
      if (redirectTo.startsWith("/") || redirectTo.startsWith("?")) {
        return `${siteUrl}${redirectTo}`;
      }
      if (siteUrl && redirectTo.startsWith(siteUrl)) {
        return redirectTo;
      }
      // Default fallback
      return siteUrl || redirectTo;
    },
  },
});
