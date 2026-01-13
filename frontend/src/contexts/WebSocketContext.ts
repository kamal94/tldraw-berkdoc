import { createContext } from 'react';

export interface WebSocketMessage {
  type: string;
  [key: string]: unknown;
}

export interface WebSocketContextValue {
  send: (message: WebSocketMessage) => void;
  isConnected: boolean;
  subscribe: (messageType: string, handler: (message: WebSocketMessage) => void) => () => void;
}

export const WebSocketContext = createContext<WebSocketContextValue | null>(null);
