import { useState, useEffect, useRef, useCallback } from "react";
import { useWebSocket } from "./useWebSocket";
import type { WebSocketMessage } from "../contexts/WebSocketContext";

interface SmartExplorerStartedMessage {
  type: "smart-explorer-started";
  jobId: string;
  [key: string]: unknown;
}

interface SmartExplorerCompleteMessage {
  type: "smart-explorer-complete";
  jobId: string;
  success: boolean;
  count?: number;
  error?: string;
  [key: string]: unknown;
}

function isSmartExplorerStartedMessage(
  message: WebSocketMessage
): message is SmartExplorerStartedMessage {
  return message.type === "smart-explorer-started" && typeof message.jobId === "string";
}

function isSmartExplorerCompleteMessage(
  message: WebSocketMessage
): message is SmartExplorerCompleteMessage {
  return (
    message.type === "smart-explorer-complete" &&
    typeof message.jobId === "string" &&
    typeof message.success === "boolean"
  );
}

export interface UseSmartExplorerReturn {
  explore: (query: string, limit?: number) => void;
  jobId: string | null;
  status: "idle" | "processing" | "success" | "error";
  count: number | null;
  error: string | null;
  reset: () => void;
}

/**
 * Hook to manage Smart Explorer functionality using the shared WebSocket connection.
 * This hook subscribes to smart-explorer messages and provides a simple API for exploring documents.
 */
export function useSmartExplorer(): UseSmartExplorerReturn {
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "processing" | "success" | "error">("idle");
  const [count, setCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { send, isConnected, subscribe } = useWebSocket();
  const currentJobIdRef = useRef<string | null>(null);

  // Subscribe to smart-explorer messages
  useEffect(() => {
    const unsubscribeStarted = subscribe("smart-explorer-started", (message) => {
      if (!isSmartExplorerStartedMessage(message)) return;
      currentJobIdRef.current = message.jobId;
      setJobId(message.jobId);
      setStatus("processing");
      setError(null);
    });

    const unsubscribeComplete = subscribe("smart-explorer-complete", (message) => {
      if (!isSmartExplorerCompleteMessage(message)) return;
      if (message.jobId !== currentJobIdRef.current) return;

      if (message.success) {
        setStatus("success");
        setCount(message.count ?? 0);
        setError(null);
      } else {
        setStatus("error");
        setError(message.error || "Unknown error occurred");
        setCount(null);
      }

    });

    return () => {
      unsubscribeStarted();
      unsubscribeComplete();
    };
  }, [subscribe]);

  const explore = useCallback(
    (query: string, limit?: number) => {
      if (!isConnected) {
        console.error("WebSocket not connected");
        setError("Not connected to server");
        setStatus("error");
        return;
      }

      // Reset state
      currentJobIdRef.current = null;
      setStatus("processing");
      setError(null);
      setCount(null);
      setJobId(null);

      // Send message
      try {
        send({
          type: "smart-explorer",
          query,
          limit,
        });
      } catch (err) {
        console.error("Error sending smart explorer message:", err);
        setError("Failed to send request");
        setStatus("error");
      }
    },
    [send, isConnected]
  );

  const reset = useCallback(() => {
    currentJobIdRef.current = null;
    setJobId(null);
    setStatus("idle");
    setCount(null);
    setError(null);
  }, []);

  return {
    explore,
    jobId,
    status,
    count,
    error,
    reset,
  };
}
