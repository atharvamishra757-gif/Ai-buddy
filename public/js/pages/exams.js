import { h, icon, fmtDate, fmtMinutes, toast } from "../ui.js";
import { get, patch } from "../api.js";
import {
  progressBar,
  difficultyBadge,
  emptyState,
  stat,
  rankedBars,
  donutChart,
  modal,
  field,
  rangeInput,
} from "../components.js";
import { navigate } from "../app.js";

const barColor = (score) =>
  score > 55 ? "var(--danger)" : score > 30 ? "var(--warn)" : "var(--ok)";

const TONE = { ok: "ok", warn: "warn", danger: "danger", muted: "" };

const verdictText = (exam) => ({
  ok: "Looking good",
  warn: "Needs more work",
  danger: "At risk",
  muted: "Just started",
}[exam.verdict.tone] || exam.verdict.label);

/* ============================ helpers ============================ */

/** "in 12 days" / "Tomorrow" / "Today" — the phrase a student actually reads. */
function countdown(e) {
  if (e.daysToExam < 0) return "Exam passed";
  if (e.daysToExam === 0) return "Today";
  if (e.daysToExam === 1) return "Tomorrow";
  return `in ${e.daysToExam} days`;
}

/** The one concrete action worth taking for this exam. */
function nextStep(e) {
  if (e.daysToExam < 0) return null;
  if (e.daysToExam === 0) {
    return { text: "Exam today — revise weak topics only.", ic: "fire" };
  }
  if (e.preparation >= 100) {
    return {
      text: "Fully prepared — keep a light revision the day before.",
      ic: "check",
    };
  }
  if (e.minutesPerDay) {
    return {
      text: `Study about ${fmtMinutes(e.minutesPerDay)} a day to be ready in time.`,
      ic: "clock",
    };
  }
  return { text: "Add study time for this subject in Settings.", ic: "target" };
}

/* ============================ countdown hero ============================ */

function nextExamCard(next, onStudy) {
  const step = nextStep(next);
  const ringPct = Math.max(0, Math.min(100, next.preparation));
  const dash = (ringPct / 100) * 326.7;

  return h(
    "div",
    { class: "card exam-hero" },
    h(
      "div",
      { class: "exam-hero-main" },
      h("div", { class: "stat-label" }, "Next exam"),
      h("h2", { class: "mt-1" }, next.name),
      h(
        "div",
        { class: "row wrap", style: { gap: "8px", marginTop: "8px" } },
        difficultyBadge(next.difficulty),
        h(
          "span",
          { class: `badge ${TONE[next.verdict.tone]}` },
          verdictText(next),
        ),
        next.urgent
          ? h("span", { class: "badge danger" }, icon("fire", 10), "Urgent")
          : null,
      ),
      h(
        "p",
        { class: "dim small", style: { marginTop: "8px" } },
        `${fmtDate(next.examDate, { weekday: "long" })} · ${countdown(next)}`,
      ),
      h(
        "p",
        { class: "tiny muted", style: { marginTop: "6px" } },
        `Priority #${next.rank} because ${next.topReason}.`,
      ),
    ),

    h(
      "div",
      { class: "exam-hero-ring" },
      h("div", {
        class: "ring",
        html: `<svg viewBox="0 0 120 120" width="120" height="120">
            <circle cx="60" cy="60" r="52" fill="none" stroke="var(--surface-3)" stroke-width="10"/>
            <circle cx="60" cy="60" r="52" fill="none" stroke="${next.color}" stroke-width="10"
                    stroke-linecap="round" stroke-dasharray="${dash} 326.7"
                    transform="rotate(-90 60 60)"/>
          </svg>`,
      }),
      h(
        "div",
        { class: "ring-label" },
        h("div", { class: "ring-value" }, `${next.preparation}%`),
        h("div", { class: "ring-cap" }, "ready"),
      ),
    ),

    h(
      "div",
      { class: "exam-hero-side" },
      h("div", { class: "stat-label" }, "What to do now"),
      step
        ? h(
            "div",
            { class: "row", style: { gap: "8px", marginTop: "6px" } },
            h(
              "span",
              { class: "stat-icon", style: { flexShrink: "0" } },
              icon(step.ic, 15),
            ),
            h("span", { class: "small strong" }, step.text),
          )
        : null,
      h(
        "div",
        { class: "tiny muted", style: { marginTop: "10px" } },
        `${next.learned} of ${next.topics} topics learned`,
      ),
      h(
        "button",
        {
          class: "btn btn-primary btn-block",
          style: { marginTop: "12px" },
          onclick: () => onStudy(next),
        },
        icon("sparkles", 15),
        "Plan my study time",
      ),
    ),
  );
}

/* ============================ per-exam card ============================ */

function examCard(e, onEdit, onStudy) {
  const step = nextStep(e);
  const passed = e.daysToExam < 0;
  const gap = Math.max(0, 100 - e.preparation);

  return h(
    "div",
    { class: "card exam-item", style: { "--c": e.color } },
    h(
      "div",
      { class: "exam-item-head" },
      h(
        "div",
        { style: { minWidth: "0", flex: "1" } },
        h(
          "div",
          { class: "row", style: { gap: "8px", flexWrap: "wrap" } },
          h("span", { class: "dot" }),
          h("span", { class: "strong", style: { fontSize: "15px" } }, e.name),
          h(
            "span",
            { class: `badge ${TONE[e.verdict.tone]}` },
            verdictText(e),
          ),
          e.urgent
            ? h("span", { class: "badge danger" }, icon("fire", 10), "Urgent")
            : null,
        ),
        h(
          "div",
          { class: "tiny muted", style: { marginTop: "3px" } },
          `${fmtDate(e.examDate, { weekday: "short" })} · ${countdown(e)} · ${e.difficulty}`,
        ),
      ),
      h(
        "div",
        { style: { textAlign: "right", flexShrink: "0" } },
        h(
          "div",
          {
            class: "countdown-num",
            style: {
              color:
                e.daysToExam <= 3 && !passed ? "var(--danger)" : "var(--text)",
            },
          },
          passed ? "—" : String(e.daysToExam),
        ),
        h("div", { class: "tiny muted" }, passed ? "done" : "days left"),
      ),
    ),

    h(
      "div",
      { class: "exam-item-progress" },
      h(
        "div",
        { class: "row", style: { marginBottom: "5px", gap: "8px" } },
        h("span", { class: "tiny muted" }, "Preparation"),
        h("div", { class: "spacer" }),
        gap > 0
          ? h("span", { class: "tiny muted" }, `${gap}% to go`)
          : h(
              "span",
              { class: "tiny", style: { color: "var(--ok)" } },
              "complete",
            ),
        h("span", { class: "tiny mono strong" }, `${e.preparation}%`),
      ),
      progressBar(e.preparation, { color: e.color, size: "lg" }),
    ),

    step
      ? h(
          "div",
          { class: "exam-item-advice" },
          h(
            "span",
            {
              class: "stat-icon",
              style: { flexShrink: "0", width: "26px", height: "26px" },
            },
            icon(step.ic, 13),
          ),
          h("span", { class: "small" }, step.text),
        )
      : null,

    h(
      "div",
      { class: "exam-item-actions" },
      h(
        "button",
        { class: "btn btn-sm btn-primary", onclick: () => onStudy(e) },
        icon("plan", 13),
        "Study plan",
      ),
      h(
        "button",
        { class: "btn btn-sm", onclick: () => onEdit(e) },
        icon("edit", 13),
        "Update date",
      ),
      h("div", { class: "spacer" }),
      h(
        "span",
        { class: "tiny muted" },
        `Priority ${e.priorityScore} · because ${e.topReason}`,
      ),
    ),
  );
}

/* ============================ edit modal ============================ */

function openExamEditor(exam, onSaved) {
  const dateInput = h("input", {
    class: "input",
    type: "date",
    value: exam.examDate || "",
  });
  const prepLabel = h(
    "span",
    { class: "hint" },
    `Currently ${exam.preparation}% prepared`,
  );
  const prepInput = rangeInput({
    value: exam.preparation,
    min: 0,
    max: 100,
    step: 5,
    onInput: (v) => {
      prepLabel.textContent = `Currently ${v}% prepared`;
    },
  });

  const m = modal({
    title: `Update ${exam.name}`,
    body: h(
      "div",
      { class: "stack" },
      h(
        "p",
        { class: "small dim" },
        "Change the date or how prepared you feel. Your countdown and the study time this subject gets both update immediately.",
      ),
      field({ label: "Exam date", input: dateInput }),
      field({ label: "Preparation level", input: prepInput }),
      prepLabel,
      h(
        "div",
        { class: "ai-note", style: { margin: "0" } },
        h("div", { class: "ai-avatar" }, "S"),
        h(
          "div",
          { class: "small" },
          "Keep this honest — the planner uses it to decide how many minutes a day you should spend on this subject.",
        ),
      ),
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
              await patch(`/subjects/${exam.id}`, {
                examDate: dateInput.value || null,
                preparation: Number(prepInput.value),
              });
              m.close();
              toast(`${exam.name} updated — your plan has been recalculated.`, {
                kind: "ok",
                title: "Saved",
              });
              onSaved();
            } catch (err) {
              toast(Object.values(err.fields || {})[0] || err.message, {
                kind: "err",
              });
              e.currentTarget.disabled = false;
            }
          },
        },
        icon("check", 15),
        "Save",
      ),
    ],
  });
}

/* ============================ supporting cards ============================ */

function readinessCard(exams, avgPrep) {
  return h(
    "div",
    { class: "card" },
    h(
      "div",
      { class: "card-head" },
      h("h3", {}, icon("layers", 16), " Readiness by subject"),
      h("span", { class: "sub" }, "higher = more prepared"),
    ),
    h(
      "div",
      { class: "card-pad" },
      donutChart(
        exams.map((e) => ({
          label: e.name,
          value: Math.max(1, e.preparation),
          color: e.color,
          display: `${e.preparation}%`,
        })),
        { centerLabel: "avg ready", centerValue: `${avgPrep}%` },
      ),
    ),
  );
}

function priorityCard(exams) {
  const sorted = [...exams].sort((a, b) => b.priorityScore - a.priorityScore);
  const bars = rankedBars(
    sorted.map((e) => ({
      label: e.name,
      value: e.priorityScore,
      color: barColor(e.priorityScore),
      badge: h("span", { class: "badge" }, `${e.preparation}%`),
      sub: `${e.daysToExam >= 0 ? `${e.daysToExam} days to exam` : "exam passed"} · ${e.difficulty}`,
    })),
    { format: (v) => `${v}` },
  );

  return h(
    "div",
    { class: "card" },
    h(
      "div",
      { class: "card-head" },
      h("h3", {}, icon("target", 16), " Study priority"),
    ),
    h(
      "div",
      { class: "card-pad" },
      h(
        "p",
        { class: "tiny muted mb-2" },
        "Follow this order for your day. The taller the bar, the more of your limited study time that subject deserves.",
      ),
      bars,
    ),
  );
}

/* ============================ page ============================ */

export async function examsPage({ user, refresh }) {
  const { exams } = await get("/exams");
  const { subjects } = await get("/subjects");
  const container = h("div", { class: "stack" });

  const upcoming = exams.filter((e) => e.daysToExam >= 0);
  const next = upcoming[0];
  const passed = exams.filter((e) => e.daysToExam < 0);
  const avgPrep = exams.length
    ? Math.round(exams.reduce((a, e) => a + e.preparation, 0) / exams.length)
    : 0;
  const urgent = upcoming.filter((e) => e.urgent);
  const onTrack = upcoming.filter((e) => e.verdict.tone === "ok");
  const atRisk = upcoming.filter(
    (e) => e.verdict.tone === "danger" || e.verdict.tone === "warn",
  );

  // Rank matches the order students see in the priority card.
  const byPriority = [...exams].sort(
    (a, b) => b.priorityScore - a.priorityScore,
  );
  for (const e of exams)
    e.rank = byPriority.findIndex((x) => x.id === e.id) + 1;

  async function reload() {
    const fresh = await get("/exams");
    const rebuilt = await examsPage({ user, refresh });
    container.innerHTML = "";
    container.append(...rebuilt.el.children);
    return fresh;
  }

  function onStudy(e) {
    location.hash = "#/plan";
    toast(
      e
        ? `${e.name} is priority #${e.rank} — your sessions for it are in My Plan.`
        : "Opening your plan…",
      { kind: "info", title: "Study plan" },
    );
  }

  function onEdit(e) {
    openExamEditor(e, () => reload());
  }

  /* ---- header ---- */
  const head = h(
    "div",
    { class: "page-head" },
    h(
      "div",
      { class: "grow" },
      h("h2", {}, "Exam countdown"),
      h(
        "p",
        {},
        "Every subject with an exam date is ranked by how much it needs you. Follow the order and your plan stays balanced.",
      ),
    ),
  );

  if (!exams.length) {
    const withoutDate = subjects.filter((s) => !s.examDate);
    container.append(
      head,
      emptyState({
        ic: "exam",
        title: "No exam dates set",
        message:
          "Add an exam date to a subject and it will appear here with a countdown, a readiness score and advice on how much daily study time it needs.",
        action: h(
          "div",
          { class: "stack", style: { gap: "10px", alignItems: "center" } },
          h(
            "button",
            { class: "btn btn-primary", onclick: () => navigate("subjects") },
            icon("plus", 15),
            "Add exam dates",
          ),
          withoutDate.length
            ? h(
                "span",
                { class: "small muted" },
                `${withoutDate.length} subject${withoutDate.length === 1 ? "" : "s"} still without a date`,
              )
            : null,
        ),
      }),
    );
    return { el: container };
  }

  /* ---- stat tiles ---- */
  const tiles = h(
    "div",
    { class: "grid g-4" },
    stat({
      label: "Upcoming exams",
      value: upcoming.length,
      icon: "exam",
      color: "var(--brand)",
      foot: passed.length ? `${passed.length} already passed` : null,
    }),
    stat({
      label: "Next exam in",
      value: next ? next.daysToExam : "—",
      unit: next ? (next.daysToExam === 1 ? "day" : "days") : "",
      icon: "clock",
      color: "var(--warn)",
      foot: next ? next.name : null,
    }),
    stat({
      label: "On track",
      value: onTrack.length,
      icon: "check",
      color: "var(--ok)",
      foot: "65% prepared or more",
    }),
    stat({
      label: "Need attention",
      value: atRisk.length,
      icon: "fire",
      color: atRisk.length ? "var(--danger)" : "var(--ok)",
      foot: "under 65% prepared",
    }),
  );

  /* ---- urgent banner ---- */
  const urgentBanner = urgent.length
    ? h(
        "div",
        { class: "insight sev-critical" },
        h("div", { class: "insight-icon" }, icon("fire", 16)),
        h(
          "div",
          { style: { flex: "1", minWidth: "0" } },
          h(
            "h4",
            {},
            `${urgent.length} exam${urgent.length === 1 ? "" : "s"} need urgent attention`,
          ),
          h(
            "p",
            {},
            urgent
              .map(
                (e) =>
                  `${e.name} in ${e.daysToExam} day${e.daysToExam === 1 ? "" : "s"} at ${e.preparation}%`,
              )
              .join(" · ") +
              ". These already sit at the top of your priority list.",
          ),
        ),
        h(
          "button",
          { class: "btn btn-primary btn-sm", onclick: () => navigate("plan") },
          "Open plan",
        ),
      )
    : null;

  /* ---- filter + list ---- */
  let filter = "all";
  const listHost = h("div", { class: "stack", style: { gap: "12px" } });

  function drawList() {
    listHost.innerHTML = "";
    const shown =
      filter === "all"
        ? exams
        : filter === "upcoming"
          ? upcoming
          : filter === "attention"
            ? atRisk
            : passed;
    if (!shown.length) {
      listHost.append(
        emptyState({
          ic: "check",
          title: "Nothing here",
          message:
            filter === "attention"
              ? "Every exam is on track — nothing needs urgent work right now."
              : "No exams in this group.",
        }),
      );
      return;
    }
    for (const e of shown) listHost.append(examCard(e, onEdit, onStudy));
  }

  const filterSeg = h(
    "div",
    { class: "seg" },
    ...[
      ["all", "All"],
      ["upcoming", "Upcoming"],
      ["attention", "Needs attention"],
      ["passed", "Passed"],
    ].map(([v, l]) =>
      h(
        "button",
        {
          class: filter === v ? "active" : "",
          onclick: (ev) => {
            filter = v;
            for (const b of ev.currentTarget.parentElement.children)
              b.classList.remove("active");
            ev.currentTarget.classList.add("active");
            drawList();
          },
        },
        l,
        v === "attention" && atRisk.length ? ` (${atRisk.length})` : "",
      ),
    ),
  );

  drawList();

  const right = h(
    "div",
    { class: "stack" },
    readinessCard(exams, avgPrep),
    priorityCard(exams),
  );

  container.append(
    head,
    next ? nextExamCard(next, onStudy) : null,
    tiles,
    urgentBanner,
    filterSeg,
    h(
      "div",
      { class: "grid g-main" },
      h(
        "div",
        { class: "stack" },
        h(
          "div",
          { class: "row" },
          h("h3", { style: { flex: "1" } }, "Your exams"),
          h("span", { class: "tiny muted" }, "nearest first"),
        ),
        listHost,
      ),
      right,
    ),
  );

  return { el: container };
}
