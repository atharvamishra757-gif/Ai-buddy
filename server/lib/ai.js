/**
 * ai.js — the planner brain.
 *
 * Everything here is deterministic and explainable: given a student's
 * subjects, exams, deadlines, preparation levels and available hours it
 * produces a realistic day-by-day schedule, re-prioritises as data changes,
 * redistributes missed work, and derives spaced-repetition revision points.
 *
 * It is intentionally a *service* with a pure compute core, so `provider.js`
 * can swap the natural-language layer for a real LLM without touching logic.
 */
import { uid } from "./store.js";
import {
  addDays,
  clamp,
  dayOfWeek,
  daysBetween,
  todayKey,
  windowFor,
  minutesToHHMM,
} from "./date-utils.js";

/* ------------------------------------------------------------------ *
 * 1. PRIORITY ENGINE
 * ------------------------------------------------------------------ */

/**
 * priority = exam urgency
 *          + difficulty
 *          + low preparation
 *          + assignment deadline urgency
 *          + subject importance
 *          + missed sessions
 *
 * Each component is normalised to 0..~1 then weighted, giving a 0..100 score.
 */
export function subjectPriority(subject, profile, ctx) {
  const today = ctx.today;
  const parts = {};

  // -- exam urgency (exponential decay as the exam approaches)
  if (subject.examDate) {
    const d = daysBetween(today, subject.examDate);
    if (d < 0) {
      parts.examUrgency = 0; // exam passed
    } else {
      // 0 days out => 1.0, 30 days out => ~0.1
      parts.examUrgency = clamp(Math.exp(-d / 12), 0.02, 1);
    }
  } else {
    parts.examUrgency = 0.15;
  }

  // -- difficulty
  parts.difficulty =
    { Easy: 0.25, Medium: 0.6, Hard: 1 }[subject.difficulty] ?? 0.6;

  // -- low preparation (inverse)
  const prep = clamp(Number(subject.preparation || 0), 0, 100);
  parts.lowPrep = clamp(1 - prep / 100, 0, 1) ** 1.3;

  // -- assignment deadline urgency
  const openTasks = (ctx.tasks || []).filter(
    (t) => t.subjectId === subject.id && t.status !== "completed",
  );
  if (openTasks.length) {
    let sum = 0;
    for (const t of openTasks) {
      const d = t.dueDate ? daysBetween(today, t.dueDate) : 14;
      sum += clamp(Math.exp(-Math.max(d, 0) / 8), 0.03, 1);
    }
    parts.deadlineUrgency = clamp(sum / openTasks.length, 0, 1);
  } else {
    parts.deadlineUrgency = 0;
  }

  // -- declared importance (1 = low, 5 = core)
  parts.importance = clamp((Number(subject.priority || 3) - 1) / 4, 0, 1);

  // -- missed sessions hurt
  const missed = (ctx.missedBySubject || {})[subject.id] || 0;
  parts.missed = clamp(missed / 3, 0, 1);

  const weights = {
    examUrgency: 30,
    difficulty: 14,
    lowPrep: 22,
    deadlineUrgency: 12,
    importance: 14,
    missed: 8,
  };

  let score = 0;
  for (const k of Object.keys(weights)) score += (parts[k] || 0) * weights[k];
  return {
    score: Math.round(clamp(score, 0, 100)),
    parts: Object.fromEntries(
      Object.entries(parts).map(([k, v]) => [k, Number(v.toFixed(2))]),
    ),
    daysToExam: subject.examDate ? daysBetween(today, subject.examDate) : null,
  };
}

export function buildContext(user) {
  const db = globalThis.__STUDY_DB__;
  const today = todayKey();
  const tasks = user.tasks || [];
  const sessions = db.sessions.filter((s) => s.userId === user.id);

  const missedBySubject = {};
  const completedBySubject = {};
  for (const s of sessions) {
    if (s.status === "missed")
      missedBySubject[s.subjectId] = (missedBySubject[s.subjectId] || 0) + 1;
    if (s.status === "completed") {
      completedBySubject[s.subjectId] =
        (completedBySubject[s.subjectId] || 0) + (s.duration || 0);
    }
  }
  return { today, tasks, sessions, missedBySubject, completedBySubject, user };
}

export function scoreAllSubjects(user, ctx = buildContext(user)) {
  return (user.subjects || [])
    .filter((s) => !s.archived)
    .map((s) => {
      const p = subjectPriority(s, user, ctx);
      return {
        ...s,
        priorityScore: p.score,
        priorityParts: p.parts,
        daysToExam: p.daysToExam,
      };
    })
    .sort((a, b) => b.priorityScore - a.priorityScore);
}

/* ------------------------------------------------------------------ *
 * 2. TOPIC / CURRICULUM ENGINE
 * ------------------------------------------------------------------ */

const DEFAULT_CURRICULUM = {
  Mathematics: [
    "Limits & Continuity",
    "Differentiation",
    "Integration",
    "Matrices & Determinants",
    "Vectors & 3D",
    "Complex Numbers",
    "Probability",
    "Permutations & Combinations",
    "Sequences & Series",
  ],
  Programming: [
    "Basics & Syntax",
    "Control Flow",
    "Functions",
    "Arrays & Strings",
    "OOP Concepts",
    "Data Structures",
    "Recursion",
    "Files & Exceptions",
    "Basic Algorithms",
  ],
  Physics: [
    "Units & Measurements",
    "Kinematics",
    "Laws of Motion",
    "Work Energy Power",
    "Rotational Motion",
    "Thermodynamics",
    "Oscillations & Waves",
    "Electrostatics",
    "Current Electricity",
  ],
  "Communication Skills": [
    "Grammar Basics",
    "Vocabulary Building",
    "Listening Skills",
    "Presentation Skills",
    "Group Discussion",
    "Writing Emails",
  ],
  "Environmental Studies": [
    "Ecosystem Structure",
    "Pollution & Control",
    "Energy & Environment",
    "Sustainable Development",
    "Climate Change",
  ],
  "Data Structures": [
    "Arrays",
    "Linked Lists",
    "Stacks & Queues",
    "Trees",
    "Graphs",
    "Hashing",
    "Sorting",
    "Dynamic Programming",
  ],
  DBMS: [
    "Relational Model",
    "SQL Queries",
    "Normalization",
    "Transactions",
    "Indexing",
  ],
  "Operating Systems": [
    "Processes & Threads",
    "Scheduling",
    "Memory Management",
    "File Systems",
    "Deadlocks",
    "Virtual Memory",
  ],
};

export function curriculumFor(subject) {
  if (Array.isArray(subject.topics) && subject.topics.length)
    return subject.topics;
  return (
    DEFAULT_CURRICULUM[subject.name] || [
      "Core concepts",
      "Practice & revision",
      "Past paper review",
    ]
  );
}

/** How much of a topic still needs work, so we never re-plan mastered material. */
function topicStatus(subject, topic) {
  const learned = subject.topicProgress || {};
  return (
    learned[topic] || {
      learned: false,
      practice: 0,
      revision: 0,
      nextRevision: null,
    }
  );
}

/* ------------------------------------------------------------------ *
 * 3. PLAN GENERATION
 * ------------------------------------------------------------------ */

/**
 * Build a schedule from `fromDay` forward for `horizonDays`.
 * Existing future sessions are preserved; their subjects reduce the quota
 * so the AI never double-books time the student already committed to.
 */
export function generatePlan(
  user,
  { fromDay = todayKey(), horizonDays = 14, replace = false } = {},
) {
  const db = globalThis.__STUDY_DB__;
  const ctx = buildContext(user);
  const settings = user.settings || {};
  const today = ctx.today;
  const start = fromDay > today ? fromDay : today;
  const endKey = addDays(start, horizonDays - 1);
  const startIdx = daysBetween(today, start);

  // 1. Pull out sessions we are keeping.
  //    - History (any date before today) is NEVER destroyed.
  //    - In-progress / completed work is never destroyed.
  //    - `replace` discards only the *planned* future so the plan can be rebuilt
  //      from scratch (e.g. after the student changed their study window).
  const keep = [];
  const all = db.sessions.filter((s) => s.userId === user.id);
  for (const s of all) {
    const inWindow = s.date >= start && s.date <= endKey;
    const past = s.date < today;
    const locked = s.status === "completed" || s.status === "in_progress";
    if (locked || past)
      keep.push(s); // history & finished work always survives
    else if (!replace && inWindow) keep.push(s); // keep unless rebuilding
  }
  const keptFuture = keep.filter((s) => s.date >= start);
  const alreadyMinutes = {};
  for (const s of keptFuture) {
    if (s.status === "completed" || s.status === "in_progress") continue;
    alreadyMinutes[s.date] = (alreadyMinutes[s.date] || 0) + (s.duration || 45);
  }

  // 2. Rank subjects, then allocate the daily time budget across them.
  const ranked = scoreAllSubjects(user, ctx).filter((s) => s.priorityScore > 3);
  if (!ranked.length) {
    return {
      created: [],
      kept: keptFuture,
      note: "Add at least one subject to generate a plan.",
    };
  }

  const totalWeight = ranked.reduce((a, s) => a + s.priorityScore, 0);
  const dailyBudget = (settings.availableHours || 4) * 60;
  // Per-DAY share each subject should get (a fresh copy is used for every day).
  const dailyQuota = {};
  for (const s of ranked) {
    dailyQuota[s.id] = (s.priorityScore / totalWeight) * dailyBudget;
  }

  // 3. Fill each day.
  const created = [];
  for (let i = startIdx; i < horizonDays; i++) {
    const dayKey = addDays(start, i);
    const dow = dayOfWeek(dayKey);
    const isHoliday = (settings.holidays || []).includes(dow);

    let capacity = isHoliday
      ? Math.max(60, Math.round(dailyBudget * 0.4)) // light touch on free days
      : Math.round(dailyBudget * 1.15); // slight over-run builds buffer
    capacity -= alreadyMinutes[dayKey] || 0;
    if (capacity < 25) continue;

    // Fresh quotas each day, plus what this subject already got today.
    const quota = { ...dailyQuota };

    // Weekly rhythm: hardest subject early in the week, revision late.
    const daySessions = [];
    let cursor = 0;
    const pool = ranked.slice().sort((a, b) => {
      const ra = a.priorityScore - (dow <= 3 ? 0 : 6);
      const rb = b.priorityScore - (dow <= 3 ? 0 : 6);
      return rb - ra;
    });

    let guard = 0;
    while (capacity >= 25 && guard++ < 14) {
      const subject = pool[cursor % pool.length];
      cursor++;
      const remaining = Math.round(quota[subject.id] || 0);
      if (remaining < 25) {
        // rotate on; if all remaining quotas are tiny, bump the top subject
        const anyLeft = pool.some((s) => Math.round(quota[s.id] || 0) >= 25);
        if (!anyLeft) break;
        continue;
      }
      const planned = planSessionFor(
        user,
        subject,
        dayKey,
        remaining,
        capacity,
        ctx,
        daySessions
          .filter((x) => x.subjectId === subject.id)
          .map((x) => x.topic),
      );
      if (!planned) break;
      daySessions.push(planned);
      capacity -= planned.duration;
      quota[subject.id] = remaining - planned.duration;
    }

    if (daySessions.length) {
      const layout = layoutDay(daySessions, settings, isHoliday);
      created.push(...layout);
    }
  }

  const merged = [
    ...keep.filter((s) => s.date < start),
    ...keptFuture,
    ...created,
  ];
  const byId = new Map();
  for (const s of merged) byId.set(s.id, s);
  // Replace only THIS user's sessions; other users' rows are untouched.
  const others = db.sessions.filter((s) => s.userId !== user.id);
  db.sessions = [...others, ...byId.values()].sort((a, b) =>
    (a.date + (a.startTime || "")).localeCompare(b.date + (b.startTime || "")),
  );
  return { created, kept: keptFuture, ranked };
}

/** Decide the single most useful next action for this subject today. */
function planSessionFor(
  user,
  subject,
  dayKey,
  remaining,
  capacity,
  ctx,
  usedToday = [],
) {
  const today = ctx.today;
  const daysToExam = subject.examDate
    ? daysBetween(today, subject.examDate)
    : null;
  const isLateStage = daysToExam !== null && daysToExam <= 7;
  const isEarlyStage = daysToExam === null || daysToExam > 21;

  const topics = curriculumFor(subject);
  const progress = subject.topicProgress || {};
  const done = topics.filter((t) => progress[t]?.learned);
  const notLearned = topics.filter((t) => !progress[t]?.learned);
  // Never schedule the same topic twice for one subject on the same day.
  const fresh = (t) => !usedToday.includes(t);
  const freshNotLearned = notLearned.filter(fresh);
  const freshDone = done.filter(fresh);

  // 1) Scheduled revision wins (spaced repetition).
  const dueRevision = topics.find((t) => {
    const st = progress[t];
    return (
      st?.nextRevision &&
      st.nextRevision <= dayKey &&
      st.revision < 4 &&
      fresh(t)
    );
  });
  if (dueRevision && !isLateStage) {
    return session(user, subject, dayKey, Math.min(capacity, remaining, 30), {
      topic: dueRevision,
      type: "Revision",
      objective: `Spaced revision of ${dueRevision}`,
      priorityScore: subject.priorityScore,
    });
  }

  // 2) Learn something new while there is still runway.
  if (notLearned.length && isEarlyStage) {
    const topic = freshNotLearned[0] || notLearned[0];
    return session(user, subject, dayKey, Math.min(capacity, remaining, 60), {
      topic,
      type: "Learning",
      objective: `Understand ${topic} from scratch and take notes`,
      priorityScore: subject.priorityScore,
    });
  }

  // 3) Practice weak material.
  const weak = topics.find((t) => {
    const st = progress[t];
    return st?.learned && (st.practice || 0) < 2 && fresh(t);
  });
  if (weak) {
    return session(user, subject, dayKey, Math.min(capacity, remaining, 45), {
      topic: weak,
      type: "Practice",
      objective: `Solve problems on ${weak} until error-free`,
      priorityScore: subject.priorityScore,
    });
  }

  // 4) Late stage => mock tests and mixed revision.
  if (isLateStage && done.length) {
    const pool2 = freshDone.length ? freshDone : done;
    return session(user, subject, dayKey, Math.min(capacity, remaining, 60), {
      topic: pool2[Math.floor(Math.random() * pool2.length)],
      type: "Mock Test",
      objective: "Timed mock test under exam conditions",
      priorityScore: subject.priorityScore,
    });
  }

  // 5) Consolidate what is learned.
  if (done.length) {
    const pool2 = freshDone.length ? freshDone : done;
    const topic = pool2[0];
    return session(user, subject, dayKey, Math.min(capacity, remaining, 40), {
      topic,
      type: "Revision",
      objective: `Consolidate ${topic} and write 5 flashcard summaries`,
      priorityScore: subject.priorityScore,
    });
  }

  // 6) Everything is used up today — rotate to the next untouched topic.
  const nextTopic = freshNotLearned[0] || notLearned[0] || topics[0];
  const created = session(
    user,
    subject,
    dayKey,
    Math.min(capacity, remaining, 45),
    {
      topic: nextTopic,
      type: "Learning",
      objective: `Continue ${subject.name}: ${nextTopic}`,
      priorityScore: subject.priorityScore,
    },
  );
  created.userId = user.id;
  return created;
}
function session(user, subject, date, duration, extra) {
  const dur = clamp(Math.round(duration / 5) * 5, 25, 120);
  return {
    id: uid("s"),
    userId: user.id,
    subjectId: subject.id,
    subjectName: subject.name,
    topic: extra.topic,
    type: extra.type,
    objective: extra.objective,
    date,
    startTime: null, // assigned by layoutDay
    endTime: null,
    duration: dur,
    priority: extra.priorityScore,
    status: "planned",
    notes: "",
    rescheduled: false,
    createdAt: new Date().toISOString(),
  };
}

/** Place sessions into real clock times using the preferred window. */
function layoutDay(daySessions, settings, isHoliday) {
  const [winStart, winEnd] = windowFor(
    settings.preferredTime,
    settings.availableHours || 4,
  );
  // Free days start later & run shorter.
  const start = isHoliday ? winStart + 2 * 60 : winStart;
  const end = isHoliday ? Math.min(winEnd, start + 6 * 60) : winEnd;

  const out = [];
  let cursor = start;
  for (const s of daySessions) {
    // Never schedule outside the student's chosen window. If the day's plan
    // overflows, wrap back to the start of the window rather than inventing a
    // 20:00 slot the student never agreed to.
    if (cursor + s.duration > end) {
      if (start + s.duration <= end) {
        cursor = start;
      } else {
        break; // cannot fit inside the window at all
      }
    }
    const gap = 15;
    s.startTime = minutesToHHMM(cursor);
    s.endTime = minutesToHHMM(cursor + s.duration);
    cursor += s.duration + gap;
    out.push(s);
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * 4. SMART RE-SCHEDULING
 * ------------------------------------------------------------------ */

/**
 * When a session is missed we do not just flag it. We take the overdue minutes
 * and redistribute them across the coming days, protecting higher-priority work.
 * Returns a human-readable explanation of what the AI decided and why.
 */
export function rescheduleMissed(user, sessionId, reason = "missed") {
  const db = globalThis.__STUDY_DB__;
  const target = db.sessions.find(
    (s) => s.id === sessionId && s.userId === user.id,
  );
  if (!target) return { ok: false, message: "Session not found." };

  const today = todayKey();
  const ctx = buildContext(user);
  const settings = user.settings || {};
  target.status = reason === "skipped" ? "skipped" : "missed";
  target.missedAt = new Date().toISOString();
  target.missedReason = reason;

  if (target.status === "skipped") {
    return {
      ok: true,
      message: `Skipped ${target.subjectName}. ${target.duration} minutes freed up for other work.`,
      redistributed: [],
    };
  }

  const minutes = target.duration || 45;
  const horizon = 5;
  const ranked = scoreAllSubjects(user, ctx);
  const competing = db.sessions.filter(
    (s) =>
      s.userId === user.id &&
      s.id !== target.id &&
      s.date >= today &&
      s.date <= addDays(today, horizon) &&
      s.status === "planned",
  );

  // Group competing sessions by day to see remaining capacity.
  const used = {};
  for (const s of competing) used[s.date] = (used[s.date] || 0) + s.duration;
  const dailyBudget = (settings.availableHours || 4) * 60;

  const recipients = [];
  let remainingMinutes = minutes;
  for (let i = 0; i < horizon && remainingMinutes > 0; i++) {
    const dayKey = addDays(today, i);
    if ((settings.holidays || []).includes(dayOfWeek(dayKey))) continue;
    const spare = Math.round(dailyBudget * 1.15) - (used[dayKey] || 0);
    if (spare < 25) continue;

    // Push the work into the subject that most needs it, on the day with most room.
    const target2 =
      ranked.find(
        (s) =>
          !recipients.some((r) => r.subjectId === s.id) && s.priorityScore > 15,
      ) || ranked[0];
    if (!target2) break;

    const dur = Math.min(spare, remainingMinutes, 90);
    remainingMinutes -= dur;
    used[dayKey] = (used[dayKey] || 0) + dur;

    const topics = curriculumFor(target2);
    const status = target2.topicProgress || {};
    const due = topics.find(
      (t) => status[t]?.nextRevision && status[t].nextRevision <= dayKey,
    );
    const type = due ? "Revision" : "Learning";
    const topic = due || topics.find((t) => !status[t]?.learned) || topics[0];

    const created = {
      ...target,
      id: uid("s"),
      userId: user.id,
      date: dayKey,
      topic,
      type,
      objective: due
        ? `Recovered revision: ${due} (redistributed from a missed ${target.subjectName} session)`
        : `Recovered study time for ${topic}`,
      duration: dur,
      startTime: null,
      endTime: null,
      status: "planned",
      notes: `Auto-rescheduled after missing ${target.subjectName} on ${target.date}.`,
      rescheduled: true,
      createdAt: new Date().toISOString(),
    };
    applyLayout(created, user, dayKey, used[dayKey] - dur);
    recipients.push(created);
    db.sessions.push(created);
  }

  const protected_ = competing.filter(
    (s) => s.priority > (target.priority || 0) + 10,
  );
  const protectedNames = [...new Set(protected_.map((s) => s.subjectName))];

  const parts = [];
  parts.push(`You missed your ${target.subjectName} session`);
  if (recipients.length) {
    const overDays = [...new Set(recipients.map((r) => r.date))].length;
    const spread =
      [...new Set(recipients.map((r) => r.date))].length === 1
        ? `today`
        : `across the next ${overDays} days`;
    parts.push(`I've redistributed the remaining ${minutes} minutes ${spread}`);
  } else {
    parts.push(
      `I've kept it visible because your coming days are already full — free up time or drop a lower-priority session to fit it in`,
    );
  }
  if (protectedNames.length) {
    parts.push(
      `without affecting your ${protectedNames.slice(0, 2).join(" or ")} ${protectedNames.length > 1 ? "sessions" : "session"}`,
    );
  }

  return {
    ok: true,
    message: `${parts.join(". ")}.`,
    redistributed: recipients,
  };
}

/** Give a session a clock time that doesn't collide with others on that day. */
function applyLayout(target, user, dayKey, usedSoFar) {
  const settings = user.settings || {};
  const [winStart, winEnd] = windowFor(
    settings.preferredTime,
    settings.availableHours || 4,
  );
  let cursor = winStart + Math.round(usedSoFar / 15) * 15;
  const end = winEnd;
  // Stay inside the student's window; wrap to its start rather than spilling
  // into an arbitrary evening slot.
  if (cursor + target.duration > end) cursor = winStart;
  target.startTime = minutesToHHMM(cursor);
  target.endTime = minutesToHHMM(cursor + target.duration);
}

/* ------------------------------------------------------------------ *
 * 5. SPACED REPETITION
 * ------------------------------------------------------------------ */

const SRS_INTERVALS = [1, 2, 4, 7, 14, 30]; // Day1 learn, D2 revision, D4 practice, D7, D14, D30

export function scheduleRevisions(user, subject, topic) {
  const dates = SRS_INTERVALS.map((n, i) => addDays(todayKey(), n));
  subject.topicProgress = subject.topicProgress || {};
  subject.topicProgress[topic] = {
    learned: true,
    practice: 0,
    revision: 0,
    lastStudied: todayKey(),
    nextRevision: dates[0],
    schedule: dates.map((d, i) => ({
      day: d,
      label:
        i === 0
          ? "Quick revision"
          : i === 1
            ? "Practice"
            : i === 2
              ? "Revision"
              : i === 3
                ? "Final revision"
                : "Long-term recall",
    })),
  };
  return subject.topicProgress[topic];
}

export function markTopicStudied(
  user,
  subjectId,
  topic,
  { practiced = true } = {},
) {
  const subject = (user.subjects || []).find((s) => s.id === subjectId);
  if (!subject) return null;
  const st = scheduleRevisions(user, subject, topic);
  if (practiced) st.practice = (st.practice || 0) + 1;
  return st;
}

export function advanceRevision(user, subjectId, topic) {
  const subject = (user.subjects || []).find((s) => s.id === subjectId);
  const st = subject?.topicProgress?.[topic];
  if (!st) return null;
  st.revision = (st.revision || 0) + 1;
  const idx = clamp(st.revision, 0, SRS_INTERVALS.length - 1);
  st.nextRevision = addDays(todayKey(), SRS_INTERVALS[idx]);
  st.lastStudied = todayKey();
  return st;
}

export function pendingRevisions(user) {
  const today = todayKey();
  const out = [];
  for (const s of user.subjects || []) {
    for (const [topic, st] of Object.entries(s.topicProgress || {})) {
      if (st.nextRevision && st.nextRevision <= addDays(today, 3)) {
        out.push({
          subjectId: s.id,
          subjectName: s.name,
          topic,
          dueOn: st.nextRevision,
          overdue: st.nextRevision < today,
          round: st.revision || 0,
        });
      }
    }
  }
  return out.sort((a, b) => a.dueOn.localeCompare(b.dueOn));
}

/* ------------------------------------------------------------------ *
 * 6. INSIGHTS  (data-driven, never generic motivation)
 * ------------------------------------------------------------------ */

export function generateInsights(user) {
  const db = globalThis.__STUDY_DB__;
  const today = todayKey();
  const ctx = buildContext(user);
  const sessions = ctx.sessions;
  const last14 = sessions.filter((s) => s.date >= addDays(today, -13));
  const insights = [];

  // -- concentration imbalance
  const minutesBySubject = {};
  for (const s of last14) {
    if (s.status !== "completed") continue;
    minutesBySubject[s.subjectName] =
      (minutesBySubject[s.subjectName] || 0) + s.duration;
  }
  const totalMin = Object.values(minutesBySubject).reduce((a, b) => a + b, 0);
  const ranked = scoreAllSubjects(user, ctx);

  if (totalMin > 60 && ranked.length > 1) {
    const top = Object.entries(minutesBySubject).sort((a, b) => b[1] - a[1])[0];
    const share = Math.round((top[1] / totalMin) * 100);
    const neglected = ranked
      .filter((s) => !(top[0] === s.name))
      .sort((a, b) => b.priorityScore - a.priorityScore)
      .find((s) => (minutesBySubject[s.name] || 0) < totalMin * 0.15);
    if (share >= 45 && neglected) {
      insights.push({
        type: "imbalance",
        severity: "warn",
        title: "Study time is unbalanced",
        message: `You are spending ${share}% of your study time on ${top[0]} while ${neglected.name} preparation is falling behind. Shift roughly ${Math.max(30, Math.round((share - 30) * 3))} minutes a day from ${top[0]} to ${neglected.name}.`,
        subjectId: neglected.id,
      });
    }
  }

  // -- exam countdown pressure
  for (const s of ranked) {
    if (s.daysToExam === null) continue;
    if (s.daysToExam < 0) continue;
    const deficit = 100 - (s.preparation || 0);
    if (s.daysToExam <= 10 && deficit >= 25) {
      const dailyNeeded =
        Math.ceil(deficit / Math.max(1, s.daysToExam) / 10) * 10;
      insights.push({
        type: "exam",
        severity: s.daysToExam <= 3 ? "critical" : "warn",
        title: `${s.name} exam in ${s.daysToExam} day${s.daysToExam === 1 ? "" : "s"}`,
        message: `${s.name} is at ${s.preparation || 0}% with ${deficit}% still to cover. Add about ${dailyNeeded} minutes of ${s.name} ${s.daysToExam <= 3 ? "revision and mock tests" : "practice"} to finish on time.`,
        subjectId: s.id,
      });
    }
  }

  // -- missed sessions
  const missed = last14.filter((s) => s.status === "missed");
  if (missed.length >= 2) {
    const bySubject = {};
    for (const m of missed)
      bySubject[m.subjectName] = (bySubject[m.subjectName] || 0) + m.duration;
    const worst = Object.entries(bySubject).sort((a, b) => b[1] - a[1])[0];
    insights.push({
      type: "missed",
      severity: "warn",
      title: `${missed.length} missed sessions in the last 14 days`,
      message: `You lost ${Math.round((Object.values(bySubject).reduce((a, b) => a + b, 0) / 60) * 10) / 10} hours, mostly in ${worst[0]} (${Math.round((worst[1] / 60) * 10) / 10}h). Re-run reschedule to recover that time before exams.`,
    });
  }

  // -- overload warning
  const todaySessions = sessions.filter((s) => s.date === today);
  const todayMinutes = todaySessions.reduce((a, s) => a + s.duration, 0);
  const goal = (user.settings?.dailyStudyGoalHours || 4) * 60;
  if (todayMinutes > goal * 1.25 && todayMinutes > 0) {
    insights.push({
      type: "overload",
      severity: "info",
      title: "Today's plan is unrealistic",
      message: `You have ${(todayMinutes / 60).toFixed(1)}h scheduled against a ${(goal / 60).toFixed(1)}h goal. Cutting the two lowest-priority sessions will make this achievable.`,
    });
  } else if (todayMinutes > 0 && todayMinutes < goal * 0.6) {
    insights.push({
      type: "underload",
      severity: "info",
      title: "Room to add study time today",
      message: `Only ${(todayMinutes / 60).toFixed(1)}h of your ${(goal / 60).toFixed(1)}h daily goal is planned. Add a ${pendingRevisions(user)[0]?.topic || "revision"} block if you have the time.`,
    });
  }

  // -- deadline pressure
  const soon = (user.tasks || []).filter(
    (t) =>
      t.status !== "completed" &&
      t.dueDate &&
      daysBetween(today, t.dueDate) <= 3 &&
      daysBetween(today, t.dueDate) >= 0,
  );
  for (const t of soon.slice(0, 2)) {
    insights.push({
      type: "deadline",
      severity: t.priority === "high" ? "critical" : "warn",
      title: `${t.title} due in ${daysBetween(today, t.dueDate)} day${daysBetween(today, t.dueDate) === 1 ? "" : "s"}`,
      message: `${t.title} (${t.type}) is ${t.progress || 0}% done. It needs roughly ${Math.max(30, (100 - (t.progress || 0)) * 2)} more focused minutes before the deadline.`,
    });
  }

  // -- productive period detection
  const byHour = {};
  for (const s of last14) {
    if (s.status !== "completed" || !s.startTime) continue;
    const h = Number(s.startTime.slice(0, 2));
    byHour[h] = byHour[h] || { minutes: 0, count: 0 };
    byHour[h].minutes += s.duration;
    byHour[h].count += 1;
  }
  const hours = Object.entries(byHour);
  if (hours.length >= 2) {
    const best = hours.sort(
      (a, b) => b[1].minutes / b[1].count - a[1].minutes / a[1].count,
    )[0];
    const label =
      best[0] < 12
        ? "morning"
        : best[0] < 17
          ? "afternoon"
          : best[0] < 21
            ? "evening"
            : "night";
    if (byHour[best[0]].count >= 2) {
      insights.push({
        type: "habit",
        severity: "info",
        title: `You study best in the ${label}`,
        message: `Your completed sessions in the ${label} average ${Math.round(best[1].minutes / best[1].count)} minutes of focus vs ${hours
          .filter((h) => h[0] !== best[0])
          .map((h) => Math.round(h[1].minutes / h[1].count))
          .join(
            "/",
          )} minutes elsewhere. Consider shifting your preferred time.`,
      });
    }
  }

  // -- prep projection
  const withExams = ranked.filter(
    (s) => s.daysToExam !== null && s.daysToExam >= 0,
  );
  for (const s of withExams) {
    const daily = Object.values(minutesBySubject).length
      ? (minutesBySubject[s.name] || 0) / 14
      : 0;
    if (s.preparation < 100 && s.daysToExam > 0) {
      const projected = clamp(
        s.preparation + (daily / 60) * 12 * (s.daysToExam / 7),
        0,
        100,
      );
      if (projected < 75) {
        insights.push({
          type: "projection",
          severity: "info",
          title: `${s.name} may not be exam-ready`,
          message: `At your current pace (~${Math.round(daily)} min/day) you'll reach only ~${Math.round(projected)}% before the ${s.daysToExam}-day mark. Increasing to ~${Math.round(daily * 1.5)} min/day closes the gap.`,
          subjectId: s.id,
        });
      }
    }
  }

  if (!insights.length) {
    insights.push({
      type: "clear",
      severity: "ok",
      title: "Plan looks healthy",
      message:
        "Subject coverage, deadlines and study time are all balanced for your target. Keep the streak alive today.",
    });
  }
  return insights;
}

/* ------------------------------------------------------------------ *
 * 7. ANALYTICS
 * ------------------------------------------------------------------ */

export function analytics(user, { days = 30 } = {}) {
  const db = globalThis.__STUDY_DB__;
  const today = todayKey();
  const from = addDays(today, -(days - 1));
  const sessions = db.sessions.filter((s) => s.userId === user.id);
  const period = sessions.filter((s) => s.date >= from && s.date <= today);

  const daily = [];
  for (let i = 0; i < days; i++) {
    const key = addDays(from, i);
    const list = period.filter((s) => s.date === key);
    daily.push({
      date: key,
      minutes: list
        .filter((s) => s.status === "completed")
        .reduce((a, s) => a + s.duration, 0),
      planned: list.reduce((a, s) => a + s.duration, 0),
      completed: list.filter((s) => s.status === "completed").length,
      missed: list.filter((s) => s.status === "missed").length,
    });
  }

  const bySubject = (user.subjects || [])
    .map((s) => {
      const list = period.filter((x) => x.subjectId === s.id);
      const done = list.filter((x) => x.status === "completed");
      const total = list.length || 1;
      return {
        id: s.id,
        name: s.name,
        color: s.color,
        minutes: done.reduce((a, x) => a + x.duration, 0),
        completed: done.length,
        missed: list.filter((x) => x.status === "missed").length,
        completionRate: Math.round((done.length / total) * 100),
        preparation: s.preparation || 0,
        examDate: s.examDate || null,
      };
    })
    .sort((a, b) => b.minutes - a.minutes);

  // weekly buckets
  const weekly = [];
  for (let w = 0; w < Math.ceil(days / 7); w++) {
    const wEnd = addDays(from, w * 7 + 6);
    const slice = period.filter(
      (s) =>
        s.date >= addDays(from, w * 7) &&
        s.date <= wEnd &&
        s.status === "completed",
    );
    weekly.push({
      label: addDays(from, w * 7),
      minutes: slice.reduce((a, s) => a + s.duration, 0),
    });
  }

  const completed = period.filter((s) => s.status === "completed");
  const missed = period.filter((s) => s.status === "missed");
  const focusMinutes = completed.reduce((a, s) => a + s.duration, 0);

  const byHour = {};
  for (const s of completed) {
    if (!s.startTime) continue;
    const h = Number(s.startTime.slice(0, 2));
    byHour[h] = (byHour[h] || 0) + s.duration;
  }
  const productive = Object.entries(byHour).sort((a, b) => b[1] - a[1])[0];

  return {
    range: { from, to: today, days },
    daily,
    weekly,
    bySubject,
    totals: {
      focusMinutes,
      focusHours: Number((focusMinutes / 60).toFixed(1)),
      completed: completed.length,
      missed: missed.length,
      planned: period.length,
      completionRate: period.length
        ? Math.round((completed.length / period.length) * 100)
        : 0,
      avgPerDay: Number(
        (daily.reduce((a, d) => a + d.minutes, 0) / days / 60).toFixed(2),
      ),
    },
    streak: computeStreak(sessions, today),
    productivePeriod: productive
      ? { hour: Number(productive[0]), minutes: productive[1] }
      : null,
    examPrep: (user.subjects || [])
      .filter((s) => s.examDate)
      .map((s) => ({
        id: s.id,
        name: s.name,
        examDate: s.examDate,
        daysToExam: daysBetween(today, s.examDate),
        preparation: s.preparation || 0,
        color: s.color,
      })),
  };
}

export function computeStreak(sessions, today = todayKey()) {
  let streak = 0;
  let cursor = today;
  for (let i = 0; i < 400; i++) {
    const mins = sessions
      .filter((s) => s.date === cursor && s.status === "completed")
      .reduce((a, s) => a + s.duration, 0);
    if (mins > 0) {
      streak++;
      cursor = addDays(cursor, -1);
    } else if (i === 0) {
      cursor = addDays(cursor, -1);
    } // today not done yet doesn't break it
    else break;
  }
  return streak;
}

/* ------------------------------------------------------------------ *
 * 8. GAMIFICATION (kept light and useful)
 * ------------------------------------------------------------------ */

export const BADGES = {
  first_session: {
    name: "First Step",
    desc: "Complete your first study session",
    icon: "🌱",
    category: "milestone",
  },
  streak_3: { name: "Warming Up", desc: "3-day study streak", icon: "🔥", category: "streak" },
  streak_7: { name: "Week Warrior", desc: "7-day study streak", icon: "⚡", category: "streak" },
  streak_30: { name: "Unstoppable", desc: "30-day study streak", icon: "🏆", category: "streak" },
  focus_5h: {
    name: "Deep Diver",
    desc: "5 hours of focused study",
    icon: "🎯",
    category: "hours",
  },
  early_bird: { name: "Early Bird", desc: "Study before 8am", icon: "🌅", category: "habit" },
  night_owl: { name: "Night Owl", desc: "Study after 9pm", icon: "🦉", category: "habit" },
  planner_10: {
    name: "Planner",
    desc: "Generate 10 AI study plans",
    icon: "🧠",
    category: "milestone",
  },
  subject_master: {
    name: "Subject Master",
    desc: "Bring a subject to 100%",
    icon: "💎",
    category: "milestone",
  },
  perfect_week: {
    name: "Perfect Week",
    desc: "Complete every session for 7 days",
    icon: "✅",
    category: "streak",
  },

  /* ── Hour milestone badges (1 h → 100 h) ─────────────────────────── */
  hours_1: {
    name: "Spark",
    desc: "1 hour of total study time",
    icon: "✨",
    category: "hours",
    hours: 1,
  },
  hours_2: {
    name: "Kindled",
    desc: "2 hours of total study time",
    icon: "🕯️",
    category: "hours",
    hours: 2,
  },
  hours_5: {
    name: "Getting Serious",
    desc: "5 hours of total study time",
    icon: "📖",
    category: "hours",
    hours: 5,
  },
  hours_10: {
    name: "Scholar",
    desc: "10 hours of total study time",
    icon: "🎓",
    category: "hours",
    hours: 10,
  },
  hours_15: {
    name: "Dedicated",
    desc: "15 hours of total study time",
    icon: "📚",
    category: "hours",
    hours: 15,
  },
  hours_20: {
    name: "Grinder",
    desc: "20 hours of total study time",
    icon: "⚙️",
    category: "hours",
    hours: 20,
  },
  hours_25: {
    name: "Quarter Century",
    desc: "25 hours of total study time",
    icon: "🥇",
    category: "hours",
    hours: 25,
  },
  hours_30: {
    name: "Relentless",
    desc: "30 hours of total study time",
    icon: "💪",
    category: "hours",
    hours: 30,
  },
  hours_40: {
    name: "Iron Will",
    desc: "40 hours of total study time",
    icon: "🔩",
    category: "hours",
    hours: 40,
  },
  hours_50: {
    name: "Half Century",
    desc: "50 hours of total study time",
    icon: "🌟",
    category: "hours",
    hours: 50,
  },
  hours_60: {
    name: "Knowledge Seeker",
    desc: "60 hours of total study time",
    icon: "🔭",
    category: "hours",
    hours: 60,
  },
  hours_75: {
    name: "Elite",
    desc: "75 hours of total study time",
    icon: "👑",
    category: "hours",
    hours: 75,
  },
  hours_80: {
    name: "Legend in Progress",
    desc: "80 hours of total study time",
    icon: "🦅",
    category: "hours",
    hours: 80,
  },
  hours_90: {
    name: "Transcendent",
    desc: "90 hours of total study time",
    icon: "🌠",
    category: "hours",
    hours: 90,
  },
  hours_100: {
    name: "Century Scholar",
    desc: "100 hours of total study time — legendary!",
    icon: "🏅",
    category: "hours",
    hours: 100,
  },
};

export function awardXP(user, { amount, reason }) {
  user.gamification = user.gamification || { xp: 0, level: 1, badges: [] };
  user.gamification.xp += amount;
  const newLevel = Math.floor(Math.sqrt(user.gamification.xp / 100)) + 1;
  const leveled = newLevel > user.gamification.level;
  user.gamification.level = newLevel;
  return {
    xp: user.gamification.xp,
    level: newLevel,
    leveledUp: leveled,
    reason,
  };
}

export function checkBadges(user, ctx = buildContext(user)) {
  const db = globalThis.__STUDY_DB__;
  const g =
    user.gamification || (user.gamification = { xp: 0, level: 1, badges: [] });
  g.badges = g.badges || [];
  const earned = [];
  const add = (key) => {
    if (!g.badges.includes(key)) {
      g.badges.push(key);
      earned.push(BADGES[key]);
    }
  };
  const today = todayKey();
  const sessions = ctx.sessions;
  const completed = sessions.filter((s) => s.status === "completed");
  if (completed.length >= 1) add("first_session");
  const streak = computeStreak(sessions, today);
  if (streak >= 3) add("streak_3");
  if (streak >= 7) add("streak_7");
  if (streak >= 30) add("streak_30");

  const totalMinutes = completed.reduce((a, s) => a + s.duration, 0);
  const totalHours = totalMinutes / 60;

  if (totalMinutes >= 300) add("focus_5h");  // legacy 5h badge

  // Hour milestone badges
  const hourMilestones = [1, 2, 5, 10, 15, 20, 25, 30, 40, 50, 60, 75, 80, 90, 100];
  for (const h of hourMilestones) {
    if (totalHours >= h) add(`hours_${h}`);
  }

  if (completed.some((s) => s.startTime && Number(s.startTime.slice(0, 2)) < 8))
    add("early_bird");
  if (
    completed.some((s) => s.startTime && Number(s.startTime.slice(0, 2)) >= 21)
  )
    add("night_owl");
  if ((user.subjects || []).some((s) => (s.preparation || 0) >= 100))
    add("subject_master");
  return earned;
}
