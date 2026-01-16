import { createContext } from 'react';
import type { Board } from '../api/boards';

export type BoardContextType = {
  boards: Board[];
  isLoading: boolean;
  error: string | null;
  refreshBoards: () => Promise<void>;
  createBoard: (name?: string) => Promise<Board>;
  updateBoard: (id: string, name?: string) => Promise<Board>;
  deleteBoard: (id: string) => Promise<void>;
};

export const BoardContext = createContext<BoardContextType | null>(null);
