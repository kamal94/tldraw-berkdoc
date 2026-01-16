import { useContext } from 'react';
import { BoardContext } from '../contexts/BoardContext.types';

export function useBoards() {
  const context = useContext(BoardContext);
  if (!context) {
    throw new Error('useBoards must be used within a BoardProvider');
  }
  return context;
}
