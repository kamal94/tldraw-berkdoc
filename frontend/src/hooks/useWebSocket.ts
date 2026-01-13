import { useContext } from 'react';
import { WebSocketContext } from '../contexts/WebSocketContext';

/**
 * Hook to access the shared WebSocket connection.
 * 
 * @example
 * ```tsx
 * const { send, isConnected, subscribe } = useWebSocket();
 * 
 * useEffect(() => {
 *   const unsubscribe = subscribe('my-message-type', (message) => {
 *     console.log('Received:', message);
 *   });
 *   return unsubscribe;
 * }, [subscribe]);
 * 
 * const handleClick = () => {
 *   send({ type: 'my-action', data: 'hello' });
 * };
 * ```
 */
export function useWebSocket() {
  const context = useContext(WebSocketContext);
  
  if (!context) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  
  return context;
}
