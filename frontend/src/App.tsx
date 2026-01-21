// ALWAYS KEEP THIS FILE AS SIMPLE AS POSSIBLE. DO NOT FILL IT WITH IMPLEMENTATION DETAILS.
import { useMemo, useState, useEffect } from "react";
import { createBrowserRouter, Navigate, RouterProvider, useParams, useNavigate } from "react-router";
import { Tldraw, type TLComponents, useTldrawUser, type TLUserPreferences, type TLStoreWithStatus } from "tldraw";
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
import { LoadingState, ErrorState, UnauthorizedState } from "./components/ui/loading-state";
import { boardsApi, type Board } from "./api/boards";
import { isUnauthorizedError, createUserPreferences } from "./utils/board-utils";

const customShapeUtils = [DocumentShapeUtil];

/**
 * Component for authenticated users - renders tldraw with sync store
 * Assumes syncStore is already validated and ready (status === "synced-remote")
 */
function AuthenticatedTldraw({
  syncStore,
  userId,
  userName,
  components,
}: {
  syncStore: TLStoreWithStatus;
  userId: string;
  userName: string;
  components: TLComponents;
}) {
  const [userPreferences, setUserPreferences] = useState<TLUserPreferences>(() =>
    createUserPreferences(userId, userName)
  );

  const user = useTldrawUser({ userPreferences, setUserPreferences });

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

/**
 * Hook to load board data
 */
function useBoardLoader(boardId: string | undefined) {
  const [board, setBoard] = useState<Board | null>(null);
  const [boardError, setBoardError] = useState<unknown>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!boardId) return;

    let isActive = true;

    const loadBoard = async () => {
      setIsLoading(true);
      setBoardError(null);
      setBoard(null);

      try {
        const data = await boardsApi.getBoard(boardId);
        if (!isActive) return;
        setBoard(data);
      } catch (error) {
        if (!isActive) return;
        setBoardError(error);
        setBoard(null);
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    };

    void loadBoard();
    return () => {
      isActive = false;
    };
  }, [boardId]);

  return { board, boardError, isLoading };
}

/**
 * Render unauthorized state with optional sign-in action
 */
function UnauthorizedView({ isAuthenticated }: { isAuthenticated: boolean }) {
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  const handleSignIn = () => {
    setIsAuthModalOpen(true);
  };

  return (
    <>
      <UnauthorizedState
        title={isAuthenticated ? "Unauthorized access" : "Sign in required"}
        message={
          isAuthenticated
            ? "You don't have access to this board."
            : "Please sign in to access this board."
        }
        actionLabel={isAuthenticated ? undefined : "Sign in"}
        onAction={isAuthenticated ? undefined : handleSignIn}
      />
      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
    </>
  );
}

function BoardRoute() {
  const { boardId } = useParams();
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const [showDuplicates, setShowDuplicates] = useState(false);
  const { board, boardError, isLoading: isBoardLoading } = useBoardLoader(boardId);

  const components: TLComponents = useMemo(
    () => ({
      SharePanel: () => <SharePanel onViewDuplicates={() => setShowDuplicates(true)} />,
      MainMenu: BoardMainMenu,
    }),
    []
  );

  if (!boardId) {
    return <Navigate to="/" replace />;
  }

  if (isBoardLoading || isAuthLoading) {
    return <LoadingState message="Loading board..." />;
  }

  if (boardError && isUnauthorizedError(boardError)) {
    return <UnauthorizedView isAuthenticated={isAuthenticated} />;
  }

  if (boardError) {
    const errorMessage =
      boardError instanceof Error ? boardError.message : "Please try again";
    return (
      <ErrorState
        title="Unable to load board"
        message={errorMessage}
        onRetry={() => window.location.reload()}
      />
    );
  }

  if (!board) {
    return (
      <ErrorState
        title="Unable to load board"
        message="Board data is unavailable. Please try again."
        onRetry={() => window.location.reload()}
      />
    );
  }

  if (!isAuthenticated || !user) {
    return <UnauthorizedView isAuthenticated={false} />;
  }

  if (showDuplicates) {
    return (
      <div className="fixed inset-0">
        <DuplicatesPage onBack={() => setShowDuplicates(false)} />
      </div>
    );
  }

  return (
    <BoardWithSync boardId={boardId} user={user} components={components} />
  );
}

/**
 * Component that handles sync initialization - only rendered when we have board and user
 */
function BoardWithSync({
  boardId,
  user,
  components,
}: {
  boardId: string;
  user: { id: string; name: string };
  components: TLComponents;
}) {
  const userPreferences = useMemo(
    () => createUserPreferences(user.id, user.name),
    [user.id, user.name]
  );

  const syncStore = useBoardSync(boardId, userPreferences);

  if (!syncStore) {
    return <LoadingState message="Connecting..." />;
  }

  if (syncStore.status === "loading") {
    return <LoadingState message="Loading board..." />;
  }

  if (syncStore.status === "error") {
    return (
      <ErrorState
        title="Connection Error"
        message={syncStore.error.message}
        onRetry={() => window.location.reload()}
      />
    );
  }

  if (syncStore.status !== "synced-remote") {
    return <LoadingState message="Loading board..." />;
  }

  return (
    <div className="fixed inset-0">
      <AuthenticatedTldraw
        syncStore={syncStore}
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
