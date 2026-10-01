/**
 * Frontend smoke test — executes every real page module against the DOM shim
 * and asserts it renders. This is the stand-in for a browser: it catches
 * ReferenceErrors, bad imports and broken render paths.
 *
 * Run: node test/frontend.mjs
 */
import { setToken, textOf, findAll, app, doc } from "./dom-shim.mjs";

// Seed a real demo session BEFORE any app module loads, so app.js boots into
// the authenticated shell exactly like a returning user in a browser.
const BASE = process.env.BASE || "http://127.0.0.1:4173/api";
const demo = await (
  await fetch(`${BASE}/auth/demo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  })
).json();
setToken(demo.token);
localStorage.setItem("studyai.token", demo.token);
globalThis.location.hash = "#/dashboard";
const me = await (
  await fetch(`${BASE}/auth/me`, {
    headers: { Authorization: `Bearer ${demo.token}` },
  })
).json();
const user = me.user;

let pass = 0,
  fail = 0;
const log = [];
const errors = [];

function ok(name, cond, detail = "") {
  if (cond) {
    pass++;
    log.push(`  PASS  ${name}`);
  } else {
    fail++;
    log.push(`  FAIL  ${name}${detail ? " — " + detail : ""}`);
  }
}

const silence = () => {
  const realError = console.error;
  console.error = (...a) => {
    errors.push(a.map(String).join(" "));
  };
  return () => {
    console.error = realError;
  };
};

async function guarded(name, fn) {
  const restore = silence();
  try {
    const out = await fn();
    return out;
  } catch (err) {
    ok(name, false, `${err.name}: ${err.message}`);
    return null;
  } finally {
    restore();
  }
}

/* ---------------- auth: the demo account was loaded above ---------------- */
ok("demo user loaded for frontend test", Boolean(user?.name), user?.name);

/* ---------------- shared modules ---------------- */
const ui = await import("../public/js/ui.js");
const comp = await import("../public/js/components.js");

await guarded("ui.js exports", async () => {
  ok(
    "ui.js exports h/icon",
    typeof ui.h === "function" && typeof ui.icon === "function",
  );
  ok("ui.js date helpers work", ui.today() === ui.addDays(ui.today(), 0));
  ok(
    "ui.js fmtMinutes formats",
    ui.fmtMinutes(90) === "1h 30m",
    ui.fmtMinutes(90),
  );
  ok(
    "ui.js icon creates svg",
    ui.icon("check", 16).tagName.toLowerCase() === "svg",
  );
  // exercise every icon name so a typo surfaces
  for (const n of [
    "dashboard",
    "plan",
    "book",
    "tasks",
    "exam",
    "calendar",
    "focus",
    "chart",
    "ai",
    "settings",
    "logout",
    "bell",
    "plus",
    "check",
    "x",
    "play",
    "pause",
    "skip",
    "edit",
    "trash",
    "clock",
    "fire",
    "sparkles",
    "refresh",
    "menu",
    "target",
    "moon",
    "sun",
    "arrow",
    "chevronL",
    "chevronR",
    "flag",
    "layers",
    "zap",
    "users",
    "inbox",
    "quote",
    "eye",
    "brain",
    "quote",
  ]) {
    const s = ui.icon(n, 16);
    if (s.innerHTML === "" || s.innerHTML === undefined) {
      ok(`icon ${n}`, false);
    }
  }
  ok("all icons render", true);
});

await guarded("components.js exports", async () => {
  for (const fn of [
    "progressBar",
    "stat",
    "modal",
    "confirmDialog",
    "field",
    "textInput",
    "selectInput",
    "rangeInput",
    "errorSummary",
    "setFieldError",
    "emptyState",
    "skeleton",
    "lineChart",
    "barChart",
    "donutChart",
    "rankedBars",
    "sessionCard",
    "dayTimeline",
    "insightCard",
    "aiNote",
    "difficultyBadge",
    "countdownBadge",
    "mdToHtml",
    "subjectProgressText",
    "asciiBar",
  ]) {
    ok(`components exports ${fn}`, typeof comp[fn] === "function");
  }
});

await guarded("chart components render", async () => {
  const data = Array.from({ length: 14 }, (_, i) => ({
    date: ui.addDays(ui.today(), i - 13),
    minutes: i * 10,
    planned: 120,
  }));
  ok(
    "lineChart builds",
    JSON.stringify(comp.lineChart(data, { height: 100 })).includes("svg"),
  );
  ok(
    "barChart builds",
    comp
      .barChart(
        data.map((d) => ({ label: "x", value: d.minutes })),
        { height: 100 },
      )
      .innerHTML.includes("<rect"),
  );
  ok(
    "donutChart builds",
    comp.donutChart([{ label: "a", value: 5, color: "red" }], {}).children
      .length > 0,
  );
  ok(
    "rankedBars builds",
    comp.rankedBars([{ label: "a", value: 5, color: "red" }]).children.length >
      0,
  );
  ok(
    "mdToHtml handles bullets",
    comp.mdToHtml("- one\n- two").includes("<li>one</li>"),
  );
  ok(
    "mdToHtml handles bold",
    comp.mdToHtml("**hi**").includes("<strong>hi</strong>"),
  );
});

/* ---------------- every page module ---------------- */
const pages = [
  "dashboard",
  "plan",
  "subjects",
  "tasks",
  "exams",
  "calendar",
  "focus",
  "analytics",
  "ai",
  "settings",
];
const results = {};

for (const name of pages) {
  const mod = await import(`../public/js/pages/${name}.js`);
  const fn = mod[`${name}Page`];
  ok(`${name}.js exports ${name}Page`, typeof fn === "function");

  const restore = silence();
  let el = null;
  let threw = null;
  try {
    const res = await fn({ user, refresh: () => {}, navigate: () => {} });
    el = res?.el || null;
    if (!el) threw = new Error("page returned no element");
  } catch (err) {
    threw = err;
  }
  restore();

  if (threw) {
    ok(`${name} renders`, false, `${threw.name}: ${threw.message}`);
    results[name] = { error: String(threw) };
  } else {
    const txt = textOf(el);
    const nodes = findAll(el, () => true).length;
    ok(
      `${name} renders`,
      nodes > 5 && txt.length > 40,
      `nodes=${nodes} chars=${txt.length}`,
    );
    results[name] = {
      nodes,
      chars: txt.length,
      snippet: txt.slice(0, 130).replace(/\s+/g, " "),
    };
  }
  errors.length = 0;
}

/* ---------------- page-specific content assertions ---------------- */
const dash = await (
  await fetch(`${BASE}/dashboard`, {
    headers: { Authorization: `Bearer ${demo.token}` },
  })
).json();
ok(
  "dashboard has sessions for the demo user",
  dash.today.sessions.length > 0,
  `n=${dash.today.sessions.length}`,
);
ok("dashboard has 5 subjects", dash.subjects.length === 5);
ok("dashboard has insights", dash.insights.length > 0);
ok("dashboard has 5 exams", dash.exams.length === 5);

const dashMod = await import("../public/js/pages/dashboard.js");
const dashEl = (
  await dashMod.dashboardPage({ user, refresh: () => {}, navigate: () => {} })
).el;
const dashTxt = textOf(dashEl);
ok("dashboard shows subject progress", /Mathematics/.test(dashTxt));
ok("dashboard shows a streak value", /streak/i.test(dashTxt));
ok(
  "dashboard renders AI insights",
  dashTxt.length > 500,
  `chars=${dashTxt.length}`,
);

const planMod = await import("../public/js/pages/plan.js");
const planEl = (
  await planMod.planPage({ user, refresh: () => {}, navigate: () => {} })
).el;
const planTxt = textOf(planEl);
ok("plan shows priority ranking", /Priority ranking/i.test(planTxt));
ok("plan shows day sections", /Today|Tomorrow/.test(planTxt));
ok(
  "plan lists sessions",
  /Mathematics|Programming|Physics/.test(planTxt),
  planTxt.slice(0, 100),
);

const subMod = await import("../public/js/pages/subjects.js");
const subEl = (
  await subMod.subjectsPage({ user, refresh: () => {}, navigate: () => {} })
).el;
ok(
  "subjects table renders",
  /Preparation/.test(textOf(subEl)) && /Priority/.test(textOf(subEl)),
);

/* ---------------- exams page UX ---------------- */
const examData = await (
  await fetch(`${BASE}/exams`, {
    headers: { Authorization: `Bearer ${demo.token}` },
  })
).json();
const examCount = examData.exams.length;
const examsMod = await import("../public/js/pages/exams.js");
const examsEl = (
  await examsMod.examsPage({ user, refresh: () => {}, navigate: () => {} })
).el;
const examsTxt = textOf(examsEl);
ok("exams: next-exam hero card", /Next exam/.test(examsTxt));
ok(
  "exams: shows a days-left countdown",
  /\d+\s*days left/.test(examsTxt),
  examsTxt.match(/\d+\s*days left/)?.[0],
);
ok(
  "exams: shows a plain-language verdict",
  /Looking good|Almost there|Needs more work|At risk|Just started/.test(
    examsTxt,
  ),
);
ok(
  "exams: gives a concrete daily study target",
  /Study about .* a day/.test(examsTxt),
  examsTxt.match(/Study about [^.]*\./)?.[0],
);
ok("exams: explains the priority reason", /because /.test(examsTxt));
ok(
  "exams: has filter tabs",
  /All/.test(examsTxt) &&
    /Upcoming/.test(examsTxt) &&
    /Needs attention/.test(examsTxt),
);
ok(
  "exams: each exam offers Study plan + Update date",
  (examsTxt.match(/Study plan/g) || []).length >= examCount &&
    (examsTxt.match(/Update date/g) || []).length >= examCount,
);
ok(
  "exams: on-track / attention summary tiles",
  /On track/.test(examsTxt) && /Need attention/.test(examsTxt),
);
ok(
  "exams: readiness donut + priority ranking",
  /Readiness by subject/.test(examsTxt) && /Study priority/.test(examsTxt),
);
ok(
  "exams: renders one card per exam",
  findAll(examsEl, (n) => n.classList?.contains("exam-item")).length ===
    examCount,
  `cards=${findAll(examsEl, (n) => n.classList?.contains("exam-item")).length} expected=${examCount}`,
);
ok(
  "exams: readiness ring present",
  findAll(examsEl, (n) => n.classList?.contains("ring-label")).length === 1,
);

const aiMod = await import("../public/js/pages/ai.js");
const aiEl = (
  await aiMod.aiPage({ user, refresh: () => {}, navigate: () => {} })
).el;
const aiTxt = textOf(aiEl);
ok(
  "study AI greets with real data",
  /Level|subjects|streak/i.test(aiTxt),
  aiTxt.slice(0, 120),
);
ok("study AI shows suggestions", /What should I study today/.test(aiTxt));

const calMod = await import("../public/js/pages/calendar.js");
const calEl = (
  await calMod.calendarPage({ user, refresh: () => {}, navigate: () => {} })
).el;
ok(
  "calendar renders 6 weeks",
  findAll(calEl, (n) => n.classList.contains("cal-day")).length === 42,
  `days=${findAll(calEl, (n) => n.classList.contains("cal-day")).length}`,
);

const focusMod = await import("../public/js/pages/focus.js");
const focusRes = await focusMod.focusPage({
  user,
  refresh: () => {},
  navigate: () => {},
});
ok(
  "focus timer renders",
  textOf(focusRes.el).includes("25:00") ||
    /Start focus/.test(textOf(focusRes.el)),
  textOf(focusRes.el).slice(0, 120),
);
if (focusRes.cleanup) focusRes.cleanup();

const settingsMod = await import("../public/js/pages/settings.js");
const setEl = (
  await settingsMod.settingsPage({
    user,
    refresh: () => {},
    navigate: () => {},
  })
).el;
const setTxt = textOf(setEl);
ok("settings shows availability", /Study availability/.test(setTxt));
ok("settings shows appearance toggle", /Appearance/.test(setTxt));
ok("settings shows achievements", /Achievements/.test(setTxt));

/* ---------------- app shell + router ---------------- */
// app.js runs boot() on import, so seed a token + a matching localStorage entry
// first to exercise the authenticated path.
localStorage.setItem("studyai.token", demo.token);
globalThis.location.hash = "#/dashboard";
const shell = await import("../public/js/shell.js");
// buildShell renders the user from the shared store, so populate it first.
shell.store.user = user;
shell.store.gamification = { xp: 1840, level: 5 };
shell.store.levelProgress = { percent: 42, xp: 1840, level: 5 };
ok(
  "shell exports 10 routes",
  shell.ROUTES.length === 10,
  `n=${shell.ROUTES.length}`,
);
ok(
  "shell routes match nav order",
  shell.ROUTES.map((r) => r.id).join(",") ===
    "dashboard,plan,subjects,tasks,exams,calendar,focus,analytics,ai,settings",
);

const shellEl = shell.buildShell({
  route: "dashboard",
  onNavigate: () => {},
  onLogout: () => {},
  onRefreshNotifications: () => {},
  children: ui.h("div", { class: "x" }, "page body"),
});
const shellTxt = textOf(shellEl);
for (const label of [
  "Dashboard",
  "My Plan",
  "Subjects",
  "Tasks",
  "Exams",
  "Calendar",
  "Focus",
  "Analytics",
  "Ai-Buddy",
  "Settings",
]) {
  ok(`nav has ${label}`, shellTxt.includes(label));
}
ok("sidebar shows user name", shellTxt.includes(user.name.split(" ")[0]));
ok("XP widget present", shellTxt.includes("XP"));

/* ---------------- auth page + onboarding ---------------- */
const authMod = await import("../public/js/pages/auth.js");
const authEl = authMod.authPage({ onAuthed: () => {}, mode: "login" });
ok(
  "login page renders",
  /Welcome back/.test(textOf(authEl)) && /Sign in/.test(textOf(authEl)),
);
ok("login page offers demo", /Explore the demo account/.test(textOf(authEl)));

const authEl2 = authMod.authPage({ onAuthed: () => {}, mode: "register" });
ok("register page renders", /Start studying smarter/.test(textOf(authEl2)));

const onbMod = await import("../public/js/pages/onboarding.js");
const onbEl = onbMod.onboardingPage({
  user: { name: "X", course: "Y", semester: 1 },
  onDone: () => {},
});
ok(
  "onboarding step 1 renders",
  /Let.s get you set up/.test(textOf(onbEl)) || /About you/.test(textOf(onbEl)),
  textOf(onbEl).slice(0, 100),
);

/* ---------------- app.js full boot ---------------- */
// app.js runs boot() on import and renders into #app. mountShell rebuilds
// #app's children, and renderRoute swaps #page-root's, so re-query the tree.
const appMod = await import("../public/js/app.js");
await new Promise((r) => setTimeout(r, 3000));
const liveShell = findAll(app, (n) => n.classList?.contains("shell"));
ok(
  "app.js booted into a shell",
  liveShell.length > 0,
  `appChildren=${app.children.length} classes=[${app.children.map((c) => c.className).join("|")}]`,
);
if (liveShell.length) {
  const liveTxt = textOf(liveShell[0]);
  ok(
    "app shell nav is complete",
    [
      "Dashboard",
      "My Plan",
      "Subjects",
      "Tasks",
      "Exams",
      "Calendar",
      "Focus",
      "Analytics",
      "Ai-Buddy",
      "Settings",
    ].every((l) => liveTxt.includes(l)),
  );
  ok(
    "app shell shows the signed-in student",
    liveTxt.includes(user.name.split(" ")[0]),
  );
}
const liveStats = findAll(app, (n) => n.classList?.contains("stat"));
ok(
  "app.js rendered the dashboard",
  liveStats.length > 0,
  `stats=${liveStats.length}`,
);
ok(
  "no loading skeleton left after boot",
  !findAll(app, (n) => n.classList?.contains("skeleton") && !n.style.height)
    .length,
);
ok(
  "dashboard timeline rendered from live data",
  findAll(app, (n) => n.classList?.contains("slot")).length > 0,
  `slots=${findAll(app, (n) => n.classList?.contains("slot")).length}`,
);

for (const fn of [
  "startSession",
  "completeSession",
  "skipSession",
  "rescheduleSession",
  "showAiMessage",
  "editSession",
  "sessionHandlers",
  "navigate",
  "refreshNotifications",
  "refreshBadges",
]) {
  ok(`app.js exports ${fn}`, typeof appMod[fn] === "function");
}
ok(
  "sessionHandlers builds actions",
  Object.keys(appMod.sessionHandlers(() => {})).length === 6,
  `keys=${Object.keys(appMod.sessionHandlers(() => {})).join(",")}`,
);

/* ---------------- 3D motion layer ---------------- */
const fx = await import("../public/js/fx.js");
ok("fx.js exports initFX", typeof fx.initFX === "function");
ok("fx.js exports stagger", typeof fx.stagger === "function");
ok("fx.js exports attachTilt", typeof fx.attachTilt === "function");
ok(
  "fx.js tilt angle is bounded (not nauseating)",
  fx.MAX_TILT > 0 && fx.MAX_TILT <= 10,
  `MAX_TILT=${fx.MAX_TILT}`,
);

ok(
  "initFX runs without throwing",
  (() => {
    try {
      fx.initFX();
      return true;
    } catch (err) {
      ok("initFX error", false, err.message);
      return false;
    }
  })(),
);
ok(
  "initFX marks the document as 3D-enabled",
  doc.documentElement.className.includes("fx-3d"),
  `class="${doc.documentElement.className}"`,
);
ok(
  "stagger() runs without throwing",
  (() => {
    try {
      fx.stagger(app, ".card, .stat");
      return true;
    } catch (err) {
      ok("stagger error", false, err.message);
      return false;
    }
  })(),
);

/* The notification modal previously crashed: `icon` was not imported. */
ok(
  "notification modal renders (icon import fix)",
  (() => {
    try {
      appMod.showNotifications([
        {
          id: "1",
          kind: "session",
          severity: "info",
          title: "Study AI",
          message: "hi",
        },
      ]);
      return true;
    } catch (err) {
      ok("showNotifications error", false, err.message);
      return false;
    }
  })(),
);

/* ---------------- report ---------------- */
console.log(log.join("\n"));
if (errors.length) {
  console.log("\nConsole errors captured:");
  for (const e of errors.slice(0, 12)) console.log("  " + e);
}
console.log(`\n${pass} passed, ${fail} failed`);
console.log("\nRendered page summary:");
for (const [name, r] of Object.entries(results)) {
  console.log(
    `  ${name.padEnd(10)} ${r.error ? "ERROR: " + r.error : `${String(r.nodes).padStart(4)} nodes  ${String(r.chars).padStart(5)} chars  | ${r.snippet}`}`,
  );
}
process.exit(fail ? 1 : 0);
