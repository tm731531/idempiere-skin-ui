/**
 * Shared API Utilities
 */

/**
 * Escape OData string to prevent injection.
 * Escapes single quotes and removes dangerous characters.
 */
export function escapeODataString(value: string): string {
  if (!value) return ''
  return value
    .replace(/'/g, "''")
    .replace(/[<>{}|\\^~\[\]`]/g, '')
    .trim()
}
