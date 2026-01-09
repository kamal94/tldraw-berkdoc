const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

class DriveApi {
  private getToken(): string | null {
    return localStorage.getItem('auth_token');
  }

  async syncGoogleDrive(): Promise<{ message: string }> {
    const token = this.getToken();
    if (!token) throw new Error('Not authenticated');

    const response = await fetch(`${API_URL}/google-drive/sync`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to trigger sync');
    }

    return response.json();
  }
}

export const driveApi = new DriveApi();

