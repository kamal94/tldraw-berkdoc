/**
 * Utility to convert Google avatar URLs to backend cached URLs
 */

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

/**
 * Generate SHA-256 hash of a string (same algorithm as backend)
 */
async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

/**
 * Check if URL is a Google avatar URL that needs caching
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
 * Convert Google avatar URL to backend cached avatar URL
 * @param googleUrl The original Google avatar URL (e.g., from lh3.googleusercontent.com)
 * @returns Backend cached avatar URL, or undefined if input is invalid
 */
export async function getCachedAvatarUrl(
  googleUrl: string | undefined | null,
): Promise<string | undefined> {
  if (!googleUrl || !googleUrl.startsWith('http')) {
    return undefined;
  }

  // Only cache Google URLs - return others as-is
  if (!isGoogleAvatarUrl(googleUrl)) {
    return googleUrl;
  }

  try {
    const hash = await sha256(googleUrl);
    // Include original URL as query parameter for cache miss scenarios
    const encodedUrl = encodeURIComponent(googleUrl);
    return `${API_URL}/avatars/${hash}?url=${encodedUrl}`;
  } catch (error) {
    console.error('Error generating cached avatar URL:', error);
    return undefined;
  }
}

