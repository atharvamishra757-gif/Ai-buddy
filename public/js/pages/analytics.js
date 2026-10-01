import { h, icon, fmtMinutes, fmtHours, fmtDate } from '../ui.js';
import { get } from '../api.js';
import {
  stat, lineChart, barChart, donutChart, rankedBars, progressBar,
  emptyState, countdownBadge,
} from '../components.js';
import { navigate } from '../app.js';

const HOUR_LABEL = (hr) => `${String(hr).padStart(2, '0')}:00`;
const HOUR_INDEX = { Morning: 6, Afternoon: 13, Evening: 17, Night: 21 };

/* ---- small building blocks (kept flat so nesting stays readable) ---- */

function statTiles(a, user) {
  const t = a.totals;
  return h('div', { class: 'grid g-4' },
    stat({
      label: 'Total focus time', value: fmtHours(t.focusMinutes), unit: 'h',
      icon: 'clock', color: 'var(--brand)', foot: `${t.completed} sessions completed`,
    }),
    stat({
      label: 'Completion rate', value: t.completionRate, unit: '%', icon: 'check',
      color: t.completionRate >= 70 ? 'var(--ok)' : t.completionRate >= 45 ? 'var(--warn)' : 'var(--danger)',
      foot: `${t.missed} missed of ${t.planned} planned`,
    }),
    stat({
      label: 'Current streak', value: a.streak, unit: 'days', icon: 'fire', color: 'var(--warn)',
      foot: a.streak >= 3 ? 'Strong consistency' : 'Complete a session today to build it',
    }),
    stat({
      label: 'Daily average', value: t.avgPerDay, unit: 'h', icon: 'chart', color: 'var(--brand-2)',
      foot: `Goal ${user?.settings?.dailyStudyGoalHours || 4}h/day`,
    }));
}

function dailyCard(a, days) {
  return h('div', { class: 'card' },
    h('div', { class: 'card-head' },
      h('h3', {}, icon('chart', 16), ' Daily study hours'),
      h('span', { class: 'sub' }, `completed vs planned, last ${days} days`)),
    h('div', { class: 'card-pad' }, lineChart(a.daily, { height: 200 })));
}

function subjectCard(a) {
  const hasData = a.bySubject.some((s) => s.minutes > 0);
  const body = hasData
    ? rankedBars(a.bySubject.map((s) => ({
      label: s.name,
      value: s.minutes,
      color: s.color,
      badge: h('span', { class: 'badge' }, `${s.preparation}% ready`),
      sub: `${s.completed} done · ${s.missed} missed · ${s.completionRate}% completion`
        + (s.examDate ? ` · exam ${fmtDate(s.examDate)}` : ''),
    })))
    : emptyState({ ic: 'chart', title: 'No completed sessions yet', message: 'Complete study sessions to see the breakdown.' });

  return h('div', { class: 'card' },
    h('div', { class: 'card-head' },
      h('h3', {}, icon('book', 16), ' Subject breakdown'),
      h('span', { class: 'sub' }, 'time invested & completion')),
    h('div', { class: 'card-pad' }, body));
}

function examStatus(e) {
  if (e.daysToExam < 0) return h('span', { class: 'badge' }, 'Completed');
  if (e.preparation >= 80) return h('span', { class: 'badge ok' }, 'On track');
  if (e.daysToExam <= 7) return h('span', { class: 'badge danger' }, 'At risk');
  return h('span', { class: 'badge warn' }, 'Needs work');
}

function examRows(rows) {
  return h('tbody', {}, rows.map((e) => h('tr', {},
    h('td', {}, h('span', { class: 'row', style: { gap: '7px' } },
      h('span', { style: { width: '9px', height: '9px', borderRadius: '3px', background: e.color } }),
      h('span', { class: 'strong' }, e.name))),
    h('td', { class: 'small' }, fmtDate(e.examDate)),
    h('td', {}, countdownBadge(e.daysToExam)),
    h('td', { style: { minWidth: '140px' } },
      h('div', { class: 'row', style: { gap: '8px' } },
        progressBar(e.preparation, { color: e.color }),
        h('span', { class: 'tiny mono' }, `${e.preparation}%`))),
    h('td', {}, examStatus(e)))));
}

function examPrepCard(a) {
  let body;
  if (a.examPrep.length) {
    body = h('table', { class: 'table' },
      h('thead', {}, h('tr', {},
        h('th', {}, 'Subject'),
        h('th', {}, 'Exam'),
        h('th', {}, 'Days left'),
        h('th', {}, 'Preparation'),
        h('th', {}, 'Status'))),
      examRows(a.examPrep));
  } else {
    body = h('div', { class: 'card-pad' }, emptyState({
      ic: 'exam', title: 'No exams set', message: 'Add exam dates in Subjects.',
      action: h('button', { class: 'btn btn-primary btn-sm', onclick: () => navigate('subjects') }, 'Add exams'),
    }));
  }

  return h('div', { class: 'card' },
    h('div', { class: 'card-head' },
      h('h3', {}, icon('exam', 16), ' Exam preparation'),
      h('span', { class: 'sub' }, 'readiness vs time remaining')),
    h('div', { class: 'table-wrap' }, body));
}

function timeMixCard(a) {
  const withTime = a.bySubject.filter((s) => s.minutes > 0);
  const body = withTime.length
    ? donutChart(
      withTime.map((s) => ({ label: s.name, value: s.minutes, color: s.color, display: fmtMinutes(s.minutes) })),
      { centerLabel: 'total', centerValue: `${fmtHours(a.totals.focusMinutes)}h` })
    : emptyState({ ic: 'layers', title: 'No data yet' });

  return h('div', { class: 'card' },
    h('div', { class: 'card-head' }, h('h3', {}, icon('layers', 16), ' Study time mix')),
    h('div', { class: 'card-pad' }, body));
}

function productiveCard(a, user) {
  let body;
  if (a.productivePeriod) {
    const { hour, minutes } = a.productivePeriod;
    const preferred = HOUR_INDEX[user?.settings?.preferredTime] ?? 17;
    const notes = [
      h('div', { class: 'stat-value', style: { fontSize: '32px' } }, HOUR_LABEL(hour)),
      h('p', { class: 'small dim', style: { marginTop: '4px' } },
        `You complete ${fmtMinutes(minutes)} of study at this hour. This is your strongest window — protect it.`),
    ];
    if (hour !== preferred) {
      notes.push(h('p', { class: 'tiny muted mt-1' },
        `Your planner currently schedules in the ${user?.settings?.preferredTime?.toLowerCase()}. Consider aligning them in Settings.`));
    }
    body = h('div', {}, notes);
  } else {
    body = emptyState({ ic: 'zap', title: 'Not enough data', message: 'Complete a few sessions to detect your best study window.' });
  }

  return h('div', { class: 'card' },
    h('div', { class: 'card-head' }, h('h3', {}, icon('zap', 16), ' Most productive period')),
    h('div', { class: 'card-pad' }, body));
}

function weeklyCard(a) {
  return h('div', { class: 'card' },
    h('div', { class: 'card-head' }, h('h3', {}, icon('plan', 16), ' Weekly totals')),
    h('div', { class: 'card-pad' },
      barChart(a.weekly.map((w) => ({ label: fmtDate(w.label), value: w.minutes })), { height: 150 })));
}

function completedMissedCard(a) {
  const t = a.totals;
  const row = (label, count, color) => h('div', { style: { flex: '1' } },
    h('div', { class: 'row', style: { marginBottom: '5px' } },
      h('span', { class: 'small strong' }, label),
      h('div', { class: 'spacer' }),
      h('span', { class: 'small mono' }, count)),
    progressBar(t.planned ? (count / t.planned) * 100 : 0, { color, size: 'lg' }));

  const note = t.missed > 2
    ? h('p', { class: 'tiny muted mt-2' }, 'Recurring missed sessions? Rescheduling redistributes that time rather than losing it.')
    : null;

  return h('div', { class: 'card' },
    h('div', { class: 'card-head' }, h('h3', {}, icon('check', 16), ' Completed vs missed')),
    h('div', { class: 'card-pad' },
      h('div', { class: 'row', style: { gap: '10px' } },
        row('Completed', t.completed, 'var(--ok)'),
        row('Missed', t.missed, 'var(--danger)')),
      note));
}

/* ---- page ---- */

export async function analyticsPage({ user, refresh }) {
  let days = 30;
  const container = h('div', { class: 'stack' });

  async function load() {
    const a = await get(`/analytics?days=${days}`);
    draw(a);
  }

  function draw(a) {
    const rangeSeg = h('div', { class: 'seg' },
      ...[7, 14, 30, 90].map((n) => h('button', {
        class: days === n ? 'active' : '',
        onclick: () => { days = n; load(); },
      }, `${n}d`)));

    const leftColumn = h('div', { class: 'stack' },
      dailyCard(a, days),
      subjectCard(a),
      examPrepCard(a));

    const rightColumn = h('div', { class: 'stack' },
      timeMixCard(a),
      productiveCard(a, user),
      weeklyCard(a),
      completedMissedCard(a));

    container.innerHTML = '';
    container.append(
      h('div', { class: 'page-head' },
        h('div', { class: 'grow' },
          h('h2', {}, 'Progress analytics'),
          h('p', {}, 'How your study time is actually spent, and whether the plan is working.')),
        rangeSeg),
      statTiles(a, user),
      h('div', { class: 'grid g-side' }, leftColumn, rightColumn));
  }

  await load();
  return { el: container };
}
