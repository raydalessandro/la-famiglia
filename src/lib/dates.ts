/**
 * Date utilities — single source of truth for week-start computation.
 *
 * IMPORTANT: never use toISOString() — it converts to UTC and corrupts dates
 * close to midnight in non-UTC timezones (Europe/Rome on Vercel).
 */

/**
 * Returns the Monday-of-current-week date as YYYY-MM-DD using local timezone.
 * If `dateString` is provided and matches /^\d{4}-\d{2}-\d{2}$/, it is returned
 * verbatim (callers pass the client-computed week_start through unchanged).
 */
export function getWeekStart(dateString?: string | null): string {
  if (dateString && /^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    return dateString
  }
  const today = new Date()
  const dayOfWeek = today.getDay() // 0=Sun
  const diff = (dayOfWeek === 0 ? -6 : 1) - dayOfWeek
  const monday = new Date(today)
  monday.setDate(today.getDate() + diff)
  const y = monday.getFullYear()
  const m = String(monday.getMonth() + 1).padStart(2, '0')
  const d = String(monday.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
