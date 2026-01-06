import ReactDOM from "react-dom/client";
import { ConvexReactClient } from "convex/react";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { AuthProvider } from "./hooks/useAuth";
import { SyncProvider } from "./services/SyncContext";
import App from "./App";

// Initialize Convex client
const convexUrl = import.meta.env.VITE_CONVEX_URL;
if (!convexUrl) {
  console.warn("VITE_CONVEX_URL not set, Convex features will be disabled");
}

const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  convex ? (
    <ConvexAuthProvider client={convex}>
      <AuthProvider>
        <SyncProvider>
          <App />
        </SyncProvider>
      </AuthProvider>
    </ConvexAuthProvider>
  ) : (
    <AuthProvider>
      <App />
    </AuthProvider>
  )
);
