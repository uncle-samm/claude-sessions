import ReactDOM from "react-dom/client";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ConvexUserProvider } from "./hooks/useConvexUser";
import App from "./App";

// Initialize Convex client
const convexUrl = import.meta.env.VITE_CONVEX_URL;
if (!convexUrl) {
  console.warn("VITE_CONVEX_URL not set, Convex features will be disabled");
}

const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  convex ? (
    <ConvexProvider client={convex}>
      <ConvexUserProvider>
        <App />
      </ConvexUserProvider>
    </ConvexProvider>
  ) : (
    <App />
  )
);
