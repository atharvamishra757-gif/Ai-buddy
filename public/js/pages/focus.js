import { h, icon, toast, fmtMinutes, fmtClock, today } from "../ui.js";
import { get, post, patch } from "../api.js";
import {
  stat,
  emptyState,
  donutChart,
  barChart,
  rankedBars,
  progressBar,
  field,
  textInput,
  selectInput,
  modal,
} from "../components.js";
import { navigate, refreshBadges } from "../app.js";

const PRESETS = [
  { key: "25/5", label: "Classic", focus: 25, brk: 5 },
  { key: "50/10", label: "Deep work", focus: 50, brk: 10 },
  { key: "90/20", label: "Marathon", focus: 90, brk: 20 },
  { key: "custom", label: "Custom", focus: 0, brk: 0 },
];

export async function focusPage({ user, refresh }) {
  let data = await get("/focus");
  let sessions = await get("/sessions?from=" + today() + "&to=" + today());
  let subjects = (await get("/subjects")).subjects;

  // Timer state
  let mode = "focus"; // focus | short | long
  let preset = 0;
  let totalSec = data.settings.focus * 60;
  let remainSec = totalSec;
  let running = false;
  let timerId = null;
  let customFocus = 30,
    customBreak = 5;
  let currentSession = null;
  let cycles = 0;

  const container = h("div", { class: "stack" });

  function durations() {
    if (preset < 3)
      return {
        focus: PRESETS[preset].focus,
        brk: PRESETS[preset].brk,
        label: PRESETS[preset].label,
      };
    return { focus: customFocus, brk: customBreak, label: "Custom" };
  }

  function setMode(next) {
    mode = next;
    const d = durations();
    totalSec =
      (next === "focus"
        ? d.focus
        : next === "short"
          ? d.brk
          : Math.round(d.brk * 2)) * 60;
    remainSec = totalSec;
    running = false;
    clearInterval(timerId);
    draw();
  }

  function tick() {
    remainSec--;
    if (remainSec <= 0) return finishInterval();
    updateRing();
  }

  function startTimer() {
    if (running) return;
    running = true;
    timerId = setInterval(tick, 1000);
    updateControls();
  }
  function pauseTimer() {
    running = false;
    clearInterval(timerId);
    updateControls();
  }
  function resetTimer() {
    running = false;
    clearInterval(timerId);
    setMode(mode);
  }

  async function finishInterval() {
    clearInterval(timerId);
    running = false;
    if (mode === "focus") {
      cycles++;
      chime();
      toast("Focus interval complete. Take a short break — you earned it.", {
        kind: "ok",
        title: "⏱ Interval done",
        duration: 6000,
      });
      if (currentSession) await completeCurrentSession();
      setMode(cycles % 4 === 0 ? "long" : "short");
    } else {
      chime();
      toast("Break over. Ready for the next block?", {
        kind: "info",
        title: "Break finished",
      });
      setMode("focus");
    }
  }

  function chime() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 660;
      gain.gain.setValueAtTime(0.001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.7);
      osc.start();
      osc.stop(ctx.currentTime + 0.75);
    } catch {
      /* audio blocked */
    }
  }

  async function completeCurrentSession() {
    const session = currentSession;
    if (!session) return;
    const note = h("textarea", {
      class: "textarea",
      placeholder: "What did you accomplish in this block?",
    });
    const m = modal({
      title: "Session complete — what did you accomplish?",
      body: h(
        "div",
        { class: "stack" },
        h(
          "p",
          { class: "small dim" },
          h("b", {}, `${session.subjectName} · ${session.topic}`),
        ),
        field({ label: "Quick note (optional)", input: note }),
      ),
      footer: [
        h("button", { class: "btn", onclick: () => m.close() }, "Later"),
        h(
          "button",
          {
            class: "btn btn-primary",
            onclick: async () => {
              m.close();
              try {
                const res = await post(`/sessions/${session.id}/status`, {
                  status: "completed",
                  accomplished: note.value.trim() || undefined,
                });
                if (res.xp?.leveledUp)
                  toast(`Level ${res.xp.level} reached!`, {
                    kind: "ok",
                    title: "Level up",
                  });
                for (const b of res.badges || [])
                  toast(`Earned “${b.name}” — ${b.desc}`, {
                    kind: "ok",
                    title: `Badge ${b.icon}`,
                  });
                currentSession = null;
                await reload();
                refreshBadges();
              } catch (err) {
                toast(err.message, { kind: "err" });
              }
            },
          },
          icon("check", 15),
          "Log session",
        ),
      ],
    });
  }

  async function reload() {
    data = await get("/focus");
    sessions = await get("/sessions?from=" + today() + "&to=" + today());
    draw();
  }

  /* ---- ring ---- */
  const R = 112,
    CIRC = 2 * Math.PI * R;
  let timeEl, modeEl;

  function updateRing() {
    const arc = document.getElementById("focus-prog");
    const pctLeft = Math.max(0, remainSec / totalSec);
    if (arc)
      arc.setAttribute(
        "stroke-dasharray",
        `${(pctLeft * CIRC).toFixed(1)} ${CIRC.toFixed(1)}`,
      );
    if (timeEl) timeEl.textContent = fmtClock(Math.max(0, remainSec));
  }

  function updateControls() {
    const btn = document.getElementById("focus-toggle");
    if (btn) {
      btn.innerHTML = "";
      btn.append(
        icon(running ? "pause" : "play", 16),
        running ? "Pause" : remainSec < totalSec ? "Resume" : "Start focus",
      );
    }
  }

  function draw() {
    container.innerHTML = "";
    const d = data.settings;
    const todaySessions = sessions.sessions;
    const activeSubjects = subjects.filter(
      (s) => todaySessions.some((x) => x.subjectId === s.id) || !currentSession,
    );

    timeEl = h(
      "div",
      { class: "timer-time" },
      fmtClock(Math.max(0, remainSec)),
    );
    modeEl = h(
      "div",
      { class: "timer-mode" },
      mode === "focus"
        ? "Focus"
        : mode === "short"
          ? "Short break"
          : "Long break",
    );

    const sessionSelect = selectInput({
      value: currentSession?.id || "",
      options: [
        { value: "", label: "— Choose a session to focus on —" },
        ...todaySessions
          .filter((s) => s.status === "planned" || s.status === "in_progress")
          .map((s) => ({
            value: s.id,
            label: `${s.startTime} · ${s.subjectName} — ${s.topic} (${s.duration}m)`,
          })),
      ],
      onChange: (v) => {
        currentSession = todaySessions.find((x) => x.id === v) || null;
        draw();
      },
    });

    container.append(
      h(
        "div",
        { class: "grid g-side" },
        // Timer
        h(
          "div",
          { class: "card" },
          h(
            "div",
            { class: "focus-stage" },
            h(
              "div",
              { class: "timer-ring" },
              h("div", {
                html: `<svg width="260" height="260" viewBox="0 0 260 260">
                <defs><linearGradient id="focusGrad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stop-color="var(--brand)"/><stop offset="100%" stop-color="var(--brand-2)"/>
                </linearGradient></defs>
                <circle class="track" cx="130" cy="130" r="${R}"/>
                <circle id="focus-prog" class="prog" cx="130" cy="130" r="${R}"
                        stroke-dasharray="${CIRC} ${CIRC}"/>
              </svg>`,
              }),
              h("div", { class: "timer-inner" }, timeEl, modeEl),
            ),

            currentSession
              ? h(
                  "div",
                  {
                    class: "ai-note",
                    style: { marginBottom: "16px", textAlign: "left" },
                  },
                  h("div", { class: "ai-avatar" }, "S"),
                  h(
                    "div",
                    {},
                    h("b", { class: "small" }, currentSession.subjectName),
                    h(
                      "div",
                      { class: "small", style: { marginTop: "3px" } },
                      currentSession.objective || currentSession.topic,
                    ),
                  ),
                )
              : h(
                  "p",
                  { class: "small muted mb-2" },
                  "Pick a session below to link this timer to your plan.",
                ),

            h(
              "div",
              {
                class: "row",
                style: {
                  justifyContent: "center",
                  gap: "9px",
                  flexWrap: "wrap",
                },
              },
              h(
                "button",
                { class: "btn btn-lg", onclick: resetTimer },
                icon("refresh", 15),
                "Reset",
              ),
              h(
                "button",
                {
                  class: "btn btn-primary btn-lg",
                  id: "focus-toggle",
                  onclick: () => (running ? pauseTimer() : startTimer()),
                },
                icon(running ? "pause" : "play", 16),
                running
                  ? "Pause"
                  : remainSec < totalSec
                    ? "Resume"
                    : "Start focus",
              ),
              h(
                "button",
                {
                  class: "btn btn-lg",
                  onclick: async () => {
                    if (!currentSession) {
                      toast(
                        "Select a session first, or just log the time manually.",
                        { kind: "info" },
                      );
                      return;
                    }
                    if (remainSec > 0 && running) {
                      toast("Finish or reset the timer before logging.", {
                        kind: "info",
                      });
                      return;
                    }
                    await completeCurrentSession();
                  },
                },
                icon("check", 15),
                "Log session",
              ),
            ),

            h(
              "div",
              {
                class: "row",
                style: {
                  justifyContent: "center",
                  gap: "8px",
                  marginTop: "22px",
                  flexWrap: "wrap",
                },
              },
              ...PRESETS.map((p, i) =>
                h(
                  "button",
                  {
                    class: `btn btn-sm preset-btn${preset === i ? " btn-primary" : ""}`,
                    onclick: () => {
                      preset = i;
                      if (i === 3) {
                        openCustom();
                        return;
                      }
                      setMode("focus");
                    },
                  },
                  `${p.focus}/${p.brk}`,
                  h(
                    "span",
                    { class: "tiny", style: { opacity: ".75" } },
                    p.label,
                  ),
                ),
              ),
            ),

            preset === 3
              ? h(
                  "div",
                  {
                    class: "row",
                    style: {
                      justifyContent: "center",
                      gap: "12px",
                      marginTop: "14px",
                    },
                  },
                  h(
                    "div",
                    { style: { width: "130px" } },
                    field({
                      label: `Focus ${customFocus}m`,
                      input: h("input", {
                        class: "input",
                        type: "number",
                        min: 5,
                        max: 180,
                        value: customFocus,
                        oninput: (e) => {
                          customFocus = Number(e.target.value) || 25;
                          setMode("focus");
                        },
                      }),
                    }),
                  ),
                  h(
                    "div",
                    { style: { width: "130px" } },
                    field({
                      label: `Break ${customBreak}m`,
                      input: h("input", {
                        class: "input",
                        type: "number",
                        min: 1,
                        max: 60,
                        value: customBreak,
                        oninput: (e) => {
                          customBreak = Number(e.target.value) || 5;
                        },
                      }),
                    }),
                  ),
                )
              : null,

            h(
              "div",
              {
                class: "mt-3",
                style: {
                  maxWidth: "440px",
                  margin: "24px auto 0",
                  textAlign: "left",
                },
              },
              field({ label: "Link to a session", input: sessionSelect }),
            ),
          ),

          // Stats rail
          h(
            "div",
            { class: "stack" },
            h(
              "div",
              { class: "grid g-2" },
              stat({
                label: "Focus time",
                value: fmtMinutes(data.stats.totalFocusMinutes),
                icon: "clock",
                color: "var(--brand)",
              }),
              stat({
                label: "Sessions done",
                value: data.stats.sessionCount,
                icon: "check",
                color: "var(--ok)",
              }),
              stat({
                label: "Best streak",
                value: data.stats.bestStreak,
                unit: "d",
                icon: "fire",
                color: "var(--warn)",
              }),
              stat({
                label: "Avg session",
                value: data.stats.avgSession,
                unit: "m",
                icon: "target",
                color: "var(--brand-2)",
              }),
            ),

            h(
              "div",
              { class: "card" },
              h(
                "div",
                { class: "card-head" },
                h("h3", {}, icon("zap", 16), " Level & XP"),
              ),
              h(
                "div",
                { class: "card-pad" },
                h(
                  "div",
                  { class: "row mb-1" },
                  h("b", {}, `Level ${data.levelProgress.level}`),
                  h("div", { class: "spacer" }),
                  h(
                    "span",
                    { class: "mono tiny muted" },
                    `${data.levelProgress.xp} XP`,
                  ),
                ),
                progressBar(data.levelProgress.percent, { size: "lg" }),
                h(
                  "p",
                  { class: "tiny muted mt-1" },
                  `${data.levelProgress.levelSpan - data.levelProgress.intoLevel} XP to level ${data.levelProgress.level + 1}`,
                ),
              ),
            ),

            data.stats.byHour.length
              ? h(
                  "div",
                  { class: "card" },
                  h(
                    "div",
                    { class: "card-head" },
                    h("h3", {}, icon("clock", 16), " When you focus best"),
                  ),
                  h(
                    "div",
                    { class: "card-pad" },
                    rankedBars(
                      [...data.stats.byHour]
                        .sort((a, b) => b.minutes - a.minutes)
                        .slice(0, 5)
                        .map((x) => ({
                          label: `${String(x.hour).padStart(2, "0")}:00`,
                          value: x.minutes,
                          color: "var(--brand)",
                          sub: `${x.sessions} session${x.sessions === 1 ? "" : "s"}`,
                        })),
                    ),
                  ),
                )
              : null,

            Object.keys(data.stats.byType || {}).length
              ? h(
                  "div",
                  { class: "card" },
                  h(
                    "div",
                    { class: "card-head" },
                    h("h3", {}, icon("layers", 16), " Time by session type"),
                  ),
                  h(
                    "div",
                    { class: "card-pad" },
                    donutChart(
                      Object.entries(data.stats.byType).map(([k, v]) => ({
                        label: k,
                        value: v,
                        display: fmtMinutes(v),
                        color:
                          {
                            Learning: "var(--brand-2)",
                            Practice: "var(--brand)",
                            Revision: "var(--warn)",
                            "Mock Test": "var(--danger)",
                          }[k] || "var(--brand)",
                      })),
                      {
                        centerLabel: "focused",
                        centerValue: fmtMinutes(data.stats.totalFocusMinutes),
                      },
                    ),
                  ),
                )
              : null,
          ),
        ),

        todaySessions.length
          ? h(
              "div",
              { class: "card" },
              h(
                "div",
                { class: "card-head" },
                h("h3", {}, icon("plan", 16), " Today’s sessions"),
                h("div", { class: "spacer" }),
                h(
                  "button",
                  {
                    class: "btn btn-sm btn-ghost",
                    onclick: () => navigate("plan"),
                  },
                  "Full plan",
                  icon("chevronR", 13),
                ),
              ),
              h(
                "div",
                { class: "card-pad stack", style: { gap: "9px" } },
                todaySessions.map((s) => {
                  const subject = subjects.find((x) => x.id === s.subjectId);
                  const active = currentSession?.id === s.id;
                  return h(
                    "div",
                    {
                      class: "row",
                      style: {
                        gap: "11px",
                        padding: "11px 13px",
                        borderRadius: "11px",
                        border: `1px solid ${active ? "var(--brand)" : "var(--border)"}`,
                        background: active
                          ? "var(--brand-soft)"
                          : "var(--surface-2)",
                        cursor:
                          s.status === "planned" || s.status === "in_progress"
                            ? "pointer"
                            : "default",
                      },
                      onclick: () => {
                        if (
                          s.status === "planned" ||
                          s.status === "in_progress"
                        ) {
                          currentSession = s;
                          setMode("focus");
                        }
                      },
                    },
                    h("span", {
                      style: {
                        width: "9px",
                        height: "9px",
                        borderRadius: "3px",
                        background: subject?.color || "var(--brand)",
                        flexShrink: 0,
                      },
                    }),
                    h(
                      "div",
                      { style: { flex: "1", minWidth: "0" } },
                      h(
                        "div",
                        { class: "row", style: { gap: "7px" } },
                        h("span", { class: "small strong" }, s.subjectName),
                        h("span", { class: "badge" }, s.type),
                        s.status === "completed"
                          ? h(
                              "span",
                              { class: "badge ok" },
                              icon("check", 10),
                              "Done",
                            )
                          : null,
                        active
                          ? h("span", { class: "badge brand" }, "focusing")
                          : null,
                      ),
                      h("div", { class: "tiny muted" }, s.topic),
                    ),
                    h(
                      "span",
                      { class: "tiny mono muted" },
                      `${s.startTime} · ${s.duration}m`,
                    ),
                  );
                }),
              ),
            )
          : null,
      ),
    );

    updateRing();
    updateControls();
  }

  function openCustom() {
    preset = 3;
    setMode("focus");
  }

  const onVisChange = () => {
    if (document.hidden) pauseTimer();
  };
  document.addEventListener("visibilitychange", onVisChange);
  draw();

  return {
    el: container,
    cleanup: () => {
      clearInterval(timerId);
      document.removeEventListener("visibilitychange", onVisChange);
    },
  };
}
