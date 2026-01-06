// Re-export from useAuth for backwards compatibility
// This file is deprecated - use useAuth instead

export { useCurrentUser, useAuth } from "./useAuth";
export { AuthProvider as ConvexUserProvider } from "./useAuth";

// Legacy type for backwards compatibility
import { Id } from "../../convex/_generated/dataModel";

export interface ConvexUser {
  _id: Id<"users">;
  name: string;
  email: string;
  imageUrl?: string;
  tokenIdentifier: string;
}

// Legacy hook - deprecated, use useAuth instead
export function useConvexUser() {
  // Import dynamically to avoid circular dependency
  const { useCurrentUser } = require("./useAuth");
  return useCurrentUser();
}
