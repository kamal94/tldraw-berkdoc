import { useMemo } from "react";
import { useSync } from "@tldraw/sync";
import type { TLStoreWithStatus, TLAsset, TLUserPreferences } from "tldraw";
import { defaultShapeUtils, defaultBindingUtils } from "tldraw";
import { DocumentShapeUtil } from "../shapes/DocumentShape";
import { getAuthToken } from "../api/api-utils";

const WS_URL = import.meta.env.VITE_WS_URL || "ws://localhost:3001";

/**
 * Build WebSocket URI with authentication token and board ID
 */
function buildWebSocketUri(boardId: string): string | null {
  const token = getAuthToken();
  if (!token) return null;

  return `${WS_URL}?token=${encodeURIComponent(token)}&boardId=${encodeURIComponent(boardId)}`;
}

/**
 * Create assets handler for tldraw
 */
function createAssetsHandler() {
  return {
    upload: async (_asset: unknown, file: File): Promise<{ src: string }> => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          resolve({ src: reader.result as string });
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    },
    resolve: (asset: TLAsset): string | null => {
      return (asset as { props?: { src?: string | null } }).props?.src ?? null;
    },
  };
}

/**
 * Hook to sync tldraw store with the server via WebSocket.
 * Returns a store that can be passed to the Tldraw component.
 * Returns null when boardId is missing or not authenticated.
 *
 * @param boardId - The active board ID (required for sync)
 * @param userInfo - The user preferences/info to pass to sync (optional)
 */
export function useBoardSync(
  boardId: string | undefined,
  userInfo?: Pick<TLUserPreferences, 'id' | 'name' | 'color' | 'colorScheme'>
): TLStoreWithStatus | null {
  const uri = useMemo(() => {
    if (!boardId) return null;
    return buildWebSocketUri(boardId);
  }, [boardId]);

  const shapeUtils = useMemo(
    () => [DocumentShapeUtil, ...defaultShapeUtils],
    []
  );

  const bindingUtils = useMemo(() => [...defaultBindingUtils], []);

  const assets = useMemo(() => createAssetsHandler(), []);

  const syncConfig = useMemo(() => {
    if (!uri) return null;

    return {
      uri,
      shapeUtils,
      bindingUtils,
      assets,
      ...(userInfo && { userInfo }),
    };
  }, [uri, shapeUtils, bindingUtils, assets, userInfo]);

  // Always call useSync hook (React hooks must be called unconditionally)
  // Pass a dummy config if uri is null - useSync will handle the error state
  const store = useSync(
    syncConfig ?? {
      uri: '',
      shapeUtils,
      bindingUtils,
      assets,
    }
  );

  // Return null if we don't have a valid URI, otherwise return the store
  if (!uri) {
    return null;
  }

  return store as unknown as TLStoreWithStatus;
}
