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

/**
 * Format a Date to iDempiere REST API datetime format.
 * iDempiere treats datetime values as LOCAL server time (not real UTC).
 * The 'Z' suffix is required by format but does NOT mean UTC.
 * We must use local time components, NOT toISOString() which converts to UTC.
 */
export function toIdempiereDateTime(date: Date): string {
  const y = date.getFullYear()
  const mo = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const h = String(date.getHours()).padStart(2, '0')
  const mi = String(date.getMinutes()).padStart(2, '0')
  const s = String(date.getSeconds()).padStart(2, '0')
  return `${y}-${mo}-${d}T${h}:${mi}:${s}Z`
}

/**
 * Format a Date to 'YYYY-MM-DD' string (local time).
 */
export function toDateString(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Max appointment date (7 days from now).
 */
export function maxAppointmentDate(): Date {
  const d = new Date()
  d.setDate(d.getDate() + 7)
  return d
}

/**
 * Human-readable date label in Chinese.
 */
export function toLocaleDateLabel(date: Date): string {
  const today = new Date()
  const dateStr = toDateString(date)
  if (dateStr === toDateString(today)) return '今天'

  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  if (dateStr === toDateString(tomorrow)) return '明天'

  const weekdays = ['日', '一', '二', '三', '四', '五', '六']
  return `${date.getMonth() + 1}/${date.getDate()} (${weekdays[date.getDay()]})`
}
