const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export interface Document {
  id: string;
  title: string;
  content: string;
  url?: string;
  source: string;
  userId: string;
  dimensions: string[];
  createdAt: string;
  updatedAt: string;
}

class DocumentsApi {
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

  async findAll(): Promise<Document[]> {
    const response = await fetch(`${API_URL}/documents`, {
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to fetch documents');
    }

    return response.json();
  }
}

export const documentsApi = new DocumentsApi();

