import { generateAuthHeaders } from './api-utils';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export interface Board {
  id: string;
  userId: string;
  name: string;
  snapshot?: string | null;
  createdAt: string;
  updatedAt: string;
}

export class BoardsApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'BoardsApiError';
    this.status = status;
  }
}

class BoardsApi {
  async listBoards(): Promise<Board[]> {
    const response = await fetch(`${API_URL}/boards`, {
      headers: generateAuthHeaders(),
    });

    if (!response.ok) {
      throw new BoardsApiError('Failed to fetch boards', response.status);
    }

    return response.json();
  }

  async createBoard(name?: string): Promise<Board> {
    const response = await fetch(`${API_URL}/boards`, {
      method: 'POST',
      headers: generateAuthHeaders(),
      body: JSON.stringify({ name }),
    });

    if (!response.ok) {
      throw new BoardsApiError('Failed to create board', response.status);
    }

    return response.json();
  }

  async getBoard(id: string): Promise<Board> {
    const response = await fetch(`${API_URL}/boards/${id}`, {
      headers: generateAuthHeaders(),
    });

    if (!response.ok) {
      throw new BoardsApiError('Failed to fetch board', response.status);
    }

    return response.json();
  }

  async updateBoard(id: string, name?: string): Promise<Board> {
    const response = await fetch(`${API_URL}/boards/${id}`, {
      method: 'PATCH',
      headers: generateAuthHeaders(),
      body: JSON.stringify({ name }),
    });

    if (!response.ok) {
      throw new BoardsApiError('Failed to update board', response.status);
    }

    return response.json();
  }

  async deleteBoard(id: string): Promise<{ success: boolean }> {
    const response = await fetch(`${API_URL}/boards/${id}`, {
      method: 'DELETE',
      headers: generateAuthHeaders(),
    });

    if (!response.ok) {
      throw new BoardsApiError('Failed to delete board', response.status);
    }

    return response.json();
  }
}

export const boardsApi = new BoardsApi();
