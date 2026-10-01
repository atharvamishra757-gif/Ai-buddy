import { h, icon, toast, fmtMinutes } from "../ui.js";
import { get, post, patch, del, auth } from "../api.js";
import {
  field,
  textInput,
  selectInput,
  rangeInput,
  progressBar,
  confirmDialog,
  stat,
  emptyState,
} from "../components.js";
import { navigate, refreshNotifications } from "../app.js";
import { applyTheme } from "../shell.js";

const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const TIMES = ["Morning", "Afternoon", "Evening", "Night"];

export async function settingsPage({ user, refresh }) {
  let data = await get("/settings");
  const container = h("div", { class: "stack" });

  function draw() {
    container.innerHTML = "";
    const s = data.settings;

    /* ---------- availability ---------- */
    const availLabel = h(
      "span",
      { class: "hint" },
      `${s.availableHours} hours per day`,
    );
    const goalLabel = h(
      "span",
      { class: "hint" },
      `${s.dailyStudyGoalHours} hours per day`,
    );
    const gpaLabel = h(
      "span",
      { class: "hint" },
      `Target ${s.targetGpa}${s.targetGpa <= 10 ? " CGPA" : "%"}`,
    );

    const holidayChips = h(
      "div",
      { class: "chips" },
      DAYS.map((d, i) =>
        h(
          "button",
          {
            class: "chip" + (s.holidays.includes(i) ? " active" : ""),
            onclick: async (e) => {
              const next = s.holidays.includes(i)
                ? s.holidays.filter((x) => x !== i)
                : [...s.holidays, i];
              s.holidays = next;
              e.currentTarget.classList.toggle("active");
              await saveSettings({ holidays: next });
            },
          },
          d,
        ),
      ),
    );

    const focusInput = h("input", {
      class: "input",
      type: "number",
      min: 5,
      max: 120,
      value: s.pomodoro.focus,
    });
    const breakInput = h("input", {
      class: "input",
      type: "number",
      min: 1,
      max: 60,
      value: s.pomodoro.shortBreak,
    });
    const longInput = h("input", {
      class: "input",
      type: "number",
      min: 1,
      max: 60,
      value: s.pomodoro.longBreak,
    });

    /* ---------- notifications ---------- */
    const notifRows = [
      [
        "sessions",
        "Study session reminders",
        "Alert me before each planned session",
      ],
      ["exams", "Exam reminders", "Notify when an exam is within 7 days"],
      ["deadlines", "Assignment deadlines", "Notify 3 days before a due date"],
      [
        "missed",
        "Missed sessions",
        "Tell me when I fall behind so I can reschedule",
      ],
      ["revision", "Revision due", "Spaced-repetition reviews coming up"],
    ];

    const themeSeg = h(
      "div",
      { class: "seg", style: { maxWidth: "260px" } },
      ...["dark", "light"].map((t) =>
        h(
          "button",
          {
            class:
              document.documentElement.getAttribute("data-theme") === t
                ? "active"
                : "",
            onclick: (e) => {
              applyTheme(t);
              localStorage.setItem("studyai.theme", t);
              for (const b of e.currentTarget.parentElement.children)
                b.classList.remove("active");
              e.currentTarget.classList.add("active");
              patch("/settings", { preferences: { theme: t } }).catch(() => {});
            },
          },
          icon(t === "dark" ? "moon" : "sun", 14),
          t === "dark" ? "Dark" : "Light",
        ),
      ),
    );

    container.append(
      h(
        "div",
        { class: "page-head" },
        h(
          "div",
          { class: "grow" },
          h("h2", {}, "Settings"),
          h(
            "p",
            {},
            "Availability and preferences directly shape how the AI schedules your time.",
          ),
        ),

        h(
          "div",
          { class: "grid g-side" },
          h(
            "div",
            { class: "stack" },
            /* profile */
            h(
              "div",
              { class: "card" },
              h(
                "div",
                { class: "card-head" },
                h("h3", {}, icon("users", 16), " Profile"),
              ),
              h(
                "div",
                { class: "card-pad grid g-3" },
                field({
                  label: "Name",
                  input: textInput({
                    name: "name",
                    value: data.account.name,
                    onInput: (v) => {
                      data.account.name = v;
                    },
                  }),
                }),
                field({
                  label: "Course / degree",
                  input: textInput({
                    name: "course",
                    value: data.account.course,
                    onInput: (v) => {
                      data.account.course = v;
                    },
                  }),
                }),
                field({
                  label: "Semester",
                  input: selectInput({
                    value: data.account.semester,
                    options: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({
                      value: n,
                      label: `Semester ${n}`,
                    })),
                    onChange: (v) => {
                      data.account.semester = Number(v);
                    },
                  }),
                }),
                h(
                  "div",
                  { style: { gridColumn: "1 / -1" } },
                  h(
                    "button",
                    {
                      class: "btn btn-primary",
                      onclick: async (e) => {
                        e.currentTarget.disabled = true;
                        await saveSettings({
                          name: data.account.name,
                          course: data.account.course,
                          semester: data.account.semester,
                        });
                        e.currentTarget.disabled = false;
                      },
                    },
                    icon("check", 15),
                    "Save profile",
                  ),
                ),
              ),
            ),

            /* availability */
            h(
              "div",
              { class: "card" },
              h(
                "div",
                { class: "card-head" },
                h("h3", {}, icon("clock", 16), " Study availability"),
                h(
                  "span",
                  { class: "sub" },
                  "the planner never schedules outside this window",
                ),
              ),
              h(
                "div",
                { class: "card-pad stack", style: { gap: "18px" } },
                h(
                  "div",
                  {},
                  h(
                    "label",
                    { class: "small strong" },
                    "Daily available study hours",
                  ),
                  h(
                    "div",
                    { class: "mt-1" },
                    rangeInput({
                      value: s.availableHours,
                      min: 1,
                      max: 12,
                      step: 1,
                      onInput: (v) => {
                        s.availableHours = Number(v);
                        availLabel.textContent = `${v} hours per day`;
                      },
                    }),
                  ),
                  availLabel,
                ),
                h(
                  "div",
                  { class: "field" },
                  h("label", {}, "Preferred study time"),
                  selectInput({
                    value: s.preferredTime,
                    options: TIMES.map((t) => ({ value: t, label: t })),
                    onChange: (v) => {
                      s.preferredTime = v;
                    },
                  }),
                  h(
                    "span",
                    { class: "hint" },
                    ({
                      Morning:
                        "Sessions placed between 06:00 and your daily hours.",
                      Afternoon:
                        "Sessions placed between 13:00 and your daily hours.",
                      Evening:
                        "Sessions placed between 17:00 and your daily hours.",
                      Night:
                        "Sessions placed between 21:00 and your daily hours.",
                    })[s.preferredTime] || "",
                  ),
                ),
                h(
                  "div",
                  { class: "field" },
                  h("label", {}, "Weekly holidays / free days"),
                  holidayChips,
                  h(
                    "span",
                    { class: "hint" },
                    "Free days get a light revision block so you don’t lose momentum.",
                  ),
                ),
                h(
                  "button",
                  {
                    class: "btn btn-primary",
                    onclick: async (e) => {
                      e.currentTarget.disabled = true;
                      const res = await saveSettings({
                        availableHours: s.availableHours,
                        preferredTime: s.preferredTime,
                        holidays: s.holidays,
                      });
                      if (res?.regenRecommended) {
                        const ok = await confirmDialog({
                          title: "Regenerate your plan?",
                          message:
                            "Your availability changed. Regenerating will reschedule all future sessions into the new window.",
                          confirmText: "Regenerate plan",
                          danger: false,
                        });
                        if (ok) {
                          await post("/plan/generate", {
                            horizonDays: 14,
                            replace: true,
                          });
                          toast("Plan rebuilt in your new window.", {
                            kind: "ok",
                            title: "Done",
                          });
                          refresh();
                        }
                      }
                      e.currentTarget.disabled = false;
                    },
                  },
                  icon("check", 15),
                  "Save availability",
                ),
              ),
            ),

            /* goals */
            h(
              "div",
              { class: "card" },
              h(
                "div",
                { class: "card-head" },
                h("h3", {}, icon("target", 16), " Goals"),
              ),
              h(
                "div",
                { class: "card-pad stack", style: { gap: "18px" } },
                h(
                  "div",
                  {},
                  h("label", { class: "small strong" }, "Daily study goal"),
                  rangeInput({
                    value: s.dailyStudyGoalHours,
                    min: 1,
                    max: 12,
                    step: 1,
                    onInput: (v) => {
                      s.dailyStudyGoalHours = Number(v);
                      goalLabel.textContent = `${v} hours per day`;
                    },
                  }),
                  goalLabel,
                ),
                h(
                  "div",
                  {},
                  h(
                    "label",
                    { class: "small strong" },
                    "Target GPA / percentage",
                  ),
                  rangeInput({
                    value: s.targetGpa,
                    min: 5,
                    max: 10,
                    step: 0.5,
                    onInput: (v) => {
                      s.targetGpa = Number(v);
                      gpaLabel.textContent = `Target ${v}`;
                    },
                  }),
                  gpaLabel,
                ),
                h(
                  "button",
                  {
                    class: "btn btn-primary",
                    onclick: async (e) => {
                      e.currentTarget.disabled = true;
                      await saveSettings({
                        dailyGoalHours: s.dailyStudyGoalHours,
                        targetGpa: s.targetGpa,
                      });
                      e.currentTarget.disabled = false;
                    },
                  },
                  icon("check", 15),
                  "Save goals",
                ),
              ),
            ),

            /* pomodoro */
            h(
              "div",
              { class: "card" },
              h(
                "div",
                { class: "card-head" },
                h("h3", {}, icon("focus", 16), " Pomodoro timer"),
              ),
              h(
                "div",
                { class: "card-pad" },
                h(
                  "div",
                  { class: "grid g-3" },
                  field({ label: "Focus (min)", input: focusInput }),
                  field({ label: "Short break (min)", input: breakInput }),
                  field({ label: "Long break (min)", input: longInput }),
                ),
                h(
                  "div",
                  { class: "mt-2" },
                  h(
                    "button",
                    {
                      class: "btn btn-primary",
                      onclick: async (e) => {
                        e.currentTarget.disabled = true;
                        await saveSettings({
                          pomodoro: {
                            focus: Number(focusInput.value) || 25,
                            shortBreak: Number(breakInput.value) || 5,
                            longBreak: Number(longInput.value) || 10,
                          },
                        });
                        e.currentTarget.disabled = false;
                      },
                    },
                    icon("check", 15),
                    "Save timer settings",
                  ),
                ),
              ),
            ),

            /* notifications */
            h(
              "div",
              { class: "card" },
              h(
                "div",
                { class: "card-head" },
                h("h3", {}, icon("bell", 16), " Notifications"),
                h("div", { class: "spacer" }),
                h(
                  "button",
                  {
                    class: "btn btn-sm btn-ghost",
                    onclick: () => refreshNotifications(true),
                  },
                  "View inbox",
                ),
              ),
              h(
                "div",
                { class: "card-pad stack", style: { gap: "12px" } },
                notifRows.map(([key, label, desc]) =>
                  h(
                    "label",
                    {
                      class: "row",
                      style: {
                        gap: "11px",
                        cursor: "pointer",
                        alignItems: "flex-start",
                      },
                    },
                    h("input", {
                      type: "checkbox",
                      checked: s.notifications[key] !== false,
                      style: { marginTop: "2px" },
                      onchange: async (e) => {
                        s.notifications[key] = e.target.checked;
                        await saveSettings({ notifications: s.notifications });
                      },
                    }),
                    h(
                      "div",
                      {},
                      h("div", { class: "small strong" }, label),
                      h("div", { class: "tiny muted" }, desc),
                    ),
                  ),
                ),
              ),
            ),

            /* danger zone */
            h(
              "div",
              {
                class: "card",
                style: {
                  borderColor:
                    "color-mix(in srgb, var(--danger) 25%, transparent)",
                },
              },
              h(
                "div",
                { class: "card-head" },
                h(
                  "h3",
                  { style: { color: "var(--danger)" } },
                  "Data & account",
                ),
              ),
              h(
                "div",
                { class: "card-pad stack", style: { gap: "10px" } },
                h(
                  "div",
                  { class: "row wrap", style: { gap: "10px" } },
                  h(
                    "button",
                    {
                      class: "btn",
                      onclick: async () => {
                        const ok = await confirmDialog({
                          title: "Change password?",
                          message: "You will need your current password.",
                          confirmText: "Continue",
                          danger: false,
                        });
                        if (!ok) return;
                        openPasswordModal();
                      },
                    },
                    icon("settings", 15),
                    "Change password",
                  ),
                  h(
                    "button",
                    {
                      class: "btn",
                      onclick: async () => {
                        const ok = await confirmDialog({
                          title: "Reset planner data?",
                          message:
                            "This deletes all subjects, tasks and study sessions so you can run onboarding again. Your account stays.",
                          confirmText: "Reset data",
                        });
                        if (!ok) return;
                        await post("/data/reset");
                        toast("Planner data cleared.", { kind: "ok" });
                        setTimeout(() => location.reload(), 700);
                      },
                    },
                    icon("refresh", 15),
                    "Reset planner data",
                  ),
                  h("div", { class: "spacer" }),
                  h(
                    "button",
                    {
                      class: "btn btn-danger",
                      onclick: async () => {
                        const ok = await confirmDialog({
                          title: "Delete account?",
                          message:
                            "Your account and all study data will be permanently deleted from this device.",
                          confirmText: "Delete everything",
                        });
                        if (!ok) return;
                        await del("/account");
                        auth.token = null;
                        location.reload();
                      },
                    },
                    icon("trash", 15),
                    "Delete account",
                  ),
                ),
                h(
                  "p",
                  { class: "tiny muted" },
                  "All data is stored locally in a JSON database on this machine. Nothing is sent anywhere unless an AI API key is configured.",
                ),
              ),
            ),
          ),
        ),

        /* right rail */
        h(
          "div",
          { class: "stack" },
          h(
            "div",
            { class: "card" },
            h(
              "div",
              { class: "card-head" },
              h("h3", {}, icon("sun", 16), " Appearance"),
            ),
            h("div", { class: "card-pad" }, themeSeg),
          ),

          h(
            "div",
            { class: "card" },
            h(
              "div",
              { class: "card-head" },
              h("h3", {}, icon("zap", 16), " Progress"),
            ),
            h(
              "div",
              { class: "card-pad" },
              h(
                "div",
                { class: "row mb-1" },
                h("b", {}, `Level ${data.gamification.level}`),
                h("div", { class: "spacer" }),
                h(
                  "span",
                  { class: "mono tiny muted" },
                  `${data.gamification.xp} XP`,
                ),
              ),
              progressBar(
                Math.min(
                  100,
                  Math.round(
                    (data.gamification.xp /
                      (data.gamification.level ** 2 * 100)) *
                      100,
                  ),
                ),
                { size: "lg" },
              ),
              h(
                "p",
                { class: "tiny muted mt-1" },
                "Earn 5 XP per 5 focused minutes.",
              ),
            ),
          ),

          h(
            "div",
            { class: "card" },
            h(
              "div",
              { class: "card-head" },
              h("h3", {}, icon("flag", 16), " Achievements"),
              h(
                "span",
                { class: "sub" },
                `${(data.gamification.badges || []).length}/${Object.keys(data.badges).length}`,
              ),
            ),
            h(
              "div",
              { class: "card-pad" },
              h(
                "div",
                { class: "grid g-3", style: { gap: "8px" } },
                Object.entries(data.badges).map(([key, b]) => {
                  const earned = (data.gamification.badges || []).includes(key);
                  return h(
                    "div",
                    {
                      title: b.desc,
                      style: {
                        textAlign: "center",
                        padding: "10px 6px",
                        borderRadius: "10px",
                        background: earned
                          ? "var(--brand-soft)"
                          : "var(--surface-2)",
                        border: `1px solid ${earned ? "var(--brand)" : "var(--border)"}`,
                        opacity: earned ? "1" : "0.45",
                      },
                    },
                    h("div", { style: { fontSize: "20px" } }, b.icon),
                    h(
                      "div",
                      { class: "tiny strong", style: { marginTop: "3px" } },
                      b.name,
                    ),
                  );
                }),
              ),
            ),
          ),

          h(
            "div",
            { class: "card" },
            h(
              "div",
              { class: "card-head" },
              h("h3", {}, icon("ai", 16), " AI engine"),
            ),
            h(
              "div",
              { class: "card-pad" },
              h(
                "div",
                { class: "row", style: { gap: "8px", marginBottom: "8px" } },
                h(
                  "span",
                  { class: `badge ${data.ai.mode === "live" ? "ok" : ""}` },
                  h("span", { class: "badge-dot" }),
                  data.ai.mode === "live" ? "Live model" : "Local engine",
                ),
                h("span", { class: "tiny mono muted" }, data.ai.model),
              ),
              h("p", { class: "small dim" }, data.ai.note),
              h(
                "p",
                { class: "tiny muted mt-1" },
                "Set AI_API_KEY (and optionally AI_API_URL / AI_MODEL) in the server environment to upgrade the language layer. The scheduling logic always runs locally so your data never leaves the machine.",
              ),
            ),
          ),

          h(
            "div",
            { class: "card" },
            h(
              "div",
              { class: "card-head" },
              h("h3", {}, icon("users", 16), " Account"),
            ),
            h(
              "div",
              { class: "card-pad" },
              h(
                "div",
                { class: "row", style: { gap: "10px" } },
                h(
                  "div",
                  {
                    class: "stat-icon",
                    style: { fontSize: "12px", fontWeight: "700" },
                  },
                  (data.account.name || "U")[0],
                ),
                h(
                  "div",
                  { style: { minWidth: "0" } },
                  h("div", { class: "small strong trunc" }, data.account.name),
                  h("div", { class: "tiny muted trunc" }, data.account.email),
                ),
              ),
              h(
                "p",
                { class: "tiny muted mt-2" },
                `${data.account.course} · Semester ${data.account.semester}`,
              ),
            ),
          ),
        ),
      ),
    );
  }

  async function saveSettings(payload) {
    try {
      const res = await patch("/settings", payload);
      data.settings = res.settings;
      toast(res.message || "Settings saved.", { kind: "ok" });
      return res;
    } catch (err) {
      toast(Object.values(err.fields || {})[0] || err.message, { kind: "err" });
      return null;
    }
  }

  function openPasswordModal() {
    const { modal } = window.__components || {};
    import("../components.js").then(({ modal, field, textInput }) => {
      const current = textInput({ name: "current", type: "password" });
      const next = textInput({ name: "new", type: "password" });
      const m = modal({
        title: "Change password",
        body: h(
          "div",
          { class: "stack" },
          field({ label: "Current password", input: current }),
          field({
            label: "New password",
            input: next,
            hint: "At least 6 characters.",
          }),
        ),
        footer: [
          h("button", { class: "btn", onclick: () => m.close() }, "Cancel"),
          h(
            "button",
            {
              class: "btn btn-primary",
              onclick: async (e) => {
                e.currentTarget.disabled = true;
                try {
                  const res = await post("/settings/password", {
                    current: current.value,
                    new: next.value,
                  });
                  m.close();
                  toast(res.message, { kind: "ok" });
                } catch (err) {
                  toast(Object.values(err.fields || {})[0] || err.message, {
                    kind: "err",
                  });
                  e.currentTarget.disabled = false;
                }
              },
            },
            "Update password",
          ),
        ],
      });
    });
  }

  draw();
  return { el: container };
}
