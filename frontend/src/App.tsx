// ALWAYS KEEP THIS FILE AS SIMPLE AS POSSIBLE. DO NOT FILL IT WITH IMPLEMENTATION DETAILS.
import { Tldraw } from "tldraw";
import "tldraw/tldraw.css";
import { DocumentShapeUtil } from "./shapes/DocumentShape";
import { AnimationProvider } from "./contexts/AnimationProvider";
import { AuthProvider } from "./contexts/AuthProvider";
import { useAuth } from "./hooks/useAuth";
import { ConfigPanel } from "./components/ConfigPanel";
import { SignInButton } from "./components/SignInButton";
import { useDocumentLoader } from "./hooks/useDocumentLoader";

const customShapeUtils = [DocumentShapeUtil];

function AppContents() {
  const { user, isAuthenticated } = useAuth();
  const { handleEditorMount } = useDocumentLoader(isAuthenticated, user?.id);

  const persistenceKey = isAuthenticated && user 
    ? `berkdoc-user-${user.id}` 
    : "berkdoc-guest";

  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <Tldraw
        key={persistenceKey}
        persistenceKey={persistenceKey}
        shapeUtils={customShapeUtils}
        onMount={handleEditorMount}
        options={{
          maxShapesPerPage: 100 * 1000,
        }}
      />
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
