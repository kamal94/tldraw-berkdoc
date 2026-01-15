import { useState, useEffect } from 'react';
import { getCachedAvatarUrl } from '../utils/avatarUrl';

/**
 * Check if URL is a Google avatar URL that needs caching
 * Returns true for Google user content URLs (lh3.googleusercontent.com, etc.)
 */
function isGoogleAvatarUrl(url: string): boolean {
  if (!url || typeof url !== 'string') {
    return false;
  }
  // Check for Google user content domains
  return (
    url.includes('googleusercontent.com') ||
    url.includes('google.com') ||
    url.includes('googleapis.com')
  );
}

/**
 * Hook to convert Google avatar URL to backend cached URL
 * Returns undefined while loading to prevent direct Google API calls
 */
export function useCachedAvatarUrl(
  googleUrl: string | undefined | null,
): string | undefined {
  // Always call hooks (Rules of Hooks)
  const [cachedUrl, setCachedUrl] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!googleUrl) {
      return;
    }

    // Only handle Google URLs (async case)
    // Non-Google URLs and undefined are handled synchronously in return
    if (!isGoogleAvatarUrl(googleUrl)) {
      return;
    }

    // If it's a Google URL, we MUST use the cached version
    // Don't return the original URL to prevent direct API calls
    getCachedAvatarUrl(googleUrl).then((url) => {
      setCachedUrl(url);
    });
  }, [googleUrl]);

  // Return cached URL for Google URLs, or direct URL for non-Google URLs
  if (!googleUrl) {
    return undefined;
  }

  if (!isGoogleAvatarUrl(googleUrl)) {
    return googleUrl;
  }

  return cachedUrl;
}
