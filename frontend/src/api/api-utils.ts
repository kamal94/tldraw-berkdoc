/**
 * Shared utilities for API classes
 */
export function getAuthToken(): string | null {
  return localStorage.getItem('auth_token');
}

export function generateAuthHeaders(): Record<string, string> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}
