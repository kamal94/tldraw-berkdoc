import { createContext } from 'react';
import type { User, LoginCredentials, RegisterCredentials } from '../api/auth';

export interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (credentials: LoginCredentials) => Promise<void>;
  register: (credentials: RegisterCredentials) => Promise<void>;
  logout: () => void;
  loginWithGoogle: () => void;
}

export const AuthContext = createContext<AuthContextType | null>(null);

