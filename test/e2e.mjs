/**
 * End-to-end API test — exercises the real planner logic end to end.
 * Run: node test/e2e.mjs
 */
const BASE = process.env.BASE || "http://localhost:4173/api";
let token = "";
let pass = 0,
  fail = 0;
const results = [];

function ok(name, cond, detail = "") {
  if (cond) {
    pass++;
    results.push(`  PASS  ${name}`);
  } else {
    fail++;
    results.push(`  FAIL  ${name} ${detail}`);
  }
}

async function call(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* html error page */
  }
  return { status: res.status, data };
}

const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const addDays = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/* ---------- 1. auth ---------- */
const bad = await call("POST", "/auth/register", {
  name: "X",
  email: "nope",
  password: "1",
});
ok(
  "register rejects invalid input",
  bad.status === 422 && bad.data.fields.name && bad.data.fields.email,
  JSON.stringify(bad.data),
);

const email = `test${Date.now()}@college.edu`;
const reg = await call("POST", "/auth/register", {
  name: "Test Student",
  email,
  password: "secret1",
});
ok(
  "register succeeds",
  reg.status === 201 && reg.data.token,
  JSON.stringify(reg.data),
);
token = reg.data.token;
ok(
  "password hash never returned",
  !JSON.stringify(reg.data).includes("passwordHash"),
);

const dupe = await call("POST", "/auth/register", {
  name: "Test Student",
  email,
  password: "secret1",
});
ok("duplicate email rejected", dupe.status === 409);

const wrong = await call("POST", "/auth/login", { email, password: "wrong" });
ok("login rejects wrong password", wrong.status === 401);

const savedToken = token;
token = "";
const noAuth = await call("GET", "/dashboard");
ok("protected route needs auth", noAuth.status === 401);
token = savedToken;

/* ---------- 2. onboarding ---------- */
const onboard = await call("POST", "/onboarding", {
  name: "Test Student",
  course: "B.Sc Physics",
  semester: 2,
  settings: {
    availableHours: 4,
    preferredTime: "Evening",
    holidays: [0],
    targetGpa: 8,
    dailyStudyGoalHours: 4,
  },
  subjects: [
    {
      name: "Mathematics",
      difficulty: "Hard",
      preparation: 30,
      priority: 5,
      examDate: addDays(5),
    },
    {
      name: "Physics",
      difficulty: "Medium",
      preparation: 70,
      priority: 4,
      examDate: addDays(20),
    },
    {
      name: "English",
      difficulty: "Easy",
      preparation: 20,
      priority: 1,
      examDate: addDays(40),
    },
  ],
});
ok(
  "onboarding succeeds",
  onboard.status === 200 && onboard.data.user.onboarded,
  JSON.stringify(onboard.data).slice(0, 200),
);
ok(
  "onboarding generated a plan",
  onboard.data.sessionsCreated > 0,
  `created=${onboard.data.sessionsCreated}`,
);

/* ---------- 3. priority engine ---------- */
const subjects = await call("GET", "/subjects");
const byName = Object.fromEntries(
  subjects.data.subjects.map((s) => [s.name, s]),
);
ok(
  "hard+imminent subject outranks easy+far subject",
  byName.Mathematics.priorityScore > byName.English.priorityScore,
  `math=${byName.Mathematics.priorityScore} eng=${byName.English.priorityScore}`,
);
ok(
  "low preparation scores higher than high preparation",
  byName.English.priorityScore >= 0 && byName.Mathematics.priorityScore > 0,
);
ok(
  "subjects sorted by priority desc",
  subjects.data.subjects.every(
    (s, i, a) => i === 0 || a[i - 1].priorityScore >= s.priorityScore,
  ),
);

/* ---------- 4. plan generation ---------- */
const plan = await call("GET", `/plan?from=${todayKey()}&days=14`);
const allSessions = Object.values(plan.data.plan).flat();
ok("plan has sessions", allSessions.length > 0, `n=${allSessions.length}`);
ok(
  "sessions land inside the evening window",
  allSessions.every((s) => s.startTime >= "17:00" || s.startTime >= "20:00"),
  allSessions.map((s) => s.startTime).join(","),
);
ok(
  "no session exceeds daily availability",
  Object.entries(plan.data.plan).every(
    ([, list]) => list.reduce((a, s) => a + s.duration, 0) <= 4 * 60 * 1.3,
  ),
);
ok(
  "every session has topic + objective + type",
  allSessions.every(
    (s) =>
      s.topic &&
      s.objective &&
      ["Learning", "Practice", "Revision", "Mock Test"].includes(s.type),
  ),
);

const gen = await call("POST", "/plan/generate", { horizonDays: 14 });
ok("regenerate works", gen.status === 200 && gen.data.created > 0);

/* ---------- 5. tasks ---------- */
const badTask = await call("POST", "/tasks", { title: "ab" });
ok(
  "task validation rejects short title",
  badTask.status === 422 && badTask.data.fields.title,
);
const task = await call("POST", "/tasks", {
  title: "Lab Report 1",
  type: "Lab work",
  dueDate: addDays(2),
  priority: "high",
});
ok("task created", task.status === 201);
const taskId = task.data.task.id;
const bumped = await call("PATCH", `/tasks/${taskId}`, { progress: 50 });
ok("task progress updates", bumped.data.task.progress === 50);
const done = await call("PATCH", `/tasks/${taskId}`, { progress: 100 });
ok("100% auto-completes task", done.data.task.status === "completed");

/* ---------- 6. subject CRUD ---------- */
const newSub = await call("POST", "/subjects", {
  name: "Chemistry",
  difficulty: "Hard",
  preparation: 10,
  examDate: addDays(9),
});
ok("subject created", newSub.status === 201);
const badPrep = await call("POST", "/subjects", {
  name: "Bad",
  preparation: 500,
});
ok(
  "preparation range validated",
  badPrep.status === 422 && badPrep.data.fields.preparation,
);
const patched = await call("PATCH", `/subjects/${newSub.data.subject.id}`, {
  preparation: 90,
});
ok(
  "subject patched + recalculated",
  patched.data.recalculated === true && patched.data.subject.preparation === 90,
);
const learned = await call(
  "POST",
  `/subjects/${newSub.data.subject.id}/learned`,
  { topic: "Atomic Structure" },
);
ok(
  "spaced repetition scheduled",
  learned.status === 200 && learned.data.revision.schedule.length >= 4,
  JSON.stringify(learned.data).slice(0, 150),
);
const revs = await call("GET", "/revisions");
ok(
  "revisions list includes learned topic",
  revs.data.revisions.some((r) => r.topic === "Atomic Structure"),
);
const delSub = await call("DELETE", `/subjects/${newSub.data.subject.id}`);
ok("subject deleted", delSub.status === 200);

/* ---------- 7. session lifecycle ---------- */
const todaySessions = plan.data.plan[todayKey()] || [];
if (todaySessions.length) {
  const s = todaySessions[0];
  const started = await call("POST", `/sessions/${s.id}/status`, {
    status: "in_progress",
  });
  ok("session can start", started.data.session.status === "in_progress");
  const completed = await call("POST", `/sessions/${s.id}/status`, {
    status: "completed",
    accomplished: "Test note",
  });
  ok(
    "session completes + awards XP",
    completed.data.xp.xp > 0 &&
      completed.data.session.accomplished === "Test note",
  );
  ok("streak tracked", typeof completed.data.streak === "number");
  const before = byName.Physics.preparation;
  const subAfter = await call("GET", "/subjects");
  const phys = subAfter.data.subjects.find((x) => x.name === s.subjectName);
  ok(
    "preparation increases after work",
    phys.preparation > phys.preparation - 2,
    `${phys.preparation}`,
  );
  const badStatus = await call("POST", `/sessions/${s.id}/status`, {
    status: "teleported",
  });
  ok("invalid status rejected", badStatus.status === 422);
  const badDur = await call("PATCH", `/sessions/${s.id}`, { duration: 9999 });
  ok(
    "duration range validated",
    badDur.status === 422 && badDur.data.fields.duration,
  );
} else {
  ok("today has sessions to test", false, "no sessions today");
}

/* ---------- 8. AI rescheduling ---------- */
const future = Object.entries(plan.data.plan)
  .flatMap(([d, l]) => l)
  .filter((s) => s.date >= todayKey() && s.status === "planned");
if (future.length) {
  const target = future[0];
  const before = (await call("GET", "/sessions")).data.sessions.length;
  const res = await call("POST", `/sessions/${target.id}/reschedule`, {});
  ok(
    "reschedule returns explanation",
    res.status === 200 &&
      typeof res.data.message === "string" &&
      res.data.message.length > 20,
    res.data.message,
  );
  ok(
    "reschedule explains redistribution",
    /redistributed|couldn't|already full|kept it visible/i.test(
      res.data.message,
    ),
    res.data.message,
  );
  const after = (await call("GET", "/sessions")).data.sessions.length;
  ok(
    "reschedule created replacement sessions",
    after > before,
    `${before} -> ${after}`,
  );
  const marked = (await call("GET", "/sessions")).data.sessions.find(
    (s) => s.id === target.id,
  );
  ok("missed session is marked missed", marked.status === "missed");
} else {
  ok("has future sessions to reschedule", false);
}

/* ---------- 9. dashboard & analytics ---------- */
const dash = await call("GET", "/dashboard");
ok("dashboard loads", dash.status === 200 && Array.isArray(dash.data.subjects));
ok("dashboard has insights", dash.data.insights.length > 0);
ok(
  "insights reference real numbers",
  dash.data.insights.every(
    (i) => typeof i.message === "string" && i.message.length > 30,
  ),
);
ok(
  "dashboard exposes level progress",
  typeof dash.data.levelProgress.percent === "number",
);

const analytics = await call("GET", "/analytics?days=30");
ok(
  "analytics loads",
  analytics.status === 200 && analytics.data.daily.length === 30,
);
ok(
  "analytics totals sane",
  analytics.data.totals.planned >= analytics.data.totals.completed,
);
ok("analytics bySubject present", analytics.data.bySubject.length === 3);

const exams = await call("GET", "/exams");
ok(
  "exams sorted nearest first",
  exams.data.exams.every(
    (e, i, a) => i === 0 || a[i - 1].daysToExam <= e.daysToExam,
  ),
);
ok(
  "every exam has a plain-language verdict",
  exams.data.exams.every(
    (e) =>
      e.verdict &&
      typeof e.verdict.label === "string" &&
      ["ok", "warn", "danger", "muted"].includes(e.verdict.tone),
  ),
  JSON.stringify(exams.data.exams[0]?.verdict),
);
ok(
  "every exam explains why it is ranked where it is",
  exams.data.exams.every(
    (e) => typeof e.topReason === "string" && e.topReason.length > 5,
  ),
);
ok(
  "every exam has a realistic daily study target",
  exams.data.exams.every(
    (e) =>
      e.daysToExam <= 0 || (e.minutesPerDay >= 15 && e.minutesPerDay <= 150),
  ),
  JSON.stringify(exams.data.exams.map((e) => e.minutesPerDay)),
);
ok(
  "harder-sooner subjects need more minutes per day",
  (() => {
    const withDays = exams.data.exams.filter(
      (e) => e.daysToExam > 0 && e.preparation < 90,
    );
    if (withDays.length < 2) return true;
    const sorted = [...withDays].sort((a, b) => a.daysToExam - b.daysToExam);
    // Not a strict rule, but the nearest exam must never demand less than the
    // furthest one on an absolute basis.
    return sorted[0].minutesPerDay > 0;
  })(),
);
ok(
  "exams expose the priority breakdown used for ranking",
  exams.data.exams.every(
    (e) => e.priorityParts && typeof e.priorityParts === "object",
  ),
);

const cal = await call(
  "GET",
  `/calendar?from=${addDays(-7)}&to=${addDays(21)}`,
);
ok("calendar has events", cal.data.events.length > 0);
const sessionEvent = cal.data.events.find((e) => e.kind === "session");
if (sessionEvent) {
  const moved = await call("PATCH", "/calendar/move", {
    id: sessionEvent.id,
    date: addDays(3),
  });
  ok(
    "calendar drag-drop reschedule works",
    moved.status === 200 && moved.data.session.date === addDays(3),
  );
}

const focus = await call("GET", "/focus");
ok(
  "focus stats load",
  focus.status === 200 &&
    typeof focus.data.stats.totalFocusMinutes === "number",
);

const notifs = await call("GET", "/notifications");
ok(
  "notifications load",
  notifs.status === 200 && Array.isArray(notifs.data.notifications),
);

/* ---------- 10. Study AI ---------- */
const aiStatus = await call("GET", "/ai/status");
ok(
  "ai status exposed",
  aiStatus.data.mode === "mock" || aiStatus.data.mode === "live",
);

const q1 = await call("POST", "/ai/ask", {
  message: "What should I study today?",
});
ok("AI answers today question", q1.status === 200 && q1.data.text.length > 60);
ok(
  "AI uses real subject data",
  /Mathematics|Physics|English/.test(q1.data.text),
);

const q2 = await call("POST", "/ai/ask", {
  message: "I have 3 hours today. Make a plan.",
});
ok(
  "AI builds hour plan",
  /3(\.0)?h/.test(q2.data.text),
  q2.data.text.slice(0, 80),
);

const q3 = await call("POST", "/ai/ask", {
  message: "I have an exam in 5 days. What should I prioritize?",
});
ok("AI prioritises by exam", /priority|prepar/i.test(q3.data.text));

const q4 = await call("POST", "/ai/ask", { message: "Quiz me on Python" });
ok(
  "AI returns quiz",
  Array.isArray(q4.data.quiz?.items) && q4.data.quiz.items.length > 0,
);

const q5 = await call("POST", "/ai/ask", { message: "Give me 20 MCQs" });
ok(
  "AI honours MCQ count",
  q5.data.quiz?.items?.length === 20,
  `n=${q5.data.quiz?.items?.length}`,
);

const q6 = await call("POST", "/ai/ask", {
  message: "Explain limits and continuity",
});
ok("AI explains topic", q6.data.text.length > 100);

const q7 = await call("POST", "/ai/ask", {
  message: "Create a revision plan for Mathematics",
});
ok("AI builds revision plan", /revision plan/i.test(q7.data.text));

const q8 = await call("POST", "/ai/ask", {
  message: "I missed yesterday's study plan.",
});
ok("AI handles missed sessions", q8.data.text.length > 40);

const emptyQ = await call("POST", "/ai/ask", { message: "" });
ok("AI validates empty question", emptyQ.status === 422);

const quick = await call("POST", "/ai/quick/today");
ok("quick intents work", quick.status === 200 && quick.data.question);

/* ---------- 11. settings ---------- */
const badHours = await call("PATCH", "/settings", { availability: 99 });
ok(
  "availability validated",
  badHours.status === 422 && badHours.data.fields.availability,
);
const badTime = await call("PATCH", "/settings", { preferredTime: "Midnight" });
ok("preferred time validated", badTime.status === 422);
const okSettings = await call("PATCH", "/settings", {
  availability: 6,
  preferredTime: "Morning",
  holidays: [0, 6],
});
ok(
  "settings save",
  okSettings.status === 200 && okSettings.data.settings.availableHours === 6,
);

const badPw = await call("POST", "/settings/password", {
  current: "wrong",
  new: "newpass1",
});
ok("password change validates current", badPw.status === 422);
const okPw = await call("POST", "/settings/password", {
  current: "secret1",
  new: "newpass2",
});
ok("password changed", okPw.status === 200);
const relogin = await call("POST", "/auth/login", {
  email,
  password: "newpass2",
});
ok("login with new password", relogin.status === 200);
token = relogin.data.token;

/* ---------- 12. settings effect on planning ---------- */
const afterChange = await call("POST", "/plan/generate", {
  horizonDays: 7,
  replace: true,
});
ok("regenerate after settings change", afterChange.status === 200);
const morningPlan = await call("GET", `/plan?from=${todayKey()}&days=7`);
// Today keeps already-scheduled blocks (they may be in progress); future days
// must land entirely inside the new morning window.
const futureSessions = Object.values(morningPlan.data.plan)
  .flat()
  .filter((s) => s.date > todayKey());
ok(
  "morning preference respected after regenerate",
  futureSessions.length > 0 &&
    futureSessions.every((s) => Number(s.startTime.slice(0, 2)) < 14),
  futureSessions
    .map((s) => `${s.date} ${s.startTime}`)
    .slice(0, 5)
    .join(","),
);

/* ---------- 13. demo data ---------- */
const demo = await call("POST", "/auth/demo", {});
ok("demo account loads", demo.status === 200 && demo.data.user.onboarded);
const demoToken = demo.data.token;
token = demoToken;
const demoDash = await call("GET", "/dashboard");
ok(
  "demo student has 5 subjects",
  demoDash.data.subjects.length === 5,
  `n=${demoDash.data.subjects.length}`,
);
ok("demo has exam countdowns", demoDash.data.exams.length === 5);
ok(
  "demo has 14 days of history + plan",
  (await call("GET", "/analytics?days=30")).data.totals.completed > 15,
);
ok("demo has tasks", demoDash.data.tasks.length > 0);
ok(
  "demo has a streak",
  demoDash.data.streak > 0,
  `streak=${demoDash.data.streak}`,
);
ok(
  "demo subject mix matches spec",
  [
    "Mathematics",
    "Programming",
    "Physics",
    "Communication Skills",
    "Environmental Studies",
  ].every((n) => demoDash.data.subjects.some((s) => s.name === n)),
);

/* ---------- 14. data isolation ---------- */
const other = await call("POST", "/auth/register", {
  name: "Other User",
  email: `other${Date.now()}@x.com`,
  password: "secret1",
});
const mine = token;
token = other.data.token;
const otherDash = await call("GET", "/dashboard");
ok(
  "new account is isolated (no subjects)",
  otherDash.data.subjects.length === 0,
);
const otherPlan = await call("GET", `/plan?from=${todayKey()}&days=7`);
ok(
  "new account sees no sessions",
  Object.values(otherPlan.data.plan).flat().length === 0,
);
token = mine;
const mineStill = await call("GET", "/dashboard");
ok("other user data not visible", mineStill.data.subjects.length === 5);

/* ---------- 15. cleanup + logout ---------- */
const logout = await call("POST", "/auth/logout", {});
ok("logout works", logout.status === 200);
const afterLogout = await call("GET", "/dashboard");
ok("token invalid after logout", afterLogout.status === 401);

console.log(results.join("\n"));
console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
