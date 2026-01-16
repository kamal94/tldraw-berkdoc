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

class BoardsApi {

  async listBoards(): Promise<Board[]> {
    const response = await fetch(`${API_URL}/boards`, {
      headers: generateAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to fetch boards');
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
      throw new Error('Failed to create board');
    }

    return response.json();
  }

  async getBoard(id: string): Promise<Board> {
    const response = await fetch(`${API_URL}/boards/${id}`, {
      headers: generateAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to fetch board');
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
      throw new Error('Failed to update board');
    }

    return response.json();
  }

  async deleteBoard(id: string): Promise<{ success: boolean }> {
    const response = await fetch(`${API_URL}/boards/${id}`, {
      method: 'DELETE',
      headers: generateAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to delete board');
    }

    return response.json();
  }
}

export const boardsApi = new BoardsApi();
