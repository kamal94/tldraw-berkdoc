/**
 * Generate a color from an email address.
 * Uses a simple hash function to create a consistent color for each email.
 */
export function emailToColor(email: string): string {
  const hash = email
    .split('')
    .reduce((hash, char) => {
      return (hash << 5) - hash + char.charCodeAt(0);
    }, 0)
    .toString(36)
    .substring(0, 6);
  const color = `#${hash.toString().padStart(6, '0')}`;
  return color;
}
