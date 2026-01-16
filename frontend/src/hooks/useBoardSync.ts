import { useMemo } from "react";
import { useSync } from "@tldraw/sync";
import type { TLStoreWithStatus, TLAsset, TLAssetContext, TLUserPreferences } from "tldraw";
import { defaultShapeUtils, defaultBindingUtils } from "tldraw";
import { DocumentShapeUtil } from "../shapes/DocumentShape";

const WS_URL = import.meta.env.VITE_WS_URL || "ws://localhost:3001";

/**
 * Get the auth token from localStorage
 */
function getAuthToken(): string | null {
  return localStorage.getItem("auth_token");
}

/**
 * Hook to sync tldraw store with the server via WebSocket.
 * Returns a store that can be passed to the Tldraw component.
 * Returns null when not authenticated (use localStorage persistence instead).
 *
 * @param userId - The authenticated user's ID (undefined if not authenticated)
 * @param userInfo - The user preferences/info to pass to sync (optional)
 */
export function useBoardSync(
  userId: string | undefined,
  userInfo?: Pick<TLUserPreferences, 'id' | 'name' | 'color' | 'colorScheme'>
): TLStoreWithStatus | null {
  // Build the WebSocket URI with auth token - memoize based on userId
  const uri = useMemo(() => {
    if (!userId) return null;

    const token = getAuthToken();
    if (!token) return null;

    return `${WS_URL}?token=${encodeURIComponent(token)}`;
  }, [userId]);

  // Memoize shapeUtils - must include default utils for proper migration support
  const shapeUtils = useMemo(
    () => [DocumentShapeUtil, ...defaultShapeUtils],
    []
  );

  // Include default binding utils for arrow bindings, etc.
  const bindingUtils = useMemo(() => [...defaultBindingUtils], []);

  // Memoize the assets object to prevent recreation on every render
  const assets = useMemo(
    () => ({
      upload: async (_asset: unknown, file: File): Promise<{ src: string }> => {
        // For now, store assets as base64 inline
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            resolve({ src: reader.result as string });
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      },
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      resolve: (asset: TLAsset, _ctx: TLAssetContext): string | null => {
        return (asset as { props?: { src?: string | null } }).props?.src ?? null;
      },
    }),
    []
  );

  // Memoize the sync config to prevent recreation on every render
  // Note: uri should never be null when this hook is called (only called from AuthenticatedTldraw)
  // We use non-null assertion since App.tsx ensures this hook is only called when authenticated
  const syncConfig = useMemo(
    () => ({
      uri: uri!,
      shapeUtils,
      bindingUtils,
      assets,
      ...(userInfo && { userInfo }),
    }),
    [uri, shapeUtils, bindingUtils, assets, userInfo]
  );

  // Call useSync with the config
  // Note: This hook should only be called when authenticated (uri is not null)
  // App.tsx ensures this by conditionally rendering AuthenticatedTldraw component
  const store = useSync(syncConfig);

  // Type assertion for cross-package compatibility
  return store as unknown as TLStoreWithStatus;
}
