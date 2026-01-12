// ALWAYS KEEP THIS FILE AS SIMPLE AS POSSIBLE. DO NOT FILL IT WITH IMPLEMENTATION DETAILS.
import { useMemo } from "react";
import { Tldraw } from "tldraw";
import "tldraw/tldraw.css";
import { DocumentShapeUtil } from "./shapes/DocumentShape";
import { AnimationProvider } from "./contexts/AnimationProvider";
import { AuthProvider } from "./contexts/AuthProvider";
import { useAuth } from "./hooks/useAuth";
import { ConfigPanel } from "./components/ConfigPanel";
import { SignInButton } from "./components/SignInButton";
import { useBoardSync } from "./hooks/useBoardSync";

const customShapeUtils = [DocumentShapeUtil];

// Component for authenticated users - uses sync
function AuthenticatedTldraw({ userId }: { userId: string }) {
  // Hooks must be called before any early returns
  const syncStore = useBoardSync(userId);

  // Check if token exists - show error if missing
  const token = localStorage.getItem("auth_token");
  if (!token) {
    return (
      <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", color: "#dc2626" }}>
          <div style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>Authentication Error</div>
          <div>Please sign in again</div>
        </div>
      </div>
    );
  }

  // If sync store is loading, show loading state
  if (syncStore?.status === "loading") {
    return (
      <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>Connecting...</div>
          <div style={{ color: "#666" }}>Syncing your board</div>
        </div>
      </div>
    );
  }

  // If sync store has error, show error state
  if (syncStore?.status === "error") {
    return (
      <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", color: "#dc2626" }}>
          <div style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>Connection Error</div>
          <div>{syncStore.error.message}</div>
          <button 
            onClick={() => window.location.reload()} 
            style={{ marginTop: "1rem", padding: "0.5rem 1rem", cursor: "pointer" }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Render tldraw with sync store when synced
  if (syncStore && syncStore.status === "synced-remote") {
    return (
      <Tldraw
        store={syncStore}
        shapeUtils={customShapeUtils}
        options={{
          maxShapesPerPage: 100 * 1000,
        }}
      />
    );
  }

  // Fallback to loading state
  return (
    <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>Connecting...</div>
        <div style={{ color: "#666" }}>Syncing your board</div>
      </div>
    </div>
  );
}

// Component for guest users - uses localStorage
function GuestTldraw() {
  const guestPersistenceKey = "berkdoc-guest";
  
  return (
    <Tldraw
      persistenceKey={guestPersistenceKey}
      shapeUtils={customShapeUtils}
      options={{
        maxShapesPerPage: 100 * 1000,
      }}
    />
  );
}

function AppContents() {
  const { user, isAuthenticated } = useAuth();
  
  // Memoize userId to prevent unnecessary re-renders
  const userId = useMemo(() => (isAuthenticated ? user?.id : undefined), [isAuthenticated, user?.id]);
  
  return (
    <div style={{ position: "fixed", inset: 0 }}>
      {isAuthenticated && userId ? (
        <AuthenticatedTldraw userId={userId} />
      ) : (
        <GuestTldraw />
      )}
      <ConfigPanel />
      <SignInButton />
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <AnimationProvider>
        <AppContents />
      </AnimationProvider>
    </AuthProvider>
  );
}

export default App;
