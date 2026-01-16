import { useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import { authApi } from '../api/auth';
import type { User, LoginCredentials, RegisterCredentials } from '../api/auth';
import { AuthContext } from './AuthContext';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check for existing auth on mount
  useEffect(() => {
    const checkAuth = async () => {
      // Handle OAuth callback first
      const params = new URLSearchParams(window.location.search);
      const token = params.get('token');
      if (token) {
        localStorage.setItem('auth_token', token);
        // Clean URL immediately to prevent re-processing on re-render
        window.history.replaceState({}, '', window.location.pathname);
        // Small delay to ensure token is saved before fetching user
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      if (authApi.isAuthenticated()) {
        const currentUser = await authApi.getCurrentUser();
        // Only set user if we got a valid user, otherwise keep stored user if available
        if (currentUser) {
          setUser(currentUser);
        } else {
          // Fallback to stored user if API call failed but token exists
          const storedUser = authApi.getStoredUser();
          if (storedUser) {
            setUser(storedUser);
          }
        }
      }
      setIsLoading(false);
    };

    checkAuth();
  }, []);

  const login = useCallback(async (credentials: LoginCredentials) => {
    const response = await authApi.login(credentials);
    setUser(response.user);
  }, []);

  const register = useCallback(async (credentials: RegisterCredentials) => {
    const response = await authApi.register(credentials);
    setUser(response.user);
  }, []);

  const logout = useCallback(() => {
    authApi.logout();
    setUser(null);
  }, []);

  const loginWithGoogle = useCallback(() => {
    window.location.href = authApi.getGoogleAuthUrl();
  }, []);

  // Memoize context value to prevent unnecessary re-renders
  const contextValue = useMemo(
    () => ({
      user,
      isLoading,
      isAuthenticated: !!user,
      login,
      register,
      logout,
      loginWithGoogle,
    }),
    [user, isLoading, login, register, logout, loginWithGoogle]
  );

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

