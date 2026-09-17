/**
 * Shared formatting helpers — the storefront and admin apps must always
 * render the same currency/date shape, so this is the one place either
 * app is allowed to define that logic. Neither app should have its own
 * copy: frontend/src/utils/formatCurrency.js re-exports from here.
 */

export function formatCurrency(amount, currency = 'USD', locale = 'en-US') {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(Number(amount) || 0);
}

/**
 * @param {string|number|Date} date
 * @param {Object} [options]
 * @param {string} [options.locale]
 * @param {string} [options.timeZone] - IANA zone, e.g. 'Asia/Phnom_Penh'
 *   (the store's configured timezone lives in the `settings` table —
 *   callers that have it loaded should pass it through; this defaults to
 *   the viewer's local timezone otherwise, which is a reasonable fallback
 *   for a demo rather than a hardcoded assumption).
 */
export function formatDate(date, { locale = 'en-US', timeZone } = {}) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone,
  }).format(d);
}

/** "2 hours ago" style relative time, for a title/hover on top of formatDate. */
export function formatRelativeTime(date, { locale = 'en-US' } = {}) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';

  const diffSeconds = Math.round((d.getTime() - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const units = [
    ['year', 31536000],
    ['month', 2592000],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ];
  for (const [unit, secondsInUnit] of units) {
    if (Math.abs(diffSeconds) >= secondsInUnit) {
      return rtf.format(Math.round(diffSeconds / secondsInUnit), unit);
    }
  }
  return rtf.format(diffSeconds, 'second');
}
