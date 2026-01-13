const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export interface DuplicateResponseDto {
  id: string;
  userId: string;
  sourceDocumentId: string;
  targetDocumentId: string;
  sourceChunkIndex?: number;
  targetChunkIndex?: number;
  similarityScore: number;
  duplicateType: 'chunk' | 'document';
  createdAt: string;
  updatedAt: string;
}

class DuplicatesApi {
  private getToken(): string | null {
    return localStorage.getItem('auth_token');
  }

  private getHeaders(): Record<string, string> {
    const token = this.getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  async getDuplicatesForUser(userId: string): Promise<DuplicateResponseDto[]> {
    const response = await fetch(`${API_URL}/duplicates/user/${userId}`, {
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to fetch duplicates');
    }

    return response.json();
  }
}

export const duplicatesApi = new DuplicatesApi();
