/* ---------------- tiny DOM + formatting helpers ---------------- */

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(4)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ---------------- icons ---------------- */
const ICONS = {
  dashboard: 'M3 3h7v8H3zM14 3h7v5h-7zM14 11h7v10h-7zM3 14h7v7H3z',
  plan: 'M8 2v3M16 2v3M3 8h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2zM8 12h3M8 16h6',
  book: 'M4 4.5A2.5 2.5 0 016.5 2H20v18H6.5A2.5 2.5 0 004 22.5zM4 19h16',
  tasks: 'M9 5h11M9 12h11M9 19h11M4 5l1.5 1.5L8 4M4 12l1.5 1.5L8 10M4 19l1.5 1.5L8 17',
  exam: 'M12 22a10 10 0 100-20 10 10 0 000 20zM12 6v6l4 2',
  calendar: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z',
  focus: 'M12 8v4l3 2M12 22a10 10 0 100-20 10 10 0 000 20z',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  ai: 'M12 3l1.9 4.6L18.5 9.5 13.9 11.4 12 16l-1.9-4.6L5.5 9.5l4.6-1.9zM19 15l.9 2.1 2.1.9-2.1.9L19 21l-.9-2.1-2.1-.9 2.1-.9z',
  settings: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-1.8-.3 1.6 1.6 0 00-1 1.5V21a2 2 0 11-4 0v-.1A1.6 1.6 0 008 19.4a1.6 1.6 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.6 1.6 0 00.3-1.8 1.6 1.6 0 00-1.5-1H2a2 2 0 110-4h.1A1.6 1.6 0 004.6 8a1.6 1.6 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.6 1.6 0 001.8.3H9a1.6 1.6 0 001-1.5V2a2 2 0 114 0v.1a1.6 1.6 0 001 1.5 1.6 1.6 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 00-.3 1.8V9a1.6 1.6 0 001.5 1H22a2 2 0 110 4h-.1a1.6 1.6 0 00-1.5 1z',
  logout: 'M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9',
  bell: 'M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0',
  plus: 'M12 5v14M5 12h14',
  check: 'M20 6L9 17l-5-5',
  x: 'M18 6L6 18M6 6l12 12',
  play: 'M6 3l14 9-14 9z',
  pause: 'M8 4v16M16 4v16',
  skip: 'M5 4l10 8-10 8zM19 5v14',
  edit: 'M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.1 2.1 0 013 3L12 15l-4 1 1-4z',
  trash: 'M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6',
  clock: 'M12 22a10 10 0 100-20 10 10 0 000 20zM12 6v6l4 2',
  fire: 'M12 22c4 0 6-2.7 6-6 0-4-3-5-3-9 0 0-2 1.5-2 4 0 1.5-1 2-1.5 1.5S10 11 10 10c-2 1.5-4 3.5-4 6 0 3.3 2 6 6 6z',
  sparkles: 'M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6zM19 14l.8 2.2 2.2.8-2.2.8L19 20l-.8-2.2-2.2-.8 2.2-.8z',
  refresh: 'M21 12a9 9 0 11-3-6.7M21 3v6h-6',
  menu: 'M3 6h18M3 12h18M3 18h18',
  target: 'M12 22a10 10 0 100-20 10 10 0 000 20zM12 18a6 6 0 100-12 6 6 0 000 12zM12 14a2 2 0 100-4 2 2 0 000 4z',
  book2: 'M4 19.5A2.5 2.5 0 016.5 17H20M4 19.5A2.5 2.5 0 006.5 22H20V2H6.5A2.5 2.5 0 004 4.5z',
  moon: 'M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z',
  sun: 'M12 17a5 5 0 100-10 5 5 0 000 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  chevronL: 'M15 18l-6-6 6-6',
  chevronR: 'M9 18l6-6-6-6',
  brain: 'M9.5 3A3.5 3.5 0 006 6.5 3 3 0 004 9a3 3 0 001 5.2A3.5 3.5 0 009.5 21 3 3 0 0012 19V5a3 3 0 00-2.5-2zM14.5 3A3.5 3.5 0 0118 6.5 3 3 0 0120 9a3 3 0 01-1 5.2A3.5 3.5 0 0114.5 21 3 3 0 0112 19',
  flag: 'M4 22V4h16l-3 5 3 5H4',
  layers: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
  zap: 'M13 2L3 14h8l-1 8 10-12h-8z',
  users: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.9M16 3.1a4 4 0 010 7.8',
  inbox: 'M22 12h-6l-2 3h-4l-2-3H2M5.5 5.5h13l3.5 6.5v6a2 2 0 01-2 2H4a2 2 0 01-2-2v-6z',
  download: 'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3',
  upload: 'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12',
  quote: 'M7 15h3a2 2 0 002-2V7a2 2 0 00-2-2H6a2 2 0 00-2 2v4a2 2 0 002 2zM17 15h3a2 2 0 002-2V7a2 2 0 00-2-2h-4a2 2 0 00-2 2v4a2 2 0 002 2z',
  eye: 'M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7zM12 15a3 3 0 100-6 3 3 0 000 6z',
};

export function icon(name, size = 18, cls = 'icon') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.9');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('class', cls);
  svg.innerHTML = `<path d="${ICONS[name] || ICONS.sparkles}"/>`;
  return svg;
}

/* ---------------- date helpers ---------------- */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function dayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function parseKey(k) {
  const [y, m, d] = String(k).split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(k, n) {
  const d = parseKey(k);
  d.setDate(d.getDate() + n);
  return dayKey(d);
}
export function daysBetween(a, b) {
  return Math.round((parseKey(b) - parseKey(a)) / 86400000);
}
export const today = () => dayKey();

export function fmtDate(k, opts = {}) {
  if (!k) return '—';
  const d = parseKey(k);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...opts });
}
export function fmtDateLong(k) {
  if (!k) return '—';
  return parseKey(k).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}
export function weekdayName(k) { return DAYS[parseKey(k).getDay()]; }
export function monthLabel(k) {
  const d = parseKey(k);
  return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}
export function relDay(k) {
  const n = daysBetween(today(), k);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  if (n < 0) return `${Math.abs(n)} days ago`;
  return `in ${n} days`;
}
export function startOfWeek(k) {
  const d = parseKey(k);
  d.setDate(d.getDate() - d.getDay());
  return dayKey(d);
}

/* ---------------- number helpers ---------------- */
export function fmtMinutes(min) {
  const m = Math.max(0, Math.round(min || 0));
  const hrs = Math.floor(m / 60);
  const rem = m % 60;
  if (hrs === 0) return `${rem}m`;
  if (rem === 0) return `${hrs}h`;
  return `${hrs}h ${rem}m`;
}
export function fmtHours(min) { return (Math.round((min || 0) / 6) / 10).toFixed(1); }
export function fmtClock(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
export function initials(name = '') {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase() || 'U';
}
export function pct(n) { return `${Math.round(Math.max(0, Math.min(100, n || 0)))}%`; }

export const DIFFICULTY = { Easy: 'ok', Medium: 'warn', Hard: 'danger' };
export const TYPE_COLOR = {
  Learning: 'var(--brand-2)', Practice: 'var(--brand)', Revision: 'var(--warn)', 'Mock Test': 'var(--danger)',
};
export const SEV = { critical: 'danger', warn: 'warn', info: 'info', ok: 'ok' };
export const PRIORITY_LABEL = { low: 'Low', medium: 'Medium', high: 'High' };

/* ---------------- toasts ---------------- */
export function toast(message, { title, kind = 'info', duration = 4600 } = {}) {
  const root = document.getElementById('toasts');
  if (!root) return;
  const node = h('div', { class: `toast ${kind}` },
    h('div', { class: 'toast-body' },
      title ? h('b', {}, title) : null,
      h('span', { html: message })),
    h('button', { class: 'btn-ghost btn-icon', style: { color: 'var(--text-3)' }, onclick: () => node.remove() }, icon('x', 15)));
  root.append(node);
  setTimeout(() => {
    node.style.transition = 'opacity .3s, transform .3s';
    node.style.opacity = '0';
    node.style.transform = 'translateX(30px)';
    setTimeout(() => node.remove(), 300);
  }, duration);
}

export function debounce(fn, ms = 300) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
