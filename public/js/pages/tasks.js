import { h, icon, toast, fmtDate, relDay, today, addDays } from '../ui.js';
import { get, post, patch, del } from '../api.js';
import {
  progressBar, emptyState, modal, field, textInput, selectInput, rangeInput,
  confirmDialog, stat, insightCard,
} from '../components.js';
import { navigate } from '../app.js';

const TYPES = ['Assignment', 'Project', 'Lab work', 'Presentation', 'Exam', 'Other'];
const PRIORITIES = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

export async function tasksPage({ user, refresh }) {
  const container = h('div', { class: 'stack' });
  let filter = 'active';
  let subjects = [];

  async function load() {
    subjects = (await get('/subjects')).subjects;
    const { tasks } = await get('/tasks');
    draw(tasks);
  }

  function openEditor(existing) {
    const state = {
      title: existing?.title || '',
      type: existing?.type || 'Assignment',
      subjectId: existing?.subjectId || subjects[0]?.id || '',
      dueDate: existing?.dueDate || addDays(today(), 7),
      priority: existing?.priority || 'medium',
      progress: existing?.progress ?? 0,
      notes: existing?.notes || '',
    };
    const errSummary = h('div');
    const progLabel = h('span', { class: 'hint' }, `${state.progress}% complete`);

    const body = h('div', { class: 'stack' },
      errSummary,
      field({ label: 'Title', input: textInput({ name: 'title', value: state.title, placeholder: 'e.g. Calculus Assignment 2' }) }),
      h('div', { class: 'grid g-2' },
        field({ label: 'Type', input: selectInput({ value: state.type, options: TYPES.map((t) => ({ value: t, label: t })), onChange: (v) => { state.type = v; } }) }),
        field({ label: 'Subject', input: selectInput({ value: state.subjectId, options: subjects.map((s) => ({ value: s.id, label: s.name })), onChange: (v) => { state.subjectId = v; } }) })),
      h('div', { class: 'grid g-2' },
        field({ label: 'Submission deadline', input: h('input', { class: 'input', type: 'date', name: 'dueDate', value: state.dueDate, oninput: (e) => { state.dueDate = e.target.value; } }) }),
        field({ label: 'Priority', input: selectInput({ value: state.priority, options: PRIORITIES, onChange: (v) => { state.priority = v; } }) })),
      field({ label: 'Completion percentage', input: rangeInput({ value: state.progress, min: 0, max: 100, step: 10, onInput: (v) => { state.progress = Number(v); progLabel.textContent = `${v}% complete`; } }) }),
      progLabel,
      field({ label: 'Notes', input: h('textarea', { class: 'textarea', name: 'notes', placeholder: 'What exactly needs doing?' }) }));

    const m = modal({
      title: existing ? 'Edit task' : 'Add assignment or project',
      body,
      footer: [
        h('div', { class: 'spacer' }),
        h('button', { class: 'btn', onclick: () => m.close() }, 'Cancel'),
        h('button', { class: 'btn btn-primary', onclick: async (e) => {
          e.currentTarget.disabled = true;
          body.querySelector('textarea').value = state.notes;
          try {
            const res = existing
              ? await patch(`/tasks/${existing.id}`, state)
              : await post('/tasks', state);
            m.close();
            if (res.insights?.length) {
              toast(res.insights[0].message, { kind: 'info', title: res.insights[0].title, duration: 6500 });
            } else {
              toast(existing ? 'Task updated.' : 'Task added. Its subject’s priority has been recalculated.', { kind: 'ok' });
            }
            await load();
          } catch (err) {
            errSummary.append(h('div', { class: 'insight sev-critical' },
              h('div', { class: 'insight-icon' }, icon('x', 15)),
              h('div', {}, h('h4', {}, 'Please fix a few things'), h('p', {}, Object.values(err.fields || {}).join(' ') || err.message))));
            e.currentTarget.disabled = false;
          }
        } }, icon('check', 15), existing ? 'Save' : 'Add task'),
      ],
    });
  }

  function draw(tasks) {
    container.innerHTML = '';
    const active = tasks.filter((t) => t.status !== 'completed');
    const completed = tasks.filter((t) => t.status === 'completed');
    const overdue = active.filter((t) => t.daysLeft !== null && t.daysLeft < 0);
    const dueSoon = active.filter((t) => t.daysLeft !== null && t.daysLeft >= 0 && t.daysLeft <= 3);

    const shown = filter === 'active' ? active : filter === 'completed' ? completed : filter === 'overdue' ? overdue : tasks;

    const subjectById = Object.fromEntries(subjects.map((s) => [s.id, s]));

    function bump(task, delta) {
      const next = Math.max(0, Math.min(100, (task.progress || 0) + delta));
      patch(`/tasks/${task.id}`, { progress: next }).then(() => load())
        .catch((err) => toast(err.message, { kind: 'err' }));
    }

    container.append(
      h('div', { class: 'page-head' },
        h('div', { class: 'grow' },
          h('h2', {}, 'Assignments & deadlines'),
          h('p', {}, 'Deadlines feed the priority algorithm — an approaching submission automatically pulls its subject up the ranking.')),
        h('button', { class: 'btn btn-primary', onclick: () => openEditor(null) }, icon('plus', 15), 'Add task')),

      h('div', { class: 'grid g-4' },
        stat({ label: 'Open tasks', value: active.length, icon: 'tasks', color: 'var(--brand)' }),
        stat({ label: 'Due in 3 days', value: dueSoon.length, icon: 'clock', color: 'var(--warn)' }),
        stat({ label: 'Overdue', value: overdue.length, icon: 'x', color: 'var(--danger)' }),
        stat({ label: 'Completed', value: completed.length, icon: 'check', color: 'var(--ok)' })),

      h('div', { class: 'row', style: { gap: '10px', flexWrap: 'wrap' } },
        h('div', { class: 'seg' },
          ...[['active', 'Active'], ['overdue', 'Overdue'], ['all', 'All'], ['completed', 'Completed']].map(([v, l]) =>
            h('button', { class: filter === v ? 'active' : '', onclick: () => { filter = v; draw(tasks); } }, l))),
        h('div', { class: 'spacer' })),

      shown.length ? h('div', { class: 'card' },
        h('div', { class: 'table-wrap' },
          h('table', { class: 'table' },
            h('thead', {}, h('tr', {},
              h('th', {}, 'Task'), h('th', {}, 'Type'), h('th', {}, 'Subject'),
              h('th', {}, 'Deadline'), h('th', {}, 'Priority'), h('th', {}, 'Progress'), h('th', {}, ''))),
            h('tbody', {},
              shown.map((t) => {
                const subject = subjectById[t.subjectId];
                const urgent = t.daysLeft !== null && t.daysLeft <= 1 && t.status !== 'completed';
                return h('tr', {},
                  h('td', { style: { minWidth: '220px' } },
                    h('div', { class: 'strong' }, t.title),
                    t.notes ? h('div', { class: 'tiny muted trunc', style: { maxWidth: '260px' } }, t.notes) : null),
                  h('td', {}, h('span', { class: 'badge' }, t.type)),
                  h('td', {}, subject
                    ? h('span', { class: 'row', style: { gap: '6px' } },
                        h('span', { style: { width: '8px', height: '8px', borderRadius: '3px', background: subject.color } }),
                        h('span', { class: 'small' }, subject.name))
                    : h('span', { class: 'muted tiny' }, '—')),
                  h('td', {},
                    h('div', { class: 'small' }, fmtDate(t.dueDate)),
                    t.daysLeft === null ? null
                      : t.daysLeft < 0 ? h('span', { class: 'badge danger' }, `${Math.abs(t.daysLeft)}d overdue`)
                      : t.daysLeft === 0 ? h('span', { class: 'badge danger' }, 'Due today')
                      : h('span', { class: 'badge' }, `${t.daysLeft}d left`)),
                  h('td', {}, h('span', { class: `badge ${t.priority === 'high' ? 'danger' : t.priority === 'medium' ? 'warn' : ''}` }, t.priority)),
                  h('td', { style: { minWidth: '160px' } },
                    h('div', { class: 'row', style: { gap: '8px' } },
                      h('div', { style: { flex: '1' } }, progressBar(t.progress, { color: t.progress >= 100 ? 'var(--ok)' : subject?.color })),
                      h('span', { class: 'tiny mono strong' }, `${t.progress || 0}%`)),
                    h('div', { class: 'row', style: { gap: '4px', marginTop: '5px' } },
                      h('button', { class: 'btn btn-sm btn-ghost', onclick: () => bump(t, 10) }, '+10%'),
                      h('button', { class: 'btn btn-sm btn-ghost', onclick: () => bump(t, 25) }, '+25%'),
                      t.progress < 100 ? h('button', { class: 'btn btn-sm btn-ghost', onclick: async () => {
                        await patch(`/tasks/${t.id}`, { progress: 100 }); toast(`${t.title} marked complete.`, { kind: 'ok' }); load();
                      } }, icon('check', 12), 'Done') : null)),
                  h('td', { class: 'tr' },
                    h('div', { class: 'row', style: { gap: '5px', justifyContent: 'flex-end' } },
                      h('button', { class: 'btn btn-sm btn-ghost btn-icon', title: 'Edit', onclick: () => openEditor(t) }, icon('edit', 14)),
                      h('button', { class: 'btn btn-sm btn-ghost btn-icon', title: 'Delete', onclick: async () => {
                        const ok = await confirmDialog({ title: 'Delete task?', message: `“${t.title}” will be removed permanently.`, confirmText: 'Delete' });
                        if (!ok) return;
                        await del(`/tasks/${t.id}`); toast('Task deleted.', { kind: 'ok' }); load();
                      } }, icon('trash', 14)))));
              })),
          )))
        : emptyState({
            ic: 'tasks',
            title: filter === 'active' ? 'No open tasks' : 'Nothing here',
            message: filter === 'active' ? 'You are all caught up. Add an assignment or project deadline to keep the AI informed.' : 'Try a different filter.',
            action: filter === 'active' ? h('button', { class: 'btn btn-primary', onclick: () => openEditor(null) }, icon('plus', 15), 'Add a task') : null,
          }),
    );
  }

  await load();
  return { el: container };
}
