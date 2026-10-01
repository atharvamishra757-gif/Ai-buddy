import { h, icon, fmtMinutes, fmtDate, fmtDateLong, relDay, today, addDays, toast, weekdayName } from '../ui.js';
import { get, post } from '../api.js';
import { dayTimeline, emptyState, progressBar, difficultyBadge, modal, field, selectInput } from '../components.js';
import { sessionHandlers, showAiMessage } from '../app.js';

export async function planPage({ user, refresh }) {
  let startFrom = today();
  let horizon = 7;
  let viewMode = 'week';

  const container = h('div', { class: 'stack' });

  async function load() {
    container.innerHTML = '';
    const planData = await get(`/plan?from=${startFrom}&days=${horizon}`);
    draw(planData);
  }

  function draw(d) {
    const handlers = sessionHandlers(() => load());
    const days = Object.keys(d.plan).sort();
    const totalMinutes = Object.values(d.plan).flat().reduce((a, s) => a + s.duration, 0);
    const missedCount = Object.values(d.plan).flat().filter((s) => s.status === 'missed').length;

    const rangeBar = h('div', { class: 'seg', style: { width: 'auto' } },
      ...[1, 3, 7, 14, 30].map((n) => h('button', {
        class: horizon === n ? 'active' : '',
        onclick: () => { horizon = n; load(); },
      }, n === 1 ? 'Day' : `${n} days`)));

    const navBar = h('div', { class: 'row', style: { gap: '6px' } },
      h('button', { class: 'btn btn-sm btn-icon', title: 'Previous', onclick: () => { startFrom = addDays(startFrom, -horizon); load(); } }, icon('chevronL', 15)),
      h('button', { class: 'btn btn-sm', onclick: () => { startFrom = today(); load(); } }, 'Today'),
      h('button', { class: 'btn btn-sm btn-icon', title: 'Next', onclick: () => { startFrom = addDays(startFrom, horizon); load(); } }, icon('chevronR', 15)));

    async function regenerate(replace = false) {
      try {
        const res = await post('/plan/generate', { horizonDays: horizon, from: startFrom, replace });
        toast(res.message, { kind: 'ok', title: 'AI plan ready', duration: 5200 });
        await load();
      } catch (err) { toast(err.message, { kind: 'err' }); }
    }

    container.append(
      h('div', { class: 'page-head' },
        h('div', { class: 'grow' },
          h('h2', {}, 'AI-generated schedule'),
          h('p', {}, `Sessions are distributed by exam urgency, difficulty, preparation gap and deadline pressure — not evenly. ${fmtMinutes(totalMinutes)} planned across this window.`)),
        navBar, rangeBar,
        h('button', { class: 'btn btn-primary', onclick: () => regenerate(false) }, icon('sparkles', 15), 'Regenerate')),

      // Priority legend
      h('div', { class: 'card' },
        h('div', { class: 'card-head' },
          h('h3', {}, icon('target', 16), ' Priority ranking'),
          h('span', { class: 'sub' }, 'how the AI decides time allocation')),
        h('div', { class: 'card-pad' },
          d.ranked.length ? h('div', { class: 'row wrap', style: { gap: '18px', alignItems: 'flex-start' } },
            d.ranked.map((s) => h('div', { style: { minWidth: '180px', flex: '1 1 180px' } },
              h('div', { class: 'row', style: { gap: '7px', marginBottom: '4px' } },
                h('span', { style: { width: '9px', height: '9px', borderRadius: '3px', background: s.color } }),
                h('span', { class: 'small strong' }, s.name),
                h('div', { class: 'spacer' }),
                h('span', { class: 'badge brand' }, s.priorityScore)),
              progressBar(s.priorityScore, { color: s.color }),
              h('div', { class: 'tiny muted', style: { marginTop: '4px' } },
                s.daysToExam !== null ? `Exam ${relDay(s.examDate)} · ` : '',
                `${Math.round(s.preparation)}% prepared · ${s.difficulty}`))))
            : h('p', { class: 'muted small' }, 'Add subjects to see priority ranking.'))),

      missedCount > 0 ? h('div', { class: 'ai-note' },
        h('div', { class: 'ai-avatar' }, 'S'),
        h('div', { style: { flex: '1' } },
          h('b', { class: 'small' }, `${missedCount} missed session${missedCount === 1 ? '' : 's'} in this window`),
          h('p', { class: 'small', style: { marginTop: '3px' } }, 'Rather than losing that time, the AI can redistribute it across your coming days while protecting higher-priority revision.')),
        h('button', {
          class: 'btn btn-primary btn-sm',
          onclick: async (e) => {
            e.currentTarget.disabled = true;
            e.currentTarget.textContent = 'Rebalancing…';
            try {
              const res = await post('/plan/reschedule-missed');
              showAiMessage(res.message, 'Plan rebalanced');
              await load();
            } catch (err) { toast(err.message, { kind: 'err' }); }
          },
        }, icon('sparkles', 14), 'Rebalance')) : null,

      // Day-by-day schedule
      h('div', { class: 'stack' },
        days.map((dayKey) => {
          const sessions = d.plan[dayKey];
          const dayTotal = sessions.reduce((a, s) => a + s.duration, 0);
          const isToday = dayKey === today();
          const isPast = dayKey < today();
          const done = sessions.filter((s) => s.status === 'completed').reduce((a, s) => a + s.duration, 0);

          return h('div', { class: 'card' },
            h('div', { class: 'card-head', style: isToday ? { background: 'var(--brand-soft)' } : {} },
              h('h3', {}, isToday ? 'Today' : fmtDateLong(dayKey), isToday ? h('span', { class: 'badge brand' }, weekdayName(dayKey)) : null),
              h('span', { class: 'sub' }, sessions.length ? `${sessions.length} session${sessions.length === 1 ? '' : 's'} · ${fmtMinutes(dayTotal)}` : 'Free day'),
              h('div', { class: 'spacer' }),
              sessions.length ? h('div', { class: 'row', style: { gap: '8px', alignItems: 'center' } },
                h('span', { class: 'tiny muted' }, `${fmtMinutes(done)} done`),
                h('div', { style: { width: '70px' } }, progressBar(dayTotal ? (done / dayTotal) * 100 : 0, { color: isToday ? 'var(--brand)' : 'var(--ok)' })))
                : null),
            h('div', { class: 'card-pad', style: { paddingTop: sessions.length ? '4px' : '0' } },
              sessions.length
                ? dayTimeline(sessions, d.ranked, handlers)
                : h('p', { class: 'muted small', style: { padding: '14px 0', textAlign: 'center' } },
                  isPast ? 'No sessions were scheduled.' : 'Nothing scheduled — a rest day.')));
        })),

      h('div', { class: 'row', style: { justifyContent: 'center', padding: '8px' } },
        h('button', { class: 'btn', onclick: () => regenerate(true) }, icon('refresh', 15), 'Rebuild from scratch')),
    );
  }

  await load();
  return { el: container };
}
