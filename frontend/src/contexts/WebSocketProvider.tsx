import { useState, useEffect, useRef, useCallback, useMemo, type ReactNode } from 'react';
import { WebSocketContext, type WebSocketMessage } from './WebSocketContext';

const APP_WS_URL = import.meta.env.VITE_APP_WS_URL || 'ws://localhost:3002';

/**
 * Get the auth token from localStorage
 */
function getAuthToken(): string | null {
  return localStorage.getItem('auth_token');
}

type MessageHandler = (message: WebSocketMessage) => void;

/**
 * Provider that manages a shared WebSocket connection for the application.
 * Handles connection, reconnection, and message routing to subscribers.
 */
export function WebSocketProvider({ children }: { children: ReactNode }) {
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const handlersRef = useRef<Map<string, Set<MessageHandler>>>(new Map());
  const connectRef = useRef<(() => void) | null>(null);
  const maxReconnectAttempts = 5;

  const connect = useCallback(() => {
    const token = getAuthToken();
    if (!token) {
      return;
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return; // Already connected
    }

    try {
      const uri = `${APP_WS_URL}?token=${encodeURIComponent(token)}`;
      const ws = new WebSocket(uri);

      ws.onopen = () => {
        console.log('WebSocket connected');
        setIsConnected(true);
        reconnectAttemptsRef.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          const handlers = handlersRef.current.get(message.type);
          if (handlers) {
            handlers.forEach((handler) => {
              try {
                handler(message);
              } catch (err) {
                console.error(`Error in message handler for type "${message.type}":`, err);
              }
            });
          }
        } catch (err) {
          console.error('Error parsing WebSocket message:', err);
        }
      };

      ws.onerror = (err) => {
        console.error('WebSocket error:', err);
      };

      ws.onclose = () => {
        console.log('WebSocket closed');
        setIsConnected(false);
        wsRef.current = null;

        // Attempt to reconnect if not manually closed
        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current++;
          reconnectTimeoutRef.current = window.setTimeout(() => {
            connectRef.current?.();
          }, 1000 * reconnectAttemptsRef.current); // Exponential backoff
        }
      };

      wsRef.current = ws;
    } catch (err) {
      console.error('Error creating WebSocket connection:', err);
    }
  }, []);

  // Store connect function in ref so it can be called recursively
  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
  }, []);

  const send = useCallback((message: WebSocketMessage) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.error('WebSocket not connected');
      throw new Error('WebSocket not connected');
    }

    try {
      wsRef.current.send(JSON.stringify(message));
    } catch (err) {
      console.error('Error sending WebSocket message:', err);
      throw err;
    }
  }, []);

  const subscribe = useCallback(
    (messageType: string, handler: MessageHandler) => {
      if (!handlersRef.current.has(messageType)) {
        handlersRef.current.set(messageType, new Set());
      }
      handlersRef.current.get(messageType)!.add(handler);

      // Return unsubscribe function
      return () => {
        const handlers = handlersRef.current.get(messageType);
        if (handlers) {
          handlers.delete(handler);
          if (handlers.size === 0) {
            handlersRef.current.delete(messageType);
          }
        }
      };
    },
    []
  );

  // Connect on mount and when auth token changes
  useEffect(() => {
    const token = getAuthToken();
    if (token) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  // Reconnect when auth token changes
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'auth_token') {
        disconnect();
        if (e.newValue) {
          // Small delay to ensure token is set
          setTimeout(() => {
            connect();
          }, 100);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [connect, disconnect]);

  const contextValue = useMemo(
    () => ({
      send,
      isConnected,
      subscribe,
    }),
    [send, isConnected, subscribe]
  );

  return <WebSocketContext.Provider value={contextValue}>{children}</WebSocketContext.Provider>;
}
