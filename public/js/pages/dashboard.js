import { h, icon, fmtMinutes, fmtDate, fmtDateLong, relDay, today, pct, toast } from '../ui.js';
import { get, post } from '../api.js';
import {
  stat, progressBar, subjectProgressText, donutChart, rankedBars, barChart,
  insightCard, dayTimeline, countdownBadge, difficultyBadge, emptyState, aiNote,
} from '../components.js';
import { sessionHandlers, navigate, refreshNotifications } from '../app.js';

export async function dashboardPage({ user, refresh }) {
  const d = await get('/dashboard');
  const handlers = sessionHandlers(refresh);
  const goalPct = Math.min(100, Math.round((d.today.done / Math.max(1, d.today.goalMinutes)) * 100));
  const planPct = Math.min(100, Math.round((d.today.totalMinutes / Math.max(1, d.today.goalMinutes)) * 100));
  const pendingCount = d.tasks.length;
  const completedSessions = d.today.sessions.filter((s) => s.status === 'completed').length;

  // Weekly hours bar chart (next 7 days)
  const weekData = d.weekly.length ? d.weekly : [];
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const weeklyBars = Array.from({ length: 7 }, (_, i) => {
    const key = weekStartPlus(i);
    const mins = d.today.date === key
      ? d.today.done
      : (d.weekly.find((w) => w.label === key)?.minutes ?? 0);
    return { label: dayNames[new Date(key.split('-').map((n, idx) => (idx === 1 ? Number(n) - 1 : Number(n)))).getDay()], value: mins };
  });

  function weekStartPlus(i) {
    const dt = new Date();
    dt.setDate(dt.getDate() - dt.getDay() + i);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  }

  const subjectDonut = d.subjects
    .filter((s) => s.preparation > 0 || (d.today.sessions || []).some((x) => x.subjectId === s.id))
    .map((s) => ({ label: s.name, value: s.preparation, color: s.color, display: `${Math.round(s.preparation)}%` }));

  const topInsights = d.insights.slice(0, 3);

  const el = h('div', { class: 'stack', style: { gap: '16px' } },
    // Top stat row
    h('div', { class: 'grid g-4' },
      stat({
        label: 'Studied today', value: fmtMinutes(d.today.done), icon: 'clock', color: 'var(--brand)',
        foot: h('span', { class: 'row', style: { gap: '6px' } },
          progressBar(goalPct, { color: 'var(--brand)' }),
          h('span', { class: 'tiny' }, `${goalPct}% of ${fmtMinutes(d.today.goalMinutes)} goal`)),
      }),
      stat({
        label: 'Sessions done', value: `${completedSessions}/${d.today.sessions.length}`, icon: 'check', color: 'var(--ok)',
        foot: `${d.today.sessions.length - completedSessions} still planned today`,
      }),
      stat({
        label: 'Current streak', value: d.streak, unit: d.streak === 1 ? 'day' : 'days', icon: 'fire', color: 'var(--warn)',
        foot: d.streak > 0 ? 'Keep it going today' : 'Complete a session to start',
      }),
      stat({
        label: 'Pending tasks', value: pendingCount, icon: 'tasks', color: 'var(--brand-2)',
        foot: `${d.exams.filter((e) => e.daysToExam >= 0 && e.daysToExam <= 7).length} exams within 7 days`,
        onClick: () => navigate('tasks'),
      })),

    h('div', { class: 'grid g-main' },
      // Left: today's schedule
      h('div', { class: 'stack' },
        h('div', { class: 'card' },
          h('div', { class: 'card-head' },
            h('h3', {}, 'Today’s schedule'),
            h('span', { class: 'sub' }, d.today.dateLabel),
            h('div', { class: 'spacer' }),
            d.today.sessions.some((s) => s.status === 'planned') ? h('button', {
              class: 'btn btn-sm', onclick: () => navigate('plan'),
            }, 'Full plan', icon('chevronR', 13)) : null),
          h('div', { class: 'card-pad', style: { paddingTop: '6px' } },
            d.today.sessions.length
              ? dayTimeline(d.today.sessions, d.subjects, handlers)
              : emptyState({
                ic: 'calendar', title: 'Nothing scheduled today',
                message: d.today.dateLabel + ' is free. Generate an AI plan to fill your available hours.',
                action: h('button', { class: 'btn btn-primary', onclick: () => navigate('plan') }, icon('sparkles', 15), 'Generate plan'),
              }))),

        // Subject progress
        h('div', { class: 'card' },
          h('div', { class: 'card-head' },
            h('h3', {}, 'Subject progress'),
            h('span', { class: 'sub' }, 'prioritised by AI'),
            h('div', { class: 'spacer' }),
            h('button', { class: 'btn btn-sm btn-ghost', onclick: () => navigate('subjects') }, 'Manage', icon('chevronR', 13))),
          h('div', { class: 'card-pad stack', style: { gap: '15px' } },
            d.subjects.length ? d.subjects.map((s) => h('div', {},
              h('div', { class: 'row', style: { marginBottom: '5px', gap: '8px' } },
                h('span', { style: { width: '9px', height: '9px', borderRadius: '3px', background: s.color, flexShrink: 0 } }),
                h('span', { class: 'small strong' }, s.name),
                difficultyBadge(s.difficulty),
                s.daysToExam !== null && s.daysToExam >= 0 && s.daysToExam <= 7 ? h('span', { class: 'badge warn' }, `exam ${relDay(s.examDate)}`) : null,
                h('div', { class: 'spacer' }),
                h('span', { class: 'tiny mono muted' }, `P${s.priorityScore}`)),
              subjectProgressText(s)))
              : emptyState({ ic: 'book', title: 'No subjects yet', message: 'Add subjects so the planner can prioritise them.' })))),

      // Right rail
      h('div', { class: 'stack' },
        // AI recommendations
        h('div', { class: 'card' },
          h('div', { class: 'card-head' },
            h('h3', {}, icon('sparkles', 16), ' AI recommendations'),
            h('div', { class: 'spacer' }),
            h('button', { class: 'btn btn-sm btn-ghost btn-icon', title: 'Ask Study AI', onclick: () => navigate('ai') }, icon('ai', 16))),
          h('div', { class: 'card-pad' },
            topInsights.length ? h('div', {}, topInsights.map(insightCard)) : emptyState({ ic: 'sparkles', title: 'No insights yet' }),
            h('div', { class: 'mt-2' },
              h('button', { class: 'btn btn-sm btn-block', onclick: () => navigate('ai') }, icon('ai', 14), 'Ask Study AI')))),

        // Upcoming exams
        h('div', { class: 'card' },
          h('div', { class: 'card-head' },
            h('h3', {}, icon('exam', 16), ' Upcoming exams'),
            h('div', { class: 'spacer' }),
            h('button', { class: 'btn btn-sm btn-ghost btn-icon', onclick: () => navigate('exams') }, icon('chevronR', 14))),
          h('div', { class: 'card-pad stack', style: { gap: '13px' } },
            d.exams.length ? d.exams.slice(0, 4).map((e) => h('div', {},
              h('div', { class: 'row', style: { gap: '8px', marginBottom: '5px' } },
                h('span', { style: { width: '8px', height: '8px', borderRadius: '3px', background: e.color, flexShrink: 0 } }),
                h('span', { class: 'small strong', style: { flex: '1' } }, e.name),
                countdownBadge(e.daysToExam)),
              h('div', { class: 'row', style: { gap: '8px' } },
                h('span', { class: 'tiny muted', style: { minWidth: '58px' } }, fmtDate(e.examDate)),
                progressBar(e.preparation, { color: e.color }),
                h('span', { class: 'tiny mono' }, `${Math.round(e.preparation)}%`))))
              : emptyState({ ic: 'exam', title: 'No exam dates', message: 'Add exam dates in Subjects to enable exam countdowns.' }))),

        // Weekly hours
        h('div', { class: 'card' },
          h('div', { class: 'card-head' },
            h('h3', {}, icon('chart', 16), ' Weekly study hours'),
            h('span', { class: 'sub' }, 'completed')),
          h('div', { class: 'card-pad' },
            barChart(weeklyBars, { height: 140, highlightIndex: new Date().getDay() }))),

        // Study time split
        d.subjects.length ? h('div', { class: 'card' },
          h('div', { class: 'card-head' }, h('h3', {}, icon('layers', 16), ' Preparation mix')),
          h('div', { class: 'card-pad' },
            donutChart(subjectDonut, { centerLabel: 'avg', centerValue: `${Math.round(d.subjects.reduce((a, s) => a + s.preparation, 0) / d.subjects.length)}%` }))) : null,
      )),

    // Reschedule banner if anything overdue
    d.insights.some((i) => i.type === 'missed') ? h('div', { class: 'ai-note' },
      h('div', { class: 'ai-avatar' }, 'S'),
      h('div', { class: 'row', style: { gap: '10px', flex: '1', flexWrap: 'wrap' } },
        h('div', { style: { flex: '1', minWidth: '200px' } },
          h('b', { class: 'small' }, 'You have missed sessions'),
          h('p', { class: 'small', style: { marginTop: '3px' } }, 'Let the AI redistribute that time across your coming days without disturbing higher-priority revision.')),
        h('button', {
          class: 'btn btn-primary btn-sm',
          onclick: async (e) => {
            e.currentTarget.disabled = true;
            e.currentTarget.textContent = 'Rebalancing…';
            try {
              const res = await post('/plan/reschedule-missed');
              const { showAiMessage } = await import('../app.js');
              showAiMessage(res.message, 'Plan rebalanced');
              refresh();
            } catch (err) { toast(err.message, { kind: 'err' }); }
            e.currentTarget.disabled = false;
            e.currentTarget.textContent = 'Reschedule missed';
          },
        }, icon('sparkles', 14), 'Reschedule missed'))) : null,
  );

  return { el };
}
