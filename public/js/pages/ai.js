import { h, icon, toast, fmtMinutes } from '../ui.js';
import { get, post } from '../api.js';
import { mdToHtml, emptyState, modal, field } from '../components.js';
import { navigate } from '../app.js';

const QUICK = [
  { icon: 'sun', label: 'What should I study today?', intent: 'today' },
  { icon: 'clock', label: 'I have 3 hours today', intent: 'hours' },
  { icon: 'exam', label: 'Exam in 5 days?', intent: 'exam' },
  { icon: 'refresh', label: 'I missed yesterday', intent: 'missed' },
  { icon: 'refresh', label: 'Revision plan for Maths', intent: 'revision' },
];

const EXAMPLES = [
  'Explain limits and continuity',
  'Quiz me on Python',
  'Give me 20 MCQs',
  'How am I doing on my exams?',
];

export async function aiPage({ user, refresh }) {
  const container = h('div', { class: 'stack' });
  const status = await get('/ai/status');
  const dashboard = await get('/dashboard');

  const history = [];
  const scroll = h('div', { class: 'chat-scroll' });
  const input = h('textarea', { class: 'textarea', placeholder: 'Ask about your plan, an exam, a topic, or request a quiz…', rows: 1 });

  function pushMessage(role, content, extra = {}) {
    const el = h('div', { class: `msg ${role}` },
      h('div', { class: 'msg-avatar' }, role === 'ai' ? 'S' : (user?.name?.[0] || 'U')),
      h('div', { class: 'msg-bubble', html: mdToHtml(content) }));
    history.push({ role, content, ...extra });
    scroll.append(el);
    scroll.scrollTop = scroll.scrollHeight;
    return el;
  }

  function pushQuiz(quiz) {
    const wrap = h('div', { class: 'msg ai' },
      h('div', { class: 'msg-avatar' }, 'S'),
      h('div', { class: 'msg-bubble' }));
    const bubble = wrap.querySelector('.msg-bubble');
    const answers = {};
    const feedback = h('div', { class: 'mt-2' });

    const cards = quiz.items.map((item, qi) => {
      const opts = h('div', { class: 'stack', style: { gap: '6px', marginTop: '8px' } });
      const keyLabels = ['A', 'B', 'C', 'D'];
      const buttons = item.opts.map((o, oi) => h('button', {
        class: 'quiz-opt',
        onclick: () => {
          answers[qi] = oi;
          for (const b of buttons) b.classList.remove('selected');
          buttons[oi].classList.add('selected');
        },
      }, h('span', { class: 'quiz-key' }, keyLabels[oi]), h('span', {}, o)));
      for (const b of buttons) opts.append(b);
      return h('div', {},
        h('div', { class: 'small strong', style: { marginTop: qi ? '12px' : '4px' } }, `${qi + 1}. ${item.q}`),
        opts);
    });

    const submit = h('button', { class: 'btn btn-primary btn-sm mt-2', onclick: () => {
      const unanswered = quiz.items.filter((_, i) => answers[i] === undefined).length;
      if (unanswered) { toast(`Answer all ${unanswered} remaining question(s).`, { kind: 'info' }); return; }
      const correct = quiz.items.filter((item, i) => answers[i] === item.a).length;
      feedback.innerHTML = '';
      feedback.append(
        h('div', { class: 'insight sev-ok mt-2' },
          h('div', { class: 'insight-icon' }, icon('check', 15)),
          h('div', {},
            h('h4', {}, `You scored ${correct}/${quiz.items.length} (${Math.round(correct / quiz.items.length * 100)}%)`),
            h('p', {}, correct / quiz.items.length >= 0.8
              ? 'Strong recall. Move to harder practice problems or a mock test.'
              : 'Review the explanations, then retake this quiz tomorrow — spaced repetition will lock it in.'))),
        h('div', { class: 'stack', style: { gap: '6px', marginTop: '10px' } },
          quiz.items.map((item, i) => h('div', { class: 'small', style: { color: answers[i] === item.a ? 'var(--ok)' : 'var(--danger)' } },
            icon(answers[i] === item.a ? 'check' : 'x', 12), ` ${i + 1}. Correct: ${item.opts[item.a]} — ${item.why}`))));
      submit.remove();
    } }, icon('check', 14), 'Check answers');

    bubble.append(h('p', {}, `**${quiz.subject} quiz** — ${quiz.items.length} questions. Pick an answer for each.`), ...cards, submit, feedback);
    scroll.append(wrap);
    scroll.scrollTop = scroll.scrollHeight;
  }

  async function ask(question) {
    if (!question.trim()) return;
    pushMessage('user', question);
    const typing = h('div', { class: 'msg ai' },
      h('div', { class: 'msg-avatar' }, 'S'),
      h('div', { class: 'msg-bubble' }, h('div', { class: 'typing' }, h('i'), h('i'), h('i'))));
    scroll.append(typing);
    scroll.scrollTop = scroll.scrollHeight;
    sendBtn.disabled = true;

    try {
      const res = await post('/ai/ask', { message: question });
      typing.remove();
      pushMessage('ai', res.text);
      if (res.quiz) pushQuiz(res.quiz);
      if (res.degraded) toast(res.degraded, { kind: 'info', title: 'Using local engine' });
    } catch (err) {
      typing.remove();
      pushMessage('ai', `I couldn't process that: ${err.message}`);
    }
    sendBtn.disabled = false;
    input.value = '';
    input.style.height = 'auto';
  }

  const sendBtn = h('button', { class: 'btn btn-primary', style: { height: '44px', padding: '0 16px' }, onclick: () => ask(input.value) }, icon('arrow', 17));

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(input.value); }
  });
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(130, input.scrollHeight) + 'px';
  });

  async function runIntent(intent) {
    sendBtn.disabled = true;
    const typing = h('div', { class: 'msg ai' },
      h('div', { class: 'msg-avatar' }, 'S'),
      h('div', { class: 'msg-bubble' }, h('div', { class: 'typing' }, h('i'), h('i'), h('i'))));
    scroll.append(typing);
    try {
      const res = await post(`/ai/quick/${intent}`);
      typing.remove();
      pushMessage('user', res.question);
      pushMessage('ai', res.text);
    } catch (err) {
      typing.remove();
      toast(err.message, { kind: 'err' });
    }
    sendBtn.disabled = false;
  }

  // Greeting grounded in real data
  const first = dashboard.subjects[0];
  const greeting = `Hi ${user?.name?.split(' ')[0] || 'there'} — I'm **Study AI**. I reason over your actual planner: ${dashboard.subjects.length} subjects, ${dashboard.exams.length} exams, ${fmtMinutes(dashboard.today.totalMinutes)} planned today, and a ${dashboard.streak}-day streak.\n\n${first ? `Right now your top priority is **${first.name}** (${first.preparation}% prepared${first.daysToExam !== null ? `, exam in ${first.daysToExam} days` : ''}).` : ''}\n\nAsk me anything, or tap a suggestion below.`;

  container.append(
    h('div', { class: 'page-head' },
      h('div', { class: 'grow' },
        h('h2', {}, icon('ai', 18), ' Study AI'),
        h('p', {}, 'Every answer is grounded in your real subjects, exams, deadlines and study history — not generic advice.')),
      h('span', { class: `badge ${status.mode === 'live' ? 'ok' : ''}` },
        h('span', { class: 'badge-dot' }), status.mode === 'live' ? `Live · ${status.model}` : 'Local engine')),

    h('div', { class: 'card' },
      h('div', { class: 'chat-wrap' }, scroll,
        h('div', { class: 'suggestions' },
          ...QUICK.map((q) => h('button', { class: 'chip', onclick: () => runIntent(q.intent) }, icon(q.icon, 13), q.label)),
          ...EXAMPLES.map((q) => h('button', { class: 'chip', onclick: () => ask(q) }, q))),
        h('div', { class: 'chat-input' }, input, sendBtn)),
      h('div', { class: 'card-foot row', style: { gap: '10px', flexWrap: 'wrap' } },
        h('span', { class: 'tiny muted' }, status.note),
        h('div', { class: 'spacer' }),
        h('button', { class: 'btn btn-sm btn-ghost', onclick: () => { history.length = 0; scroll.innerHTML = ''; pushMessage('ai', greeting); } }, icon('refresh', 13), 'Clear chat'))),

    h('div', { class: 'grid g-3' },
      h('div', { class: 'card card-pad' },
        h('div', { class: 'row', style: { gap: '8px', marginBottom: '8px' } }, h('span', { class: 'stat-icon' }, icon('today' in {} ? 'calendar' : 'sun', 15)), h('b', { class: 'small' }, 'Plan today')),
        h('p', { class: 'small dim' }, dashboard.today.sessions.length
          ? `${dashboard.today.sessions.length} sessions · ${fmtMinutes(dashboard.today.totalMinutes)} scheduled.`
          : 'Nothing scheduled today.'),
        h('button', { class: 'btn btn-sm btn-block mt-1', onclick: () => runIntent('today') }, 'Ask what to study')),
      h('div', { class: 'card card-pad' },
        h('div', { class: 'row', style: { gap: '8px', marginBottom: '8px' } }, h('span', { class: 'stat-icon' }, icon('exam', 15)), h('b', { class: 'small' }, 'Exam strategy')),
        h('p', { class: 'small dim' }, dashboard.exams.filter((e) => e.daysToExam <= 7).length
          ? `${dashboard.exams.filter((e) => e.daysToExam <= 7).length} exam(s) within a week.`
          : 'No exams in the next week.'),
        h('button', { class: 'btn btn-sm btn-block mt-1', onclick: () => runIntent('exam') }, 'Get priorities')),
      h('div', { class: 'card card-pad' },
        h('div', { class: 'row', style: { gap: '8px', marginBottom: '8px' } }, h('span', { class: 'stat-icon' }, icon('refresh', 15)), h('b', { class: 'small' }, 'Missed work')),
        h('p', { class: 'small dim' }, 'The AI redistributes missed time instead of writing it off.'),
        h('button', { class: 'btn btn-sm btn-block mt-1', onclick: () => runIntent('missed') }, 'Rebalance plan')),
    ),
  );

  pushMessage('ai', greeting);
  setTimeout(() => input.focus(), 100);

  return { el: container };
}
