// Date + time helpers (timezone-light, all local).

export const DAY_MS = 86400000;

export function todayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseDay(key) {
  const [y, m, d] = String(key).split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key, n) {
  const d = parseDay(key);
  d.setDate(d.getDate() + n);
  return todayKey(d);
}

export function daysBetween(fromKey, toKey) {
  return Math.round((parseDay(toKey) - parseDay(fromKey)) / DAY_MS);
}

export function dayOfWeek(key) {
  return parseDay(key).getDay(); // 0 = Sunday
}

export function prettyDate(key) {
  if (!key) return 'No date';
  const d = parseDay(key);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function prettyLongDate(key) {
  if (!key) return 'No date set';
  const d = parseDay(key);
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

export function minutesToHHMM(min) {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Preferred study window -> [startMinutes, endMinutes] in local clock time. */
export function windowFor(preferred, availableHours) {
  const h = Math.max(1, Math.min(12, availableHours || 4));
  switch (preferred) {
    case 'Morning': return [6 * 60, 6 * 60 + h * 60];
    case 'Afternoon': return [13 * 60, 13 * 60 + h * 60];
    case 'Night': return [21 * 60, 21 * 60 + h * 60];
    case 'Evening':
    default: return [17 * 60, 17 * 60 + h * 60];
  }
}

export function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}
