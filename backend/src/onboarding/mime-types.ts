/**
 * MIME type classification for file processing
 * 
 * Files are categorized into:
 * - SUPPORTED: Files that can be fully processed (text extraction, embeddings, LLM analysis)
 * - FUTURE_SUPPORT: Files that may be supported in future versions
 * - IGNORED: Files that will not be processed (media, folders, etc.)
 */

/** MIME types that are fully supported for content processing */
export const SUPPORTED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.google-apps.document',
] as const;

/** MIME types that may be supported in future versions */
export const FUTURE_SUPPORT_MIME_TYPES = [
  'application/vnd.google-apps.spreadsheet',
  'application/vnd.google-apps.presentation',
  'text/plain',
  'text/markdown',
  'text/html',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/msword', // .doc
] as const;

/** MIME type patterns that are always ignored */
export const IGNORED_MIME_TYPE_PATTERNS = [
  /^image\//,
  /^video\//,
  /^audio\//,
  'application/vnd.google-apps.folder',
  'application/vnd.google-apps.shortcut',
  'application/vnd.google-apps.form',
  'application/vnd.google-apps.map',
  'application/vnd.google-apps.drawing',
  'application/vnd.google-apps.site',
] as const;

export type SupportedMimeType = typeof SUPPORTED_MIME_TYPES[number];
export type FutureSupportMimeType = typeof FUTURE_SUPPORT_MIME_TYPES[number];

export type MimeTypeClassification = 'supported' | 'future' | 'ignored';

/**
 * Classify a MIME type into supported, future, or ignored categories
 */
export function classifyMimeType(mimeType: string): MimeTypeClassification {
  if (SUPPORTED_MIME_TYPES.includes(mimeType as SupportedMimeType)) {
    return 'supported';
  }

  if (FUTURE_SUPPORT_MIME_TYPES.includes(mimeType as FutureSupportMimeType)) {
    return 'future';
  }

  // Check ignored patterns
  for (const pattern of IGNORED_MIME_TYPE_PATTERNS) {
    if (typeof pattern === 'string') {
      if (mimeType === pattern) return 'ignored';
    } else if (pattern.test(mimeType)) {
      return 'ignored';
    }
  }

  // Default to ignored for unknown types
  return 'ignored';
}

/**
 * Check if a MIME type is supported for content processing
 */
export function isSupportedMimeType(mimeType: string): boolean {
  return classifyMimeType(mimeType) === 'supported';
}

/**
 * Get human-readable category name for a MIME type
 */
export function getMimeTypeCategory(mimeType: string): string {
  const classification = classifyMimeType(mimeType);
  
  switch (classification) {
    case 'supported':
      return 'Processable';
    case 'future':
      return 'Coming Soon';
    case 'ignored':
      return 'Excluded';
  }
}

/**
 * Get human-readable name for common MIME types
 */
export function getMimeTypeDisplayName(mimeType: string): string {
  const displayNames: Record<string, string> = {
    'application/pdf': 'PDF',
    'application/vnd.google-apps.document': 'Google Doc',
    'application/vnd.google-apps.spreadsheet': 'Google Sheet',
    'application/vnd.google-apps.presentation': 'Google Slides',
    'application/vnd.google-apps.folder': 'Folder',
    'text/plain': 'Text File',
    'text/markdown': 'Markdown',
    'text/html': 'HTML',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word Doc',
    'application/msword': 'Word Doc',
  };

  if (displayNames[mimeType]) {
    return displayNames[mimeType];
  }

  if (mimeType.startsWith('image/')) return 'Image';
  if (mimeType.startsWith('video/')) return 'Video';
  if (mimeType.startsWith('audio/')) return 'Audio';

  return 'Other';
}
