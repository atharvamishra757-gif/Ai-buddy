import { h, icon, $, initials, toast } from './ui.js';
import { get, auth } from './api.js';

export const ROUTES = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard', title: 'Dashboard', sub: 'Your day at a glance' },
  { id: 'plan', label: 'My Plan', icon: 'plan', title: 'My Plan', sub: 'Your AI-generated schedule' },
  { id: 'subjects', label: 'Subjects', icon: 'book', title: 'Subjects', sub: 'Progress, difficulty and exam dates' },
  { id: 'tasks', label: 'Tasks', icon: 'tasks', title: 'Tasks', sub: 'Assignments, projects and deadlines' },
  { id: 'exams', label: 'Exams', icon: 'exam', title: 'Exams', sub: 'Countdown and readiness' },
  { id: 'calendar', label: 'Calendar', icon: 'calendar', title: 'Calendar', sub: 'Everything in one month view' },
  { id: 'focus', label: 'Focus', icon: 'focus', title: 'Focus Mode', sub: 'Distraction-free study timer' },
  { id: 'analytics', label: 'Analytics', icon: 'chart', title: 'Analytics', sub: 'Where your time actually goes' },
  { id: 'ai', label: 'Ai-Buddy', icon: 'ai', title: 'Ai-Buddy', sub: 'Ask anything about your plan' },
  { id: 'settings', label: 'Settings', icon: 'settings', title: 'Settings', sub: 'Availability, goals and account' },
];

export const store = {
  user: null,
  notifications: [],
  sidebarOpen: false,
  cache: {},
};

export function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'light' ? '#f6f7fb' : '#08080c');
}

export function buildShell({ route, onNavigate, onLogout, onRefreshNotifications, children }) {
  const { user } = store;

  const nav = h('nav', { class: 'nav' },
    h('div', { class: 'nav-label' }, 'Planner'),
    ROUTES.slice(0, 6).map(navItem),
    h('div', { class: 'nav-label' }, 'Tools'),
    ROUTES.slice(6).map(navItem));

  function navItem(r) {
    const el = h('button', {
      class: 'nav-item' + (route === r.id ? ' active' : ''),
      onclick: () => { onNavigate(r.id); if (window.innerWidth <= 860) closeSidebar(); },
    }, icon(r.icon, 18), h('span', {}, r.label));
    el.dataset.route = r.id;
    if (r.id === 'plan' || r.id === 'tasks') el.dataset.badgeSlot = r.id;
    return el;
  }

  const notifBtn = h('button', {
    class: 'btn btn-ghost btn-icon', title: 'Notifications', 'aria-label': 'Notifications',
    style: { position: 'relative' },
    onclick: () => onRefreshNotifications(true),
  }, icon('bell', 18));
  const notifDot = h('span', {
    class: 'nav-badge',
    style: { position: 'absolute', top: '2px', right: '2px', display: 'none' },
  });
  notifBtn.append(notifDot);

  const themeBtn = h('button', {
    class: 'btn btn-ghost btn-icon', title: 'Toggle light / dark mode',
    onclick: () => {
      const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      localStorage.setItem('studyai.theme', next);
      themeBtn.replaceChild(icon(next === 'dark' ? 'moon' : 'sun', 18), themeBtn.firstChild);
    },
  }, icon(document.documentElement.getAttribute('data-theme') === 'dark' ? 'moon' : 'sun', 18));

  const scrim = h('div', { class: 'scrim hidden', onclick: closeSidebar });

  const sidebar = h('aside', { class: 'sidebar' },
    h('div', { class: 'brand' },
      h('div', { class: 'brand-mark' }, 'S'),
      h('div', { style: { minWidth: '0' } },
        h('div', { class: 'brand-name trunc' }, 'Ai-Buddy'),
        h('div', { class: 'brand-sub trunc' }, user?.course || 'Planner'))),
    nav,
    h('div', { class: 'sidebar-foot' },
      h('div', { class: 'xp-mini' },
        h('div', { class: 'xp-mini-head' },
          h('span', {}, 'Level ', h('b', { dataset: { xp: 'level' } }, String(store.gamification?.level ?? 1))),
          h('span', { class: 'mono', dataset: { xp: 'value' } }, `${store.gamification?.xp ?? 0} XP`)),
        h('div', { class: 'xp-bar' },
          h('div', { class: 'xp-fill', dataset: { xp: 'bar' }, style: { width: `${store.levelProgress?.percent ?? 0}%` } }))),
      h('button', {
        class: 'nav-item', onclick: () => onRefreshNotifications(true),
      }, icon('bell', 17), h('span', {}, 'Notifications'), h('span', { dataset: { notif: 'count' }, class: 'nav-badge hidden' }, '0')),
      h('button', { class: 'nav-item', onclick: () => onNavigate('settings') },
        h('span', { class: 'stat-icon', style: { width: '24px', height: '24px', borderRadius: '7px', fontSize: '10px', fontWeight: '700' } }, initials(user?.name || 'U')),
        h('span', { class: 'trunc' }, user?.name || 'Account')),
      h('button', { class: 'nav-item', onclick: onLogout }, icon('logout', 17), h('span', {}, 'Sign out'))));

  function openSidebar() {
    sidebar.classList.add('open');
    scrim.classList.remove('hidden');
  }
  function closeSidebar() {
    sidebar.classList.remove('open');
    scrim.classList.add('hidden');
  }
  store.openSidebar = openSidebar;

  const meta = ROUTES.find((r) => r.id === route) || ROUTES[0];

  const main = h('div', { class: 'main' },
    h('header', { class: 'topbar' },
      h('button', { class: 'btn btn-ghost btn-icon menu-btn', onclick: openSidebar, 'aria-label': 'Open menu' }, icon('menu', 19)),
      h('div', { style: { flex: '1', minWidth: '0' } },
        h('h1', { class: 'trunc' }, meta.title),
        h('div', { class: 'topbar-sub trunc' }, meta.sub)),
      h('div', { class: 'topbar-actions' }, notifBtn, themeBtn)),
    h('main', { class: 'page', id: 'page-root' }, children));

  return h('div', { class: 'shell' }, sidebar, main, scrim);
}

export function setShellRoute(route) {
  const meta = ROUTES.find((r) => r.id === route) || ROUTES[0];
  for (const item of document.querySelectorAll('.nav-item[data-route]')) {
    item.classList.toggle('active', item.dataset.route === meta.id);
    item.setAttribute('aria-current', item.dataset.route === meta.id ? 'page' : 'false');
  }
  const title = document.querySelector('.topbar h1');
  const subtitle = document.querySelector('.topbar-sub');
  if (title) title.textContent = meta.title;
  if (subtitle) subtitle.textContent = meta.sub;
}

export function setNotificationBadge(count) {
  store.notifications = count;
  for (const el of document.querySelectorAll('[data-notif="count"]')) {
    el.textContent = String(count);
    el.classList.toggle('hidden', !count);
  }
  const dot = document.querySelector('.topbar-actions .nav-badge');
  if (dot) dot.style.display = count ? '' : 'none';
}

export function updateXp(percent, xp, level) {
  const bar = document.querySelector('[data-xp="bar"]');
  if (bar) bar.style.width = `${percent}%`;
  const val = document.querySelector('[data-xp="value"]');
  if (val) val.textContent = `${xp} XP`;
  const lv = document.querySelector('[data-xp="level"]');
  if (lv) lv.textContent = String(level);
}

export function setBadges(counts = {}) {
  for (const [route, n] of Object.entries(counts)) {
    const el = document.querySelector(`.nav-item[data-route="${route}"]`);
    if (!el) continue;
    const existing = el.querySelector('.nav-badge');
    if (n > 0) {
      if (existing) existing.textContent = String(n);
      else el.append(h('span', { class: 'nav-badge' }, String(n)));
    } else existing?.remove();
  }
}
