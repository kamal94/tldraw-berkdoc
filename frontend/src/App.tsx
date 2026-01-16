// ALWAYS KEEP THIS FILE AS SIMPLE AS POSSIBLE. DO NOT FILL IT WITH IMPLEMENTATION DETAILS.
import { useMemo, useState, useEffect } from "react";
import { createBrowserRouter, Navigate, RouterProvider, useParams, useNavigate } from "react-router";
import { Tldraw, type TLComponents, useTldrawUser, type TLUserPreferences } from "tldraw";
import "tldraw/tldraw.css";
import { DocumentShapeUtil } from "./shapes/DocumentShape";
import { AnimationProvider } from "./contexts/AnimationProvider";
import { AuthProvider } from "./contexts/AuthProvider";
import { WebSocketProvider } from "./contexts/WebSocketProvider";
import { OnboardingProvider } from "./contexts/OnboardingProvider";
import { BoardProvider } from "./contexts/BoardContext";
import { useAuth } from "./hooks/useAuth";
import { ConfigPanel } from "./components/ConfigPanel";
import { SmartExplorer } from "./components/SmartExplorer";
import { SharePanel } from "./components/SharePanel";
import { DuplicatesPage } from "./components/DuplicatesPage";
import { OnboardingWizard } from "./components/onboarding/OnboardingWizard";
import { useBoardSync } from "./hooks/useBoardSync";
import { BoardsPage } from "./components/BoardsPage";
import { BoardMainMenu } from "./components/BoardActionsMenu";
import { AuthModal } from "./components/AuthModal";
import { Button } from "./components/ui/button";
import { LoadingState, ErrorState } from "./components/ui/loading-state";

const customShapeUtils = [DocumentShapeUtil];

// Component for authenticated users - uses sync
function AuthenticatedTldraw({
  boardId,
  userId,
  userName,
  components,
}: {
  boardId: string;
  userId: string;
  userName: string;
  components: TLComponents;
}) {
  // Create user preferences for tldraw presence
  const [userPreferences, setUserPreferences] = useState<TLUserPreferences>(() => {
    return {
      id: userId,
      name: userName,
      color: "#1a73e8", // Same blue as app's primary color
      colorScheme: "light",
    };
  });

  // Hooks must be called before any early returns
  // Pass userInfo to sync (subset of userPreferences as per tutorial)
  const syncStore = useBoardSync(boardId, userPreferences);

  // Create TLUser object using useTldrawUser hook
  const user = useTldrawUser({ userPreferences, setUserPreferences });

  // Check if token exists - show error if missing
  const token = localStorage.getItem("auth_token");
  if (!token) {
    return <ErrorState title="Authentication Error" message="Please sign in again" />;
  }

  // If sync store is loading, show loading state
  if (syncStore?.status === "loading") {
    return <LoadingState message="Connecting..." />;
  }

  // If sync store has error, show error state
  if (syncStore?.status === "error") {
    return (
      <ErrorState
        title="Connection Error"
        message={syncStore.error.message}
        onRetry={() => window.location.reload()}
      />
    );
  }

  // Render tldraw with sync store when synced
  if (syncStore && syncStore.status === "synced-remote") {
    return (
      <Tldraw
        store={syncStore}
        shapeUtils={customShapeUtils}
        components={components}
        user={user}
        options={{
          maxShapesPerPage: 100 * 1000,
        }}
      />
    );
  }

  // Fallback to loading state
  return <LoadingState message="Connecting..." />;
}

function AuthCallbackRoute() {
  const navigate = useNavigate();
  const { isLoading } = useAuth();

  useEffect(() => {
    // Wait for auth to complete before redirecting
    if (!isLoading) {
      // Small delay to ensure state updates are propagated
      const timer = setTimeout(() => {
        navigate('/', { replace: true });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isLoading, navigate]);

  return <LoadingState message="Completing sign in..." />;
}

function BoardRoute() {
  const { boardId } = useParams();
  const { user, isAuthenticated } = useAuth();
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  const components: TLComponents = useMemo(
    () => ({
      SharePanel: () => <SharePanel onViewDuplicates={() => setShowDuplicates(true)} />,
      MainMenu: BoardMainMenu,
    }),
    [setShowDuplicates]
  );

  if (!boardId) {
    return <Navigate to="/" replace />;
  }

  if (!isAuthenticated || !user) {
    return (
      <>
        <div className="fixed inset-0 flex items-center justify-center bg-slate-50">
          <div className="text-center">
            <div className="text-lg font-semibold text-slate-900">Sign in to access this board</div>
            <Button className="mt-4" onClick={() => setIsAuthModalOpen(true)}>
              Sign in
            </Button>
          </div>
        </div>
        <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
      </>
    );
  }

  if (showDuplicates) {
    return (
      <div className="fixed inset-0">
        <DuplicatesPage onBack={() => setShowDuplicates(false)} />
      </div>
    );
  }

  return (
    <div className="fixed inset-0">
      <AuthenticatedTldraw
        boardId={boardId}
        userId={user.id}
        userName={user.name}
        components={components}
      />
      <ConfigPanel />
      <SmartExplorer />
      <OnboardingWizard />
    </div>
  );
}

function App() {
  const router = createBrowserRouter([
    { path: "/", element: <BoardsPage /> },
    { path: "/auth/callback", element: <AuthCallbackRoute /> },
    { path: "/board/:boardId", element: <BoardRoute /> },
    { path: "*", element: <Navigate to="/" replace /> },
  ]);

  return (
    <AuthProvider>
      <WebSocketProvider>
        <OnboardingProvider>
          <AnimationProvider>
            <BoardProvider>
              <RouterProvider router={router} />
            </BoardProvider>
          </AnimationProvider>
        </OnboardingProvider>
      </WebSocketProvider>
    </AuthProvider>
  );
}

export default App;
