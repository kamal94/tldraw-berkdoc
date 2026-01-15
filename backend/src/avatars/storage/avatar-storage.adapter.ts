/**
 * Storage adapter interface for avatar caching
 * Allows swapping between database blob storage and S3 storage
 */
export interface AvatarStorageAdapter {
  /**
   * Get avatar data and content type by hash
   * @param hash The hash of the original Google avatar URL
   * @returns Object containing buffer and content type, or null if not found
   */
  get(hash: string): Promise<{ buffer: Buffer; contentType: string } | null>;

  /**
   * Store avatar data
   * @param hash The hash of the original Google avatar URL
   * @param data The image data as a Buffer
   * @param contentType The MIME type of the image (e.g., 'image/png', 'image/jpeg')
   * @param originalUrl Optional original URL for reference
   */
  set(hash: string, data: Buffer, contentType: string, originalUrl?: string): Promise<void>;

  /**
   * Check if avatar exists in cache
   * @param hash The hash of the original Google avatar URL
   * @returns true if exists, false otherwise
   */
  exists(hash: string): Promise<boolean>;

  /**
   * Delete avatar from cache
   * @param hash The hash of the original Google avatar URL
   */
  delete(hash: string): Promise<void>;
}
