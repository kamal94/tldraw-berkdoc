import { BoardsApiError } from '../api/boards';

/**
 * Check if an error is an unauthorized/forbidden/not found error
 */
export function isUnauthorizedError(error: unknown): boolean {
  if (!(error instanceof BoardsApiError)) return false;
  return error.status === 401 || error.status === 403 || error.status === 404;
}

/**
 * Create default user preferences for tldraw
 */
export function createUserPreferences(
  userId: string,
  userName: string
): { id: string; name: string; color: string; colorScheme: 'light' } {
  return {
    id: userId,
    name: userName,
    color: '#1a73e8', // Same blue as app's primary color
    colorScheme: 'light',
  };
}
