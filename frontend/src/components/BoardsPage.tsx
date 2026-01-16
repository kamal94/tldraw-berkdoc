import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useBoards } from '../hooks/useBoards';
import { useAuth } from '../hooks/useAuth';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent, CardFooter } from './ui/card';
import { AuthModal } from './AuthModal';
import { RenameBoardDialog } from './RenameBoardDialog';
import { DeleteBoardDialog } from './DeleteBoardDialog';
import { LoadingState } from './ui/loading-state';

export function BoardsPage() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { boards, isLoading, error, createBoard, updateBoard, deleteBoard } = useBoards();
  const [name, setName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [renameBoardId, setRenameBoardId] = useState<string | null>(null);
  const [deleteBoardId, setDeleteBoardId] = useState<string | null>(null);

  if (authLoading) {
    return <LoadingState message="Loading..." />;
  }

  if (!isAuthenticated) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="text-lg font-semibold text-slate-900">Sign in to manage your boards.</div>
          <Button className="mt-4" onClick={() => setIsAuthModalOpen(true)}>
            Sign in
          </Button>
          <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
        </div>
      </div>
    );
  }

  const handleCreate = async () => {
    if (!name.trim()) return;
    setIsCreating(true);
    try {
      const board = await createBoard(name.trim());
      setName('');
      navigate(`/board/${board.id}`);
    } finally {
      setIsCreating(false);
    }
  };

  const handleRenameClick = (boardId: string) => {
    setRenameBoardId(boardId);
  };

  const handleRenameConfirm = async (newName: string) => {
    if (!renameBoardId) return;
    await updateBoard(renameBoardId, newName);
    setRenameBoardId(null);
  };

  const handleDeleteClick = (boardId: string) => {
    setDeleteBoardId(boardId);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteBoardId) return;
    await deleteBoard(deleteBoardId);
    setDeleteBoardId(null);
  };

  return (
    <div className="fixed inset-0 bg-slate-50">
      <div className="mx-auto flex h-full w-full max-w-5xl flex-col gap-6 px-6 py-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Boards</h1>
            <p className="text-sm text-slate-500">Create and switch between boards.</p>
          </div>
          <div className="flex items-center gap-2">
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="New board name"
              className="h-10 w-56"
            />
            <Button onClick={handleCreate} disabled={isCreating || !name.trim()}>
              Create
            </Button>
          </div>
        </div>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="text-sm text-slate-500">Loading boards...</div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {boards.map((board) => (
              <Card key={board.id}>
                <CardContent className="pt-4">
                  <button
                    onClick={() => navigate(`/board/${board.id}`)}
                    className="w-full text-left"
                  >
                    <div className="text-base font-semibold text-slate-900">{board.name}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      Updated {new Date(board.updatedAt).toLocaleString()}
                    </div>
                  </button>
                </CardContent>
                <CardFooter className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRenameClick(board.id)}
                  >
                    Rename
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => handleDeleteClick(board.id)}>
                    Delete
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </div>

      {renameBoardId && (
        <RenameBoardDialog
          isOpen={!!renameBoardId}
          currentName={boards.find((b) => b.id === renameBoardId)?.name || ''}
          onClose={() => setRenameBoardId(null)}
          onConfirm={handleRenameConfirm}
        />
      )}

      {deleteBoardId && (
        <DeleteBoardDialog
          isOpen={!!deleteBoardId}
          boardName={boards.find((b) => b.id === deleteBoardId)?.name || ''}
          onClose={() => setDeleteBoardId(null)}
          onConfirm={handleDeleteConfirm}
        />
      )}
    </div>
  );
}
