import { h, icon, toast, fmtDate, relDay, pct, today } from '../ui.js';
import { get, post, patch, del } from '../api.js';
import {
  progressBar, subjectProgressText, difficultyBadge, emptyState, modal, field,
  textInput, selectInput, rangeInput, confirmDialog, countdownBadge, rankedBars, donutChart,
} from '../components.js';

const DIFFS = ['Easy', 'Medium', 'Hard'];

function subjectForm(initial = {}) {
  const state = {
    name: initial.name || '',
    difficulty: initial.difficulty || 'Medium',
    preparation: initial.preparation ?? 0,
    priority: initial.priority ?? 3,
    examDate: initial.examDate || '',
  };

  const errSummary = h('div');
  const nameInput = textInput({ name: 'name', value: state.name, placeholder: 'e.g. Mathematics' });
  const diffInput = selectInput({ value: state.difficulty, options: DIFFS.map((d) => ({ value: d, label: d })), onChange: (v) => { state.difficulty = v; } });
  const examInput = h('input', { class: 'input', type: 'date', name: 'examDate', value: state.examDate, oninput: (e) => { state.examDate = e.target.value; } });
  const prepLabel = h('span', { class: 'hint' }, `Currently ${state.preparation}% prepared`);
  const prepInput = rangeInput({ value: state.preparation, min: 0, max: 100, step: 5, onInput: (v) => { state.preparation = Number(v); prepLabel.textContent = `Currently ${v}% prepared`; } });
  const prioLabel = h('span', { class: 'hint' }, `Importance: ${state.priority}/5`);
  const prioInput = rangeInput({ value: state.priority, min: 1, max: 5, step: 1, onInput: (v) => { state.priority = Number(v); prioLabel.textContent = `Importance: ${v}/5`; } });

  const body = h('div', { class: 'stack' },
    errSummary,
    field({ label: 'Subject name', input: nameInput }),
    h('div', { class: 'grid g-2' },
      field({ label: 'Difficulty', input: diffInput }),
      field({ label: 'Exam date', input: examInput, hint: 'Optional — drives countdown & urgency' })),
    field({ label: 'Current preparation level', input: prepInput }),
    prepLabel,
    field({ label: 'Subject importance', input: prioInput }),
    prioLabel,
    h('p', { class: 'tiny muted' }, 'Priority = exam urgency + difficulty + low preparation + deadline pressure + importance + missed sessions.'));

  return { body, state, errSummary, nameInput, prepInput };
}

export async function subjectsPage({ user, refresh }) {
  const container = h('div', { class: 'stack' });
  await load();

  async function load() {
    const { subjects } = await get('/subjects');
    draw(subjects);
  }

  function draw(subjects) {
    container.innerHTML = '';

    function openEditor(existing) {
      const form = subjectForm(existing || {});
      const m = modal({
        title: existing ? `Edit ${existing.name}` : 'Add subject',
        body: form.body,
        footer: [
          h('div', { class: 'spacer' }),
          h('button', { class: 'btn', onclick: () => m.close() }, 'Cancel'),
          h('button', { class: 'btn btn-primary', onclick: async (e) => {
            e.currentTarget.disabled = true;
            try {
              if (existing) {
                const res = await patch(`/subjects/${existing.id}`, form.state);
                toast(`${res.subject.name} updated. Priorities recalculated.`, { kind: 'ok', title: 'Saved' });
              } else {
                const res = await post('/subjects', form.state);
                toast(`${res.subject.name} added. ${res.suggestion}`, { kind: 'ok', title: 'Subject added' });
              }
              m.close();
              await load();
            } catch (err) {
              form.errSummary.append(h('div', { class: 'insight sev-critical' },
                h('div', { class: 'insight-icon' }, icon('x', 15)),
                h('div', {}, h('h4', {}, 'Please fix a few things'), h('p', {}, Object.values(err.fields || {}).join(' ') || err.message))));
              e.currentTarget.disabled = false;
            }
          } }, icon('check', 15), existing ? 'Save changes' : 'Add subject'),
        ],
      });
    }

    const avgPrep = subjects.length ? Math.round(subjects.reduce((a, s) => a + s.preparation, 0) / subjects.length) : 0;

    container.append(
      h('div', { class: 'page-head' },
        h('div', { class: 'grow' },
          h('h2', {}, 'Manage subjects'),
          h('p', {}, 'Preparation, difficulty and exam dates feed directly into the priority algorithm and your daily schedule.')),
        h('button', { class: 'btn btn-primary', onclick: () => openEditor(null) }, icon('plus', 15), 'Add subject')),

      subjects.length ? h('div', { class: 'grid g-4' },
        h('div', { class: 'card card-pad' },
          h('div', { class: 'stat-label' }, 'Subjects'),
          h('div', { class: 'stat-value' }, subjects.length)),
        h('div', { class: 'card card-pad' },
          h('div', { class: 'stat-label' }, 'Avg preparation'),
          h('div', { class: 'stat-value' }, avgPrep, h('small', {}, '%'))),
        h('div', { class: 'card card-pad' },
          h('div', { class: 'stat-label' }, 'Exams scheduled'),
          h('div', { class: 'stat-value' }, subjects.filter((s) => s.examDate).length)),
        h('div', { class: 'card card-pad' },
          h('div', { class: 'stat-label' }, 'Needing attention'),
          h('div', { class: 'stat-value', style: { color: 'var(--warn)' } }, subjects.filter((s) => s.priorityScore > 55).length)),
      ) : null,

      subjects.length ? h('div', { class: 'card' },
        h('div', { class: 'card-head' },
          h('h3', {}, icon('book', 16), ' All subjects'),
          h('span', { class: 'sub' }, 'sorted by AI priority')),
        h('div', { class: 'table-wrap' },
          h('table', { class: 'table' },
            h('thead', {}, h('tr', {},
              h('th', {}, 'Subject'), h('th', {}, 'Difficulty'), h('th', {}, 'Preparation'),
              h('th', {}, 'Priority'), h('th', {}, 'Exam'), h('th', {}, 'Topics'), h('th', {}, ''))),
            h('tbody', {},
              subjects.map((s) => h('tr', {},
                h('td', {},
                  h('div', { class: 'row', style: { gap: '9px' } },
                    h('span', { style: { width: '10px', height: '10px', borderRadius: '3px', background: s.color, flexShrink: 0 } }),
                    h('div', {},
                      h('div', { class: 'strong' }, s.name),
                      h('div', { class: 'tiny muted' }, s.daysToExam !== null ? `Exam ${fmtDate(s.examDate)} · ${relDay(s.examDate)}` : 'No exam date')))),
                h('td', {}, difficultyBadge(s.difficulty)),
                h('td', { style: { minWidth: '150px' } },
                  h('div', { class: 'row', style: { gap: '8px' } },
                    progressBar(s.preparation, { color: s.color, size: 'sm' }),
                    h('span', { class: 'tiny mono strong' }, `${Math.round(s.preparation)}%`))),
                h('td', { style: { minWidth: '120px' } },
                  h('div', { class: 'row', style: { gap: '8px' } },
                    h('span', { class: 'badge brand' }, s.priorityScore),
                    h('div', { style: { flex: '1' } }, progressBar(s.priorityScore, { color: s.priorityScore > 55 ? 'var(--danger)' : s.priorityScore > 30 ? 'var(--warn)' : 'var(--ok)' })))),
                h('td', {}, countdownBadge(s.daysToExam)),
                h('td', {}, h('button', {
                  class: 'btn btn-sm btn-ghost', onclick: () => openTopics(s),
                }, `${s.topics.length} topics`, icon('chevronR', 12))),
                h('td', { class: 'tr' },
                  h('div', { class: 'row', style: { gap: '5px', justifyContent: 'flex-end' } },
                    h('button', { class: 'btn btn-sm btn-ghost btn-icon', title: 'Edit', onclick: () => openEditor(s) }, icon('edit', 14)),
                    h('button', { class: 'btn btn-sm btn-ghost btn-icon', title: 'Delete', onclick: async () => {
                      const ok = await confirmDialog({ title: `Delete ${s.name}?`, message: 'This removes the subject and all of its study sessions. This cannot be undone.', confirmText: 'Delete subject' });
                      if (!ok) return;
                      try { const r = await del(`/subjects/${s.id}`); toast(r.message, { kind: 'ok' }); await load(); }
                      catch (err) { toast(err.message, { kind: 'err' }); }
                    } }, icon('trash', 14)))))),
              ))),
      ) : emptyState({
        ic: 'book', title: 'No subjects yet',
        message: 'Add your subjects with difficulty and preparation level so the AI can build a plan.',
        action: h('button', { class: 'btn btn-primary', onclick: () => openEditor(null) }, icon('plus', 15), 'Add your first subject'),
      }),
    );
  }

  function openTopics(subject) {
    const listEl = h('div', { class: 'stack', style: { gap: '8px' } });

    async function drawTopics() {
      const { subjects } = await get('/subjects');
      const fresh = subjects.find((s) => s.id === subject.id);
      if (!fresh) { m.close(); return; }
      Object.assign(subject, fresh);
      listEl.innerHTML = '';
      const prog = subject.topicProgress || {};

      for (const topic of subject.topics) {
        const st = prog[topic] || {};
        const learned = Boolean(st.learned);
        listEl.append(h('div', { class: 'row', style: { gap: '10px', padding: '10px 12px', background: 'var(--surface-2)', borderRadius: '10px' } },
          h('div', { style: { flex: '1', minWidth: '0' } },
            h('div', { class: 'row', style: { gap: '7px' } },
              h('span', { class: 'small strong' }, topic),
              learned ? h('span', { class: 'badge ok' }, icon('check', 10), 'learned') : null,
              st.revision ? h('span', { class: 'badge info' }, `r${st.revision}`) : null,
              st.practice ? h('span', { class: 'badge' }, `${st.practice} practice`) : null),
            st.nextRevision ? h('div', { class: 'tiny muted', style: { marginTop: '2px' } },
              `Next revision: ${fmtDate(st.nextRevision)} (${relDay(st.nextRevision)})`) : null),
          !learned ? h('button', {
            class: 'btn btn-sm', title: 'Mark learned and start spaced repetition',
            onclick: async () => {
              try {
                const r = await post(`/subjects/${subject.id}/learned`, { topic });
                toast(r.message, { kind: 'ok', title: 'Spaced repetition started' });
                await drawTopics();
              } catch (err) { toast(err.message, { kind: 'err' }); }
            },
          }, 'Mark learned') : null,
          h('button', { class: 'btn btn-sm btn-ghost btn-icon', title: 'Remove topic', onclick: async () => {
            try { await del(`/subjects/${subject.id}/topics/${encodeURIComponent(topic)}`); await drawTopics(); }
            catch (err) { toast(err.message, { kind: 'err' }); }
          } }, icon('trash', 13))));
      }

      if (!subject.topics.length) {
        listEl.append(h('p', { class: 'muted small tc', style: { padding: '18px' } }, 'No topics yet. Add the syllabus topics below.'));
      }
    }

    const addInput = textInput({ name: 'topic', placeholder: 'e.g. Integration by parts' });
    const m = modal({
      title: `${subject.name} — topics`,
      wide: true,
      body: h('div', { class: 'stack' },
        h('p', { class: 'small dim' }, 'Mark a topic as learned and the AI schedules revision at Day 1, 2, 4, 7, 14 and 30 automatically.'),
        listEl,
        h('div', { class: 'row', style: { gap: '8px', alignItems: 'flex-end' } },
          h('div', { style: { flex: '1' } }, field({ label: 'Add a topic', input: addInput })),
          h('button', { class: 'btn', onclick: async () => {
            try {
              await post(`/subjects/${subject.id}/topics`, { topic: addInput.value });
              addInput.value = '';
              await drawTopics();
            } catch (err) { toast(Object.values(err.fields || {})[0] || err.message, { kind: 'err' }); }
          } }, icon('plus', 14), 'Add'))),
      footer: [h('button', { class: 'btn btn-primary', onclick: () => m.close() }, 'Done')],
    });
    drawTopics();
  }

  return { el: container };
}
