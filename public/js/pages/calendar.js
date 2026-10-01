import { h, icon, toast, today, addDays, dayKey, parseKey, monthLabel, startOfWeek, fmtMinutes, fmtDate, weekdayName } from '../ui.js';
import { get, patch, post } from '../api.js';
import { emptyState, modal, field, textInput, selectInput, difficultyBadge } from '../components.js';
import { sessionHandlers, navigate } from '../app.js';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export async function calendarPage({ user, refresh }) {
  let cursor = new Date();
  const container = h('div', { class: 'stack' });
  let subjects = [];

  async function load() {
    subjects = (await get('/subjects')).subjects;
    const first = dayKey(new Date(cursor.getFullYear(), cursor.getMonth(), 1));
    const gridStart = startOfWeek(first);
    const gridEnd = addDays(gridStart, 41);
    const data = await get(`/calendar?from=${gridStart}&to=${gridEnd}`);
    draw(data, gridStart);
  }

  function draw(data, gridStart) {
    container.innerHTML = '';
    const handlers = sessionHandlers(() => load());
    const byDate = {};
    for (const e of data.events) (byDate[e.date] = byDate[e.date] || []).push(e);

    const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
    const thisMonth = cursor.getMonth();

    function dragStart(e, ev) {
      if (ev.kind !== 'session') return;
      e.dataTransfer.setData('text/plain', ev.id);
      e.dataTransfer.effectAllowed = 'move';
    }
    function dropOn(dateKey) {
      return (e) => {
        e.preventDefault();
        e.currentTarget.classList.remove('drop');
        const id = e.dataTransfer.getData('text/plain');
        if (!id) return;
        const ev = data.events.find((x) => x.id === id);
        if (!ev || ev.date === dateKey) return;
        patch('/calendar/move', { id, date: dateKey }).then((res) => {
          toast(res.message, { kind: 'ok', title: 'Session moved' });
          load();
        }).catch((err) => toast(err.message, { kind: 'err' }));
      };
    }

    function openEvent(ev) {
      if (ev.kind === 'session') {
        const session = { id: ev.id, subjectName: ev.title.split(' · ')[0], topic: ev.title.split(' · ')[1], date: ev.date, startTime: ev.time, duration: ev.duration, status: ev.status };
        import('../components.js').then(({ sessionCard }) => {
          const m = modal({
            title: `${ev.date} · ${ev.time || ''}`,
            body: h('div', {}, sessionCard(session, subjects.find((s) => s.id === ev.id), { ...handlers, compact: true })),
            footer: [
              h('button', { class: 'btn btn-ghost', onclick: () => { m.close(); navigate('plan'); } }, 'Open in My Plan'),
              h('button', { class: 'btn btn-primary', onclick: () => m.close() }, 'Close'),
            ],
          });
        });
      } else if (ev.kind === 'exam') {
        toast(`${ev.title} on ${fmtDate(ev.date, { weekday: 'long' })}.`, { kind: 'info', title: 'Exam' });
      } else {
        toast(`${ev.title} is due on ${fmtDate(ev.date, { weekday: 'long' })}.`, { kind: 'info', title: 'Deadline' });
      }
    }

    container.append(
      h('div', { class: 'page-head' },
        h('div', { class: 'grow' },
          h('h2', {}, monthLabel(dayKey(cursor))),
          h('p', {}, 'Study sessions, exams, deadlines and revision in one view. Drag a session to another day to reschedule it.')),
        h('div', { class: 'row', style: { gap: '6px' } },
          h('button', { class: 'btn btn-sm btn-icon', onclick: () => { cursor = new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1); load(); } }, icon('chevronL', 15)),
          h('button', { class: 'btn btn-sm', onclick: () => { cursor = new Date(); load(); } }, 'Today'),
          h('button', { class: 'btn btn-sm btn-icon', onclick: () => { cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1); load(); } }, icon('chevronR', 15)))),

      h('div', { class: 'row wrap', style: { gap: '14px' } },
        legend('Study session', 'var(--brand)'),
        legend('Completed', 'var(--ok)'),
        legend('Exam', 'var(--danger)'),
        legend('Deadline', 'var(--warn)'),
        h('div', { class: 'spacer' }),
        h('span', { class: 'tiny muted' }, 'Tip: drag any study session to another day to move it.')),

      h('div', { class: 'cal' },
        ...DOW.map((d) => h('div', { class: 'cal-dow' }, d)),
        ...days.map((dk) => {
          const d = parseKey(dk);
          const events = (byDate[dk] || []).sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));
          const outside = d.getMonth() !== thisMonth;
          const isToday = dk === today();
          return h('div', {
            class: `cal-day${outside ? ' outside' : ''}${isToday ? ' today' : ''}`,
            ondragover: (e) => { e.preventDefault(); e.currentTarget.classList.add('drop'); },
            ondragleave: (e) => e.currentTarget.classList.remove('drop'),
            ondrop: dropOn(dk),
          },
            h('div', { class: 'cal-num' }, d.getDate()),
            ...events.slice(0, 4).map((ev) => h('div', {
              class: `cal-ev${ev.kind === 'exam' ? ' exam' : ''}${ev.status === 'completed' ? ' done' : ''}`,
              style: { '--c': ev.color },
              draggable: ev.kind === 'session',
              ondragstart: (e) => dragStart(e, ev),
              onclick: () => openEvent(ev),
              title: `${ev.title}${ev.time ? ` at ${ev.time}` : ''}`,
            }, ev.time ? `${ev.time} ` : '', ev.title)),
            events.length > 4 ? h('div', { class: 'tiny muted', style: { paddingLeft: '4px' } }, `+${events.length - 4} more`) : null);
        })),
    );
  }

  function legend(label, color) {
    return h('span', { class: 'row tiny', style: { gap: '6px' } },
      h('span', { style: { width: '10px', height: '10px', borderRadius: '3px', background: color } }),
      h('span', { class: 'muted' }, label));
  }

  await load();
  return { el: container };
}
