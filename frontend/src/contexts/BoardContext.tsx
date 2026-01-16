import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { boardsApi, type Board } from '../api/boards';
import { useAuth } from '../hooks/useAuth';
import { BoardContext } from './BoardContext.types';

export function BoardProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [boards, setBoards] = useState<Board[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshBoards = useCallback(async () => {
    if (!isAuthenticated) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await boardsApi.listBoards();
      setBoards(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load boards');
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      setBoards([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    void refreshBoards();
  }, [isAuthenticated, refreshBoards]);

  const createBoard = useCallback(async (name?: string) => {
    const board = await boardsApi.createBoard(name);
    setBoards((prev) => [board, ...prev]);
    return board;
  }, []);

  const updateBoard = useCallback(async (id: string, name?: string) => {
    const board = await boardsApi.updateBoard(id, name);
    setBoards((prev) => prev.map((item) => (item.id === id ? board : item)));
    return board;
  }, []);

  const deleteBoard = useCallback(async (id: string) => {
    await boardsApi.deleteBoard(id);
    setBoards((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const value = useMemo(
    () => ({
      boards,
      isLoading,
      error,
      refreshBoards,
      createBoard,
      updateBoard,
      deleteBoard,
    }),
    [boards, isLoading, error, refreshBoards, createBoard, updateBoard, deleteBoard],
  );

  return <BoardContext.Provider value={value}>{children}</BoardContext.Provider>;
}
