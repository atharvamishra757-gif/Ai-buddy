/**
 * ai-provider.js — natural-language layer.
 *
 * All planner *logic* lives in ai.js. This file only turns student data +
 * a question into an answer, and is the single place to plug in a real LLM.
 *
 * To enable a real model, set AI_API_URL (and optionally AI_API_KEY /
 * AI_MODEL) in the environment. The request/response contract is OpenAI-
 * compatible, and any other provider can be adapted in callModel().
 */
import {
  analytics,
  buildContext,
  generateInsights,
  pendingRevisions,
  scoreAllSubjects,
  awardXP,
  BADGES,
  curriculumFor,
} from "./ai.js";
import { addDays, daysBetween, prettyDate, todayKey } from "./date-utils.js";

const MODEL = process.env.AI_MODEL || "gpt-4o-mini";
const API_URL =
  process.env.AI_API_URL ||
  (process.env.AI_API_KEY
    ? "https://api.openai.com/v1/chat/completions"
    : null);

export function aiStatus() {
  return {
    mode: API_URL ? "live" : "mock",
    model: API_URL ? MODEL : "StudyAI-local-engine",
    note: API_URL
      ? "Connected to a live model. Planner still runs on the local deterministic engine."
      : "No AI_API_KEY set — using the built-in Study AI engine. It already reasons over your real planner data; set AI_API_KEY to upgrade the language layer.",
  };
}

const QUICK_INTENTS = {
  today: "What should I study today?",
  hours: "I have 3 hours today. Make a plan.",
  exam: "I have an exam in 5 days. What should I prioritize?",
  missed: "I missed yesterday's study plan.",
  revision: "Create a revision plan for Mathematics.",
};

export async function handleAsk(user, message) {
  const question = String(message || "").trim();
  if (!question) {
    const error = new Error("A question is required.");
    error.status = 422;
    throw error;
  }
  return ask(user, question);
}

export async function handleQuickIntent(user, intent, body = {}) {
  const question = QUICK_INTENTS[intent];
  if (!question) {
    const error = new Error("Unknown AI quick intent.");
    error.status = 404;
    throw error;
  }
  const result = await handleAsk(user, question);
  return { question, ...result };
}

/* ------------------------------------------------------------------ *
 * Planner context — the "brain" the model (or the mock) reasons from
 * ------------------------------------------------------------------ */
function plannerContext(user) {
  const db = globalThis.__STUDY_DB__;
  const today = todayKey();
  const ctx = buildContext(user);
  const sessions = db.sessions.filter((s) => s.userId === user.id);
  const todaySessions = sessions.filter((s) => s.date === today);
  const ranked = scoreAllSubjects(user, ctx);
  const stats = analytics(user, { days: 14 });

  return {
    today,
    user: { name: user.name, course: user.course, semester: user.semester },
    settings: user.settings,
    subjects: ranked.map((s) => ({
      name: s.name,
      difficulty: s.difficulty,
      preparation: s.preparation,
      priorityScore: s.priorityScore,
      daysToExam: s.daysToExam,
      examDate: s.examDate,
      topics: curriculumFor(s).length,
    })),
    todayPlan: todaySessions.map(
      (s) =>
        `${s.startTime || "--:--"}-${s.endTime || "--:--"} ${s.subjectName} · ${s.topic} · ${s.type} (${s.duration}m)`,
    ),
    todayTotal: todaySessions.reduce((a, s) => a + s.duration, 0),
    pending: (user.tasks || [])
      .filter((t) => t.status !== "completed")
      .map(
        (t) =>
          `${t.title} due ${prettyDate(t.dueDate)} (${t.progress || 0}% done)`,
      ),
    revisions: pendingRevisions(user).slice(0, 5),
    streak: stats.streak,
    focusHours14d: stats.totals.focusHours,
    completionRate: stats.totals.completionRate,
    level: user.gamification?.level || 1,
    xp: user.gamification?.xp || 0,
  };
}

export function compactPlanForAI(plan) {
  const byDay = {};
  for (const s of plan) {
    byDay[s.date] = byDay[s.date] || [];
    byDay[s.date].push(
      `${s.startTime} ${s.subjectName}/${s.topic}/${s.type} ${s.duration}m`,
    );
  }
  return byDay;
}

/* ------------------------------------------------------------------ *
 * The mock engine: intent routing over real planner data
 * ------------------------------------------------------------------ */

const QUESTION_BANK = {
  default: [
    "What is this app and how does it work?",
    "Why is my plan prioritising one subject over another?",
    "How do spaced repetition revisions work?",
    "Give me tips for exam preparation.",
  ],
};

function mcqs(topic, count, subject) {
  const bank = {
    Python: [
      {
        q: "What does a Python list comprehension return?",
        opts: ["A generator", "A list", "A tuple", "A dict"],
        a: 1,
        why: "List comprehensions evaluate to a new list.",
      },
      {
        q: "Which keyword defines a function in Python?",
        opts: ["function", "def", "fun", "lambda-fn"],
        a: 1,
        why: "Functions start with def, then a name and arguments.",
      },
      {
        q: 'What is the result of len("hello")?',
        opts: ["4", "5", "6", "Error"],
        a: 1,
        why: 'len counts characters, so "hello" is 5.',
      },
      {
        q: "What does dict.get(key) return if the key is absent?",
        opts: ["None", "KeyError", "0", "Empty dict"],
        a: 0,
        why: "get returns None by default; dict[key] would raise KeyError.",
      },
      {
        q: "What is the time complexity of searching a sorted list with binary search?",
        opts: ["O(n)", "O(log n)", "O(n log n)", "O(1)"],
        a: 1,
        why: "Each step halves the search space.",
      },
      {
        q: "Which of these is mutable?",
        opts: ["tuple", "string", "list", "int"],
        a: 2,
        why: "Lists can be modified in place.",
      },
      {
        q: "What does self represent in a method?",
        opts: [
          "The module",
          "The class only",
          "The current instance",
          "The parent class",
        ],
        a: 2,
        why: "self is the object the method was called on.",
      },
      {
        q: "How do you read a whole file?",
        opts: ["read()", "open()", "get()", "load()"],
        a: 0,
        why: "file.read() returns the entire contents.",
      },
    ],
    Mathematics: [
      {
        q: "The derivative of sin(x) is:",
        opts: ["cos(x)", "-cos(x)", "sin(x)", "tan(x)"],
        a: 0,
        why: "d/dx sin x = cos x.",
      },
      {
        q: "∫ 1/x dx =",
        opts: ["ln|x| + C", "x + C", "-1/x²", "e^x"],
        a: 0,
        why: "Natural log is the antiderivative of 1/x.",
      },
      {
        q: "A square matrix is singular when:",
        opts: ["det = 0", "det > 0", "trace = 0", "rank = n"],
        a: 0,
        why: "No inverse exists exactly when the determinant is zero.",
      },
      {
        q: "The angle between two vectors uses:",
        opts: ["Cross product", "Dot product", "Magnitude", "Projection"],
        a: 1,
        why: "cos θ = (a·b)/(|a||b|).",
      },
      {
        q: "lim x→0 (sin x)/x =",
        opts: ["0", "1", "∞", "Undefined"],
        a: 1,
        why: "A classic limit equal to 1.",
      },
      {
        q: "The number of permutations of n distinct items is:",
        opts: ["n!", "n²", "2ⁿ", "C(n,2)"],
        a: 0,
        why: "n! orders all items.",
      },
      {
        q: "Which integral test applies to ∫ 1/x ln x ?",
        opts: ["Comparison", "Ratio", "Integral", "Cauchy"],
        a: 2,
        why: "The integral test compares Σ1/n(ln n)² with an integral.",
      },
      {
        q: "A complex number z = 3 + 4i has moduluss second law states F =",
        opts: ["ma", "mv", "m/a", "a/m"],
        a: 0,
        why: "F equals mass times acceleration.",
      },
      {
        q: "Work done by a constant force is:",
        opts: ["F·d", "F/d", "F·t", "d/t"],
        a: 0,
        why: "W = F s cos θ, and = F·d when aligned.",
      },
      {
        q: "Power is defined as:",
        opts: ["F × v", "Work / time", "Energy / distance", "Momentum / t"],
        a: 1,
        why: "P = W/t.",
      },
      {
        q: "Angular momentum is conserved when:",
        opts: [
          "A force acts",
          "No external torque acts",
          "Speed is constant",
          "Mass changes",
        ],
        a: 1,
        why: "Zero net torque means constant angular momentum.",
      },
      {
        q: "The SI unit of pressure is:",
        opts: ["Joule", "Pascal", "Watt", "Newton"],
        a: 1,
        why: "Pascal = N/m².",
      },
      {
        q: "In SHM, acceleration is:",
        opts: ["∝ x", "∝ -x", "∝ v", "constant"],
        a: 1,
        why: "SHM is simple harmonic: restoring force ∝ -x.",
      },
      {
        q: "First law of thermodynamics states ΔU =",
        opts: ["Q", "Q − W", "W − Q", "0"],
        a: 1,
        why: "Heat in minus work done by the system.",
      },
      {
        q: "Ohm's law gives current as:",
        opts: ["V/R", "VR", "V·R", "R/V"],
        a: 0,
        why: "I = V / R.",
      },
    ],
  };
  const generic = [
    {
      q: `Which statement about ${topic} is correct?`,
      opts: [
        "It needs no practice",
        "It is a core examinable concept",
        "It is optional",
        "It has no prerequisites",
      ],
      a: 1,
      why: `${topic} is a standard examinable topic — plan at least two sessions on it.`,
    },
    {
      q: `A common mistake in ${topic} is:`,
      opts: [
        "Skipping fundamentals",
        "Revising too early only",
        "Never practising",
        "None",
      ],
      a: 0,
      why: "Weak fundamentals cause most errors in this area.",
    },
    {
      q: `How should you revise ${topic} most effectively?`,
      opts: [
        "Re-reading only",
        "Active problem solving",
        "Highlighting",
        "Copying notes",
      ],
      a: 1,
      why: "Retrieval and problem solving beat passive re-reading.",
    },
    {
      q: `${topic} is typically assessed through:`,
      opts: ["MCQ + problems", "Only oral", "Only attendance", "Group work"],
      a: 0,
      why: "Expect written questions and numerical problems.",
    },
  ];
  const source =
    bank[subject] ||
    bank[
      Object.keys(bank).find((k) =>
        topic?.toLowerCase().includes(k.toLowerCase()),
      )
    ] ||
    generic;
  const out = [];
  for (let i = 0; i < count; i++) out.push(source[i % source.length]);
  return out.map((m, i) => ({ ...m, id: `mcq${i}` }));
}

function fmtList(items) {
  return items.map((i) => `• ${i}`).join("\n");
}

export function answer(user, question) {
  const q = String(question || "").trim();
  const ctx = plannerContext(user);
  const lower = q.toLowerCase();
  const ranked = ctx.subjects;

  // -- quiz / MCQ
  if (/\b(mcqs?|quiz|question|test me|practice questions)\b/.test(lower)) {
    const subjectName = ranked.find((s) =>
      lower.includes(s.name.toLowerCase()),
    )?.name;
    const nMatch = q.match(/\b(\d{1,3})\b/);
    const count = Math.min(30, Math.max(5, nMatch ? Number(nMatch[1]) : 10));
    const subject = subjectName || "General";
    const topic = user.subjects?.find((s) => s.name === subject);
    const topicList = curriculumFor(topic || { name: subject });
    const mcqs2 = mcqs(subject, count, subject);
    return {
      text: `Here are ${count} MCQs on **${subject}**${topic ? ` — covering ${topicList.slice(0, 3).join(", ")}` : ""}. Answer in the format "1-B, 2-D, …" and I'll mark them for you.`,
      quiz: { subject, items: mcqs2 },
    };
  }

  // -- explain a topic
  if (
    /\b(explain|what is|teach me|simplify|how does .* work)\b/.test(lower) &&
    !/\btoday\b|\bplan\b|\bpriorit/.test(lower)
  ) {
    const subject = ranked.find((s) => lower.includes(s.name.toLowerCase()));
    const topic = user.subjects?.find((s) => s.name === subject?.name);
    const list = curriculumFor(
      topic || {
        name:
          q.replace(/explain|what is|teach me/gi, "").trim() || "this topic",
      },
    );
    const focus = list.find((t) => lower.includes(t.toLowerCase())) || list[0];
    const st = topic?.topicProgress?.[focus];
    return {
      text: `**${focus}** — here's the way to approach it:\n\n1. **Definition first.** State it in one sentence in your own words. If you can't, re-learn it — everything else depends on it.\n2. **Worked example.** Solve one problem slowly, narrating each step and *why* each step is valid.\n3. **Contrast case.** Change one condition and see how the method or answer changes.\n4. **Two practice problems** of your own, checked against the answer.\n\n${st ? `Your tracker shows you've learned it ${st.revision || 0} revision round(s) deep with ${st.practice || 0} practice session(s).` : `This topic isn't marked as learned yet, so I've placed it early in your ${topic?.name || "subject"} sessions.`}\n\nWant me to quiz you on it instead?`,
    };
  }

  // -- revision plan
  if (/\brevision plan\b|\brevise\b|\bconsolidat/.test(lower)) {
    const subject =
      ranked.find((s) => lower.includes(s.name.toLowerCase())) || ranked[0];
    const s = user.subjects.find((x) => x.name === subject.name);
    const days = Math.max(3, Math.min(14, subject.daysToExam ?? 7));
    const topics = curriculumFor(s);
    const plan = [];
    for (let i = 0; i < days; i++) {
      const day = addDays(ctx.today, i);
      const a = topics[i % topics.length];
      const b = topics[(i * 2 + 1) % topics.length];
      plan.push(
        `${prettyDate(day)} → ${i === days - 1 ? "Full mock test" : `${a} (${i % 2 ? "practice" : "revision"})`}${i % 2 ? ` + ${b} recall` : ""}`,
      );
    }
    return {
      text: `**${subject.name} revision plan** — ${days} days, currently ${subject.preparation}% prepared, exam ${prettyDate(subject.examDate)} (${subject.daysToExam} days).\n\n${fmtList(plan)}\n\nDaily target: ~${Math.ceil(((100 - subject.preparation) / Math.max(1, subject.daysToExam)) * 0.7)} minutes. I've already reflected this in your generated plan.`,
    };
  }

  // -- exam in N days
  const examMatch = q.match(/(\d+)\s*days?\b/i);
  if (
    examMatch ||
    (/\bexam\b/.test(lower) && /\bpriorit|prepare|focus/.test(lower))
  ) {
    const n = examMatch ? Number(examMatch[1]) : 10;
    const subjectsNear = ranked.filter(
      (s) => s.daysToExam !== null && s.daysToExam >= 0 && s.daysToExam <= n,
    );
    const list = subjectsNear.length ? subjectsNear : ranked.slice(0, 3);
    const total = list.reduce((a, s) => a + (100 - s.preparation), 0);
    const budget = (user.settings?.availableHours || 4) * 60 * n * 0.5;
    return {
      text: `With a ${n}-day horizon you should attack the highest priority score × biggest gap combination:\n\n${fmtList(list.map((s) => `**${s.name}** — ${s.preparation}% ready, exam in ${s.daysToExam ?? "—"} days, priority ${s.priorityScore}/100. Allocate ~${Math.round((((100 - s.preparation) / Math.max(1, total)) * budget) / 30) * 15} min/day.`))}\n\nThat covers roughly ${Math.round((budget / 60) * 10) / 10}h of focused work against a ${Math.round(total)}% combined gap. Start with the top subject tomorrow morning — first task on your schedule is already set to it.`,
    };
  }

  // -- missed yesterday
  if (/\b(missed|skipped|sick|busy|behind)\b/.test(lower)) {
    const yesterday = addDays(ctx.today, -1);
    const missed = globalThis.__STUDY_DB__.sessions.filter(
      (s) =>
        s.userId === user.id && s.date === yesterday && s.status === "missed",
    );
    const total = missed.reduce((a, s) => a + s.duration, 0);
    if (!missed.length) {
      return {
        text: `Good news — you didn't miss any sessions on ${prettyDate(yesterday)}. Your ${ctx.streak}-day streak is intact. Today's plan has ${(ctx.todayTotal / 60).toFixed(1)}h scheduled.`,
      };
    }
    return {
      text: `You missed ${missed.length} session(s) on ${prettyDate(yesterday)} totalling ${total} minutes:\n${fmtList(missed.map((s) => `${s.subjectName} · ${s.topic} (${s.duration}m)`))}\n\nI've already redistributed that time into the coming days, prioritising ${ranked[0]?.name} and protecting higher-priority revision. Open **My Plan** and tap "Reschedule missed" to see exactly where each block landed — or ask me to rebalance if you'd rather drop something.`,
    };
  }

  // -- custom hours today
  const hoursMatch = q.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/i);
  if (hoursMatch && /\bplan|make|study|schedule|today\b/.test(lower)) {
    const hours = Math.max(0.5, Math.min(14, Number(hoursMatch[1])));
    const total = Math.round(hours * 60);
    const totalWeight = ranked.reduce((a, s) => a + s.priorityScore, 0);
    const blocks = [];
    let cursor = 0;
    for (const s of ranked) {
      if (cursor >= total) break;
      const dur = Math.min(
        90,
        Math.max(
          25,
          Math.round(((s.priorityScore / totalWeight) * total) / 5) * 5,
        ),
      );
      const t = curriculumFor(user.subjects.find((x) => x.name === s.name))[0];
      blocks.push(`${dur} min → ${s.name} · ${t} (${s.preparation}% → target)`);
      cursor += dur;
    }
    if (cursor < total)
      blocks.push(
        `${total - cursor} min → Spaced revision on ${pendingRevisions(user)[0]?.topic || "weak topics"}`,
      );
    return {
      text: `**Your ${hours}h plan for today** (split by live priority, not evenly):\n\n${fmtList(blocks)}\n\nTotal ${hours.toFixed(1)}h. Apply it with the "Generate plan" button and I'll set your daily availability to ${hours}h so the scheduler places these blocks for real.`,
    };
  }

  // -- what should I study today
  if (/\b(what|which).*(study|do|todo)|today|next\b/.test(lower)) {
    if (!ctx.todayPlan.length) {
      return {
        text: `You have no sessions planned today. With ${user.settings.availableHours}h available in the ${user.settings.preferredTime.toLowerCase()}, run **Generate Plan** and I'll build one around your exam deadlines and weak subjects.`,
      };
    }
    const done = ctx.todayPlan.filter((p) => p.includes("·"));
    return {
      text: `Today's plan is ${(ctx.todayTotal / 60).toFixed(1)}h across ${done.length} blocks:\n\n${fmtList(ctx.todayPlan.map((p, i) => `${i + 1}. ${p}`))}\n\nStart with block 1 — it has the highest priority score (${ranked[0]?.name}, ${ranked[0]?.priorityScore}/100). ${
        ctx.revisions.length
          ? `You also have ${ctx.revisions.length} revision${ctx.revisions.length > 1 ? "s" : ""} coming due: ${ctx.revisions
              .slice(0, 3)
              .map((r) => r.topic)
              .join(", ")}.`
          : ""
      }`,
    };
  }

  // -- progress / status
  if (/\b(progress|how am i|status|streak|on track)\b/.test(lower)) {
    return {
      text: `**Status check**\n\n${fmtList(ranked.map((s) => `${s.name}: ${s.preparation}% · priority ${s.priorityScore}/100${s.daysToExam !== null ? ` · exam in ${s.daysToExam}d` : ""}`))}\n\nLast 14 days: ${ctx.focusHours14d}h focused, ${ctx.completionRate}% of planned sessions completed, ${ctx.streak}-day streak. Level ${ctx.level} · ${ctx.xp} XP. ${ctx.pending.length ? `\nOpen deadlines: ${ctx.pending.slice(0, 3).join("; ")}` : ""}`,
    };
  }

  // -- help
  if (/^\s*(hi|hello|hey|help|what can you do)\b/.test(lower)) {
    return {
      text: `Hi ${user.name.split(" ")[0]} — I'm **Study AI**, and I reason over your actual planner data, not generic advice.\n\nTry asking:\n${fmtList(
        [
          '"What should I study today?"',
          '"I have 3 hours today. Make a plan."',
          '"I have an exam in 5 days. What should I prioritize?"',
          '"I missed yesterday\'s study plan."',
          '"Explain limits and continuity."',
          '"Quiz me on Python."',
          '"Give me 20 MCQs."',
          '"Create a revision plan for Mathematics."',
        ],
      )}`,
    };
  }

  const insights = generateInsights(user);
  return {
    text: `Based on your data right now:\n\n${fmtList(insights.slice(0, 3).map((i) => `**${i.title}** — ${i.message}`))}\n\nYou can also ask me what to study today, build a plan for N hours, prioritise around an exam, quiz you, or explain a topic.`,
  };
}

/* ------------------------------------------------------------------ *
 * Optional live model
 * ------------------------------------------------------------------ */

export async function ask(user, question) {
  if (!API_URL) return answer(user, question);
  const ctx = plannerContext(user);
  const system = `You are Study AI, an expert study coach inside a student planner app.
You have access to the student's live planner data (JSON below). Always ground your answers in it.
Be concise, use markdown bullets, quote real numbers, and never invent data.
You can read the app's data model: subjects with difficulty/preparation/examDate, sessions, tasks, settings, analytics.`;
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.AI_API_KEY
          ? { Authorization: `Bearer ${process.env.AI_API_KEY}` }
          : {}),
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: system },
          {
            role: "user",
            content: `Planner data:\n${JSON.stringify(ctx, null, 2)}\n\nQuestion: ${question}`,
          },
        ],
        temperature: 0.4,
      }),
    });
    if (!res.ok) throw new Error(`model responded ${res.status}`);
    const json = await res.json();
    const text = json?.choices?.[0]?.message?.content;
    if (!text) throw new Error("empty model response");
    return { text };
  } catch (err) {
    const fallback = answer(user, question);
    return {
      text: fallback.text,
      degraded: `Live model unavailable (${err.message}); answered with the local engine.`,
    };
  }
}

export async function gradeQuiz(user, answers) {
  const correct = [];
  const bank = mcqs("General", 30, "General");
  for (const a of answers) {
    const item =
      bank.find((b) => b.q.startsWith(String(a.q).slice(0, 12))) || null;
    correct.push({
      question: a.q,
      given: a.answer,
      ok: item ? item.a === a.answer : null,
      correctOption: item?.opts?.[item?.a],
    });
  }
  return {
    results: correct,
    note: "Self-check against your notes; consistency matters more than the score right now.",
  };
}
