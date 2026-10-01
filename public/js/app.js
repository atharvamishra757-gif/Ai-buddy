import { h, $, toast, today, fmtMinutes, icon } from "./ui.js";
import { get, post, patch, del, auth, ApiError } from "./api.js";
import { initFX } from "./fx.js";
import {
  applyTheme,
  buildShell,
  store,
  setNotificationBadge,
  updateXp,
  ROUTES,
  setBadges,
  setShellRoute,
} from "./shell.js";
import {
  modal,
  field,
  textInput,
  selectInput,
  insightCard,
  sessionCard,
  confirmDialog,
} from "./components.js";
import { authPage } from "./pages/auth.js";
import { onboardingPage } from "./pages/onboarding.js";

import { dashboardPage } from "./pages/dashboard.js";
import { planPage } from "./pages/plan.js";
import { subjectsPage } from "./pages/subjects.js";
import { tasksPage } from "./pages/tasks.js";
import { examsPage } from "./pages/exams.js";
import { calendarPage } from "./pages/calendar.js";
import { focusPage } from "./pages/focus.js";
import { analyticsPage } from "./pages/analytics.js";
import { aiPage } from "./pages/ai.js";
import { settingsPage } from "./pages/settings.js";

const PAGES = {
  dashboard: dashboardPage,
  plan: planPage,
  subjects: subjectsPage,
  tasks: tasksPage,
  exams: examsPage,
  calendar: calendarPage,
  focus: focusPage,
  analytics: analyticsPage,
  ai: aiPage,
  settings: settingsPage,
};

let currentRoute = null;
let currentCleanup = null;

/* ---------------- session actions shared across pages ---------------- */

export async function startSession(session, { onDone } = {}) {
  try {
    await post(`/sessions/${session.id}/status`, { status: "in_progress" });
    toast(
      `Focus timer started for ${session.subjectName} · ${session.topic}.`,
      { kind: "ok", title: "Session started" },
    );
    if (currentRoute !== "focus") location.hash = "#/focus";
    onDone?.();
  } catch (err) {
    toast(err.message, { kind: "err" });
  }
}

export async function completeSession(
  session,
  { onDone, silent = false } = {},
) {
  const input = h("textarea", {
    class: "textarea",
    placeholder:
      "e.g. Solved 12 integration problems, cleared 2 doubts on vectors…",
  });
  const m = modal({
    title: "Nice work — what did you accomplish?",
    body: h(
      "div",
      { class: "stack" },
      h(
        "p",
        { class: "small dim" },
        h("b", {}, `${session.subjectName} · ${session.topic}`),
        ` — ${session.type}, ${session.duration} min. A one-line note makes spaced repetition far more effective.`,
      ),
      field({ label: "Session note (optional)", input }),
    ),
    footer: [
      h("button", { class: "btn", onclick: () => m.close() }, "Later"),
      h(
        "button",
        {
          class: "btn btn-primary",
          onclick: async (e) => {
            e.currentTarget.disabled = true;
            try {
              const res = await post(`/sessions/${session.id}/status`, {
                status: "completed",
                notes: session.notes,
                accomplished: input.value.trim() || undefined,
              });
              m.close();
              if (res.xp?.leveledUp)
                toast(`You reached level ${res.xp.level}!`, {
                  kind: "ok",
                  title: "Level up",
                });
              else
                toast(
                  `+${Math.round(session.duration / 5)} XP · ${session.subjectName} logged.`,
                  { kind: "ok", title: "Session complete" },
                );
              for (const b of res.badges || [])
                toast(`Earned “${b.name}” — ${b.desc}`, {
                  kind: "ok",
                  title: `Badge ${b.icon}`,
                });
              if (res.streak > 0)
                toast(`You're on a ${res.streak}-day streak.`, {
                  kind: "info",
                  title: "Streak",
                });
              onDone?.(res);
              refreshBadges();
            } catch (err) {
              toast(err.message, { kind: "err" });
              e.currentTarget.disabled = false;
            }
          },
        },
        icon("check", 15),
        "Mark complete",
      ),
    ],
  });
}

export async function skipSession(session, { onDone } = {}) {
  try {
    await post(`/sessions/${session.id}/status`, { status: "skipped" });
    toast(
      `Skipped. ${session.duration} minutes freed up for higher-priority work.`,
      { kind: "info", title: "Session skipped" },
    );
    onDone?.();
  } catch (err) {
    toast(err.message, { kind: "err" });
  }
}

export async function rescheduleSession(session, { onDone } = {}) {
  try {
    const res = await post(`/sessions/${session.id}/reschedule`, {});
    showAiMessage(res.message, "Plan rebalanced");
    onDone?.(res);
  } catch (err) {
    toast(err.message, { kind: "err" });
  }
}

export function showAiMessage(message, title = "Study AI") {
  const m = modal({
    title,
    body: h(
      "div",
      { class: "ai-note", style: { margin: "0" } },
      h("div", { class: "ai-avatar" }, "S"),
      h("div", { style: { lineHeight: "1.65" } }, message),
    ),
    footer: [
      h(
        "button",
        { class: "btn btn-primary", onclick: () => m.close() },
        "Got it",
      ),
    ],
  });
  return m;
}

export async function editSession(session, { onDone } = {}) {
  const err = {};
  const input = {
    topic: textInput({ name: "topic", value: session.topic || "" }),
    objective: textInput({ name: "objective", value: session.objective || "" }),
    duration: h("input", {
      class: "input",
      type: "number",
      name: "duration",
      min: 5,
      max: 240,
      step: 5,
      value: session.duration,
    }),
    date: h("input", {
      class: "input",
      type: "date",
      name: "date",
      value: session.date,
    }),
    type: selectInput({
      value: session.type,
      options: ["Learning", "Practice", "Revision", "Mock Test"].map((t) => ({
        value: t,
        label: t,
      })),
    }),
    notes: h(
      "textarea",
      {
        class: "textarea",
        name: "notes",
        placeholder: "Add notes, doubts, resources…",
      },
      session.notes || "",
    ),
  };
  input.notes.value = session.notes || "";

  const m = modal({
    title: "Edit session",
    body: h(
      "div",
      { class: "stack" },
      h(
        "div",
        { class: "row" },
        h("b", { class: "small" }, session.subjectName),
        h("span", { class: "badge" }, session.date),
      ),
      h(
        "div",
        { class: "grid g-2" },
        field({ label: "Topic", input: input.topic }),
        field({ label: "Session type", input: input.type }),
      ),
      field({ label: "Study objective", input: input.objective }),
      h(
        "div",
        { class: "grid g-2" },
        field({ label: "Duration (minutes)", input: input.duration }),
        field({ label: "Reschedule to date", input: input.date }),
      ),
      field({ label: "Notes", input: input.notes }),
    ),
    footer: [
      h(
        "button",
        {
          class: "btn btn-danger",
          onclick: async () => {
            await post(`/sessions/${session.id}/status`, { status: "missed" });
            m.close();
            toast("Marked as missed. Let the AI redistribute it.", {
              kind: "info",
            });
            onDone?.();
          },
        },
        icon("x", 14),
        "Mark missed",
      ),
      h("div", { class: "spacer" }),
      h("button", { class: "btn", onclick: () => m.close() }, "Cancel"),
      h(
        "button",
        {
          class: "btn btn-primary",
          onclick: async (e) => {
            e.currentTarget.disabled = true;
            try {
              await patch(`/sessions/${session.id}`, {
                topic: input.topic.value,
                objective: input.objective.value,
                duration: Number(input.duration.value),
                date: input.date.value,
                type: input.type.value,
                notes: input.notes.value,
              });
              m.close();
              toast("Session updated.", { kind: "ok" });
              onDone?.();
            } catch (err) {
              for (const [k, v] of Object.entries(err.fields || {})) {
                input[k]?.classList.add("invalid");
                toast(v, { kind: "err" });
              }
              if (!Object.keys(err.fields || {}).length)
                toast(err.message, { kind: "err" });
              e.currentTarget.disabled = false;
            }
          },
        },
        icon("check", 15),
        "Save changes",
      ),
    ],
  });
}

export function sessionHandlers(refresh) {
  return {
    onStart: (s) => startSession(s, { onDone: refresh }),
    onComplete: (s) => completeSession(s, { onDone: refresh }),
    onSkip: (s) => skipSession(s, { onDone: refresh }),
    onMiss: (s) => rescheduleSession(s, { onDone: refresh }),
    onReschedule: (s) => rescheduleSession(s, { onDone: refresh }),
    onEdit: (s) => editSession(s, { onDone: refresh }),
  };
}

/* ---------------- notifications ---------------- */

export async function refreshNotifications(open = false) {
  try {
    const { notifications } = await get("/notifications");
    store.notifications = notifications;
    setNotificationBadge(notifications.length);
    if (open) showNotifications(notifications);
  } catch {
    /* non-fatal */
  }
}

export function showNotifications(list) {
  const ICON = {
    session: "clock",
    exam: "exam",
    deadline: "flag",
    missed: "refresh",
    revision: "refresh",
  };
  const m = modal({
    title: "Notifications",
    body: list.length
      ? h(
          "div",
          { class: "stack", style: { gap: "9px" } },
          list.map((n) =>
            h(
              "div",
              { class: `insight sev-${n.severity}` },
              h(
                "div",
                { class: "insight-icon" },
                icon(ICON[n.kind] || "bell", 15),
              ),
              h("div", {}, h("h4", {}, n.title), h("p", {}, n.message)),
            ),
          ),
        )
      : h(
          "p",
          { class: "muted small tc", style: { padding: "24px 0" } },
          "You’re all caught up. No reminders pending.",
        ),
    footer: [
      h(
        "button",
        { class: "btn btn-primary", onclick: () => m.close() },
        "Close",
      ),
    ],
  });
}

/* ---------------- XP / badges ---------------- */

export async function refreshBadges() {
  try {
    const d = await get("/dashboard");
    store.levelProgress = d.levelProgress;
    store.gamification = d.gamification;
    updateXp(
      d.levelProgress.percent,
      d.levelProgress.xp,
      d.levelProgress.level,
    );
    setBadges({
      plan: d.today.sessions.filter((s) => s.status === "planned").length,
      tasks: d.tasks.length,
    });
  } catch {
    /* non-fatal */
  }
}

/* ---------------- router ---------------- */

function routeFromHash() {
  const hash = location.hash.replace(/^#\/?/, "").split("?")[0];
  return ROUTES.some((r) => r.id === hash) ? hash : "dashboard";
}

async function renderRoute() {
  const route = routeFromHash();
  const pageRoot = $("#page-root");
  if (!pageRoot) return;

  if (currentCleanup) {
    try {
      currentCleanup();
    } catch {}
    currentCleanup = null;
  }
  currentRoute = route;
  setShellRoute(route);

  const builder = PAGES[route];
  pageRoot.innerHTML = "";
  pageRoot.append(
    h(
      "div",
      { class: "stack", style: { gap: "14px" } },
      h("div", {
        class: "skeleton",
        style: { height: "30px", width: "260px" },
      }),
      h(
        "div",
        { class: "grid g-4" },
        ...Array.from({ length: 4 }, () =>
          h("div", { class: "skeleton", style: { height: "96px" } }),
        ),
      ),
      h("div", { class: "skeleton", style: { height: "320px" } }),
    ),
  );

  try {
    const result = await builder({
      user: store.user,
      refresh: () => renderRoute(),
      navigate,
    });
    pageRoot.innerHTML = "";
    pageRoot.append(result.el);
    if (result.cleanup) currentCleanup = result.cleanup;
    refreshBadges();
  } catch (err) {
    console.error(err);
    pageRoot.innerHTML = "";
    pageRoot.append(
      h(
        "div",
        { class: "empty" },
        h("div", { class: "empty-icon" }, icon("x", 24)),
        h("h3", {}, "This page failed to load"),
        h("p", { class: "small" }, err.message || "Unknown error"),
        h(
          "div",
          { class: "mt-2" },
          h(
            "button",
            { class: "btn btn-primary", onclick: () => renderRoute() },
            "Try again",
          ),
        ),
      ),
    );
  }
}

export function navigate(route) {
  if (routeFromHash() === route) renderRoute();
  else location.hash = `#/${route}`;
}

/* ---------------- notifications permission ---------------- */
function requestNotificationPermission() {
  if (!("Notification" in window) || Notification.permission !== "default")
    return;
  try {
    Notification.requestPermission();
  } catch {
    /* ignore */
  }
}

/* ---------------- boot ---------------- */

function mountShell() {
  const app = $("#app");
  const shell = buildShell({
    route: currentRoute,
    onNavigate: navigate,
    onLogout: async () => {
      const ok = await confirmDialog({
        title: "Sign out?",
        message:
          "Your planner data stays saved on this device. You can sign back in any time.",
        confirmText: "Sign out",
        danger: false,
      });
      if (!ok) return;
      try {
        await post("/auth/logout");
      } catch {
        /* ignore */
      }
      auth.token = null;
      store.user = null;
      boot();
    },
    onRefreshNotifications: refreshNotifications,
  });
  app.innerHTML = "";
  app.append(shell);
  window.refreshRoute = renderRoute;
}

/**
 * Rebuild the shell (nav, topbar, sidebar) while keeping the current page
 * content in place, so theme/user changes don't wipe the rendered page.
 */
function reRenderShell() {
  const app = $("#app");
  const currentPage = $("#page-root");
  const preservedChildren = currentPage ? Array.from(currentPage.children) : [];
  mountShell();
  const newPage = $("#page-root");
  if (newPage && preservedChildren.length) {
    newPage.innerHTML = "";
    for (const child of preservedChildren) newPage.append(child);
  }
}

async function boot() {
  applyTheme(localStorage.getItem("studyai.theme") || "dark");
  const app = $("#app");

  if (!auth.token) return renderAuth();

  let me = null;
  try {
    ({ user: me } = await get("/auth/me"));
  } catch {
    auth.token = null;
    return renderAuth();
  }
  store.user = me;

  if (!me.onboarded) {
    app.innerHTML = "";
    app.append(
      onboardingPage({
        user: me,
        onDone: (updated) => {
          store.user = updated;
          requestNotificationPermission();
          location.hash = "#/dashboard";
          start();
        },
      }),
    );
    return;
  }
  start();
}

function renderAuth() {
  const app = $("#app");
  app.innerHTML = "";
  app.append(
    authPage({
      onAuthed: (user) => {
        store.user = user;
        requestNotificationPermission();
        if (!user.onboarded) {
          app.innerHTML = "";
          app.append(
            onboardingPage({
              user,
              onDone: (updated) => {
                store.user = updated;
                location.hash = "#/dashboard";
                start();
              },
            }),
          );
        } else {
          location.hash = "#/dashboard";
          start();
        }
      },
    }),
  );
}

async function start() {
  currentRoute = routeFromHash();
  reRenderShell();
  initFX();
  await renderRoute();
  await refreshNotifications();
  startReminderPolling();
}

let pollTimer = null;
function startReminderPolling() {
  clearInterval(pollTimer);
  pollTimer = setInterval(() => {
    if (document.visibilityState === "visible") refreshNotifications();
  }, 120000);
}

window.addEventListener("hashchange", () => {
  if (store.user) {
    if (!$("#page-root")) reRenderShell();
    renderRoute();
  }
});

window.addEventListener("auth:expired", () => {
  if (store.user) {
    store.user = null;
    boot();
  }
});

// Keyboard shortcuts
document.addEventListener("keydown", (e) => {
  if (!store.user || e.target.matches("input, textarea, select")) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const map = {
    d: "dashboard",
    p: "plan",
    s: "subjects",
    t: "tasks",
    e: "exams",
    c: "calendar",
    f: "focus",
    a: "analytics",
    i: "ai",
  };
  const target = map[e.key.toLowerCase()];
  if (target) {
    e.preventDefault();
    navigate(target);
  }
});

boot();
