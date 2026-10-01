import {
  h,
  icon,
  esc,
  fmtMinutes,
  fmtDate,
  relDay,
  DIFFICULTY,
  TYPE_COLOR,
  pct,
} from "./ui.js";

/* ================= Progress ================= */

export function progressBar(
  value,
  { color, size = "", striped = false, label } = {},
) {
  const v = Math.max(0, Math.min(100, value || 0));
  return h(
    "div",
    {
      class:
        "bar" + (size ? " bar-" + size : "") + (striped ? " bar-striped" : ""),
      title: label || `${Math.round(v)}%`,
    },
    h("div", {
      class: "bar-fill",
      style: { width: `${v}%`, "--c": color || "var(--brand)" },
    }),
  );
}

/** Segmented text progress bar, e.g. ████████░░ 80% */
export function asciiBar(value, blocks = 10) {
  const v = Math.max(0, Math.min(100, value || 0));
  const filled = Math.round((v / 100) * blocks);
  return "█".repeat(filled) + "░".repeat(blocks - filled);
}

export function subjectProgressText(sub) {
  return h(
    "div",
    { class: "row", style: { gap: "10px" } },
    h(
      "span",
      {
        class: "mono",
        style: { color: sub.color || "var(--brand)", letterSpacing: "-1px" },
      },
      asciiBar(sub.preparation),
    ),
    h(
      "span",
      { class: "small strong", style: { minWidth: "38px" } },
      `${Math.round(sub.preparation || 0)}%`,
    ),
  );
}

/* ================= Stat tile ================= */

export function stat({
  label,
  value,
  unit,
  foot,
  icon: ic,
  color = "var(--brand)",
  onClick,
}) {
  return h(
    "div",
    {
      class: "stat",
      style: { "--accent": color, cursor: onClick ? "pointer" : "default" },
      onclick: onClick,
    },
    h(
      "div",
      { class: "stat-top" },
      ic ? h("div", { class: "stat-icon" }, icon(ic, 16)) : null,
      h("span", { class: "stat-label" }, label),
    ),
    h(
      "div",
      { class: "stat-value" },
      String(value),
      unit ? h("small", {}, " " + unit) : null,
    ),
    foot ? h("div", { class: "stat-foot" }, foot) : null,
  );
}

/* ================= Modal ================= */

let openModals = 0;

export function modal({
  title,
  body,
  footer,
  wide = false,
  onClose,
  closable = true,
}) {
  const root = document.getElementById("modal-root");
  const overlay = h("div", { class: "overlay" });
  const close = () => {
    overlay.remove();
    openModals = Math.max(0, openModals - 1);
    document.removeEventListener("keydown", onKey);
    onClose?.();
  };
  const onKey = (e) => {
    if (e.key === "Escape" && closable) close();
  };

  const card = h(
    "div",
    {
      class: "modal" + (wide ? " modal-lg" : ""),
      role: "dialog",
      "aria-modal": "true",
    },
    h(
      "div",
      { class: "modal-head" },
      h("h2", {}, title),
      closable
        ? h(
            "button",
            {
              class: "btn btn-ghost btn-icon",
              "aria-label": "Close",
              onclick: close,
            },
            icon("x", 17),
          )
        : null,
    ),
    h("div", { class: "modal-body" }, body),
    footer ? h("div", { class: "modal-foot" }, footer) : null,
  );

  overlay.append(card);
  overlay.addEventListener("mousedown", (e) => {
    if (e.target === overlay && closable) close();
  });
  document.addEventListener("keydown", onKey);
  root.append(overlay);
  openModals++;
  setTimeout(
    () => card.querySelector("input,select,textarea,button")?.focus(),
    60,
  );
  return { close, card, overlay };
}

export function confirmDialog({
  title = "Are you sure?",
  message,
  confirmText = "Confirm",
  danger = true,
}) {
  return new Promise((resolve) => {
    let done = false;
    const m = modal({
      title,
      body: h(
        "p",
        { class: "dim", style: { fontSize: "13.5px", lineHeight: "1.6" } },
        message,
      ),
      footer: [
        h(
          "button",
          {
            class: "btn",
            onclick: () => {
              done = true;
              m.close();
              resolve(false);
            },
          },
          "Cancel",
        ),
        h(
          "button",
          {
            class: "btn " + (danger ? "btn-danger" : "btn-primary"),
            onclick: () => {
              done = true;
              m.close();
              resolve(true);
            },
          },
          confirmText,
        ),
      ],
      onClose: () => {
        if (!done) resolve(false);
      },
    });
  });
}

/* ================= Form field with validation ================= */

export function field({ label, input, hint, error, id }) {
  return h(
    "div",
    { class: "field" },
    label ? h("label", { for: id }, label) : null,
    input,
    error ? h("span", { class: "err" }, icon("x", 12), error) : null,
    hint && !error ? h("span", { class: "hint" }, hint) : null,
  );
}

export function textInput({
  name,
  value = "",
  placeholder,
  type = "text",
  min,
  max,
  step,
  id,
  onInput,
  autocomplete,
}) {
  return h("input", {
    class: "input",
    type,
    name,
    id,
    value,
    placeholder,
    min,
    max,
    step,
    autocomplete,
    oninput: (e) => onInput?.(e.target.value, e),
  });
}

export function selectInput({ name, value, options, onChange, id }) {
  return h(
    "select",
    { class: "select", name, id, onchange: (e) => onChange?.(e.target.value) },
    options.map((o) =>
      h(
        "option",
        { value: o.value, selected: String(o.value) === String(value) },
        o.label,
      ),
    ),
  );
}

export function rangeInput({
  name,
  value,
  min = 0,
  max = 100,
  step = 5,
  onInput,
  id,
}) {
  return h("input", {
    class: "range",
    type: "range",
    name,
    id,
    min,
    max,
    step,
    value,
    oninput: (e) => onInput?.(e.target.value),
  });
}

export function chipsInput({
  values,
  active,
  options,
  onToggle,
  multi = false,
}) {
  return h(
    "div",
    { class: "chips" },
    options.map((o) =>
      h(
        "button",
        {
          class: "chip" + (active.includes(o.value) ? " active" : ""),
          type: "button",
          onclick: () => onToggle(o.value),
        },
        o.label,
      ),
    ),
  );
}

export function errorSummary(errors) {
  const keys = Object.keys(errors || {});
  if (!keys.length) return null;
  return h(
    "div",
    { class: "insight sev-critical" },
    h("div", { class: "insight-icon" }, icon("x", 15)),
    h(
      "div",
      {},
      h("h4", {}, "Please fix a few things"),
      h("p", {}, keys.map((k) => errors[k]).join(" ")),
    ),
  );
}

export function setFieldError(formEl, name, message) {
  const input = formEl?.querySelector(`[name="${name}"]`);
  if (!input) return;
  input.classList.toggle("invalid", Boolean(message));
  const field = input.closest(".field");
  if (!field) return;
  const existing = field.querySelector(".err");
  if (message) {
    if (existing) existing.remove();
    field.insertBefore(
      h("span", { class: "err" }, icon("x", 12), message),
      input.nextSibling,
    );
  } else existing?.remove();
}

/* ================= Empty state ================= */

export function emptyState({ ic = "inbox", title, message, action }) {
  return h(
    "div",
    { class: "empty" },
    h("div", { class: "empty-icon" }, icon(ic, 24)),
    h("h3", {}, title),
    message
      ? h(
          "p",
          { class: "small", style: { maxWidth: "340px", margin: "0 auto" } },
          message,
        )
      : null,
    action ? h("div", { class: "mt-2" }, action) : null,
  );
}

export function skeleton(count = 3, height = 14) {
  return h(
    "div",
    { class: "stack", style: { gap: "10px" } },
    Array.from({ length: count }, (_, i) =>
      h("div", {
        class: "skeleton",
        style: { height: `${height}px`, width: `${100 - i * 8}%` },
      }),
    ),
  );
}

/* ================= Charts (dependency-free SVG) ================= */

/**
 * Grouped/area line chart for daily study minutes.
 */
export function lineChart(
  data,
  {
    height = 170,
    color = "var(--brand)",
    fill = true,
    format = (v) => fmtMinutes(v),
  } = {},
) {
  const w = 720;
  const pad = { t: 12, r: 12, b: 22, l: 40 };
  const iw = w - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  const max = Math.max(
    60,
    ...data.map((d) => Math.max(d.minutes, d.planned || 0)),
  );
  const niceMax = Math.ceil(max / 60) * 60;
  const x = (i) => pad.l + (i / Math.max(1, data.length - 1)) * iw;
  const y = (v) => pad.t + ih - (v / niceMax) * ih;

  const line = data
    .map(
      (d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d.minutes).toFixed(1)}`,
    )
    .join(" ");
  const planned = data
    .map(
      (d, i) =>
        `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d.planned || 0).toFixed(1)}`,
    )
    .join(" ");
  const areaPath =
    fill && data.length
      ? `${line} L${x(data.length - 1).toFixed(1)},${(pad.t + ih).toFixed(1)} L${pad.l},${(pad.t + ih).toFixed(1)} Z`
      : "";

  const gridLines = [0, 0.25, 0.5, 0.75, 1]
    .map((f) => {
      const v = niceMax * f;
      return (
        `<line x1="${pad.l}" y1="${y(v).toFixed(1)}" x2="${w - pad.r}" y2="${y(v).toFixed(1)}" stroke="var(--grid)" stroke-width="1"/>` +
        `<text x="${pad.l - 7}" y="${(y(v) + 3.5).toFixed(1)}" text-anchor="end" font-size="9.5" fill="var(--text-3)">${format(v)}</text>`
      );
    })
    .join("");

  const step = Math.max(1, Math.floor(data.length / 7));
  const xLabels = data
    .map((d, i) =>
      i % step === 0 || i === data.length - 1
        ? `<text x="${x(i).toFixed(1)}" y="${height - 6}" text-anchor="middle" font-size="9.5" fill="var(--text-3)">${fmtDate(d.date).replace(" ", "\u2009")}</text>`
        : "",
    )
    .join("");

  return h(
    "div",
    { style: { width: "100%", overflow: "hidden" } },
    h("div", {
      html: `<svg viewBox="0 0 ${w} ${height}" style="width:100%;height:${height}px;display:block" preserveAspectRatio="none">
      <defs>
        <linearGradient id="lcGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--brand)" stop-opacity="0.32"/>
          <stop offset="100%" stop-color="var(--brand)" stop-opacity="0"/>
        </linearGradient>
      </defs>
      ${gridLines}
      ${areaPath ? `<path d="${areaPath}" fill="url(#lcGrad)"/>` : ""}
      ${planned ? `<path d="${planned}" fill="none" stroke="var(--border-strong)" stroke-width="1.6" stroke-dasharray="4 4"/>` : ""}
      <path d="${line}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
      ${data
        .map((d, i) =>
          d.minutes > 0
            ? `<circle cx="${x(i).toFixed(1)}" cy="${y(d.minutes).toFixed(1)}" r="2.6" fill="var(--surface)" stroke="${color}" stroke-width="1.8"><title>${fmtDate(d.date)}: ${format(d.minutes)}</title></circle>`
            : "",
        )
        .join("")}
      ${xLabels}
    </svg>`,
    }),
    planned
      ? h(
          "div",
          { class: "row tiny muted", style: { marginTop: "6px", gap: "14px" } },
          h(
            "span",
            { class: "row", style: { gap: "5px" } },
            h("span", {
              style: {
                width: "14px",
                height: "2px",
                background: "var(--brand)",
                borderRadius: "2px",
              },
            }),
            "Completed",
          ),
          h(
            "span",
            { class: "row", style: { gap: "5px" } },
            h("span", {
              style: {
                width: "14px",
                height: "0",
                borderTop: "2px dashed var(--border-strong)",
              },
            }),
            "Planned",
          ),
        )
      : null,
  );
}

/** Vertical bar chart. */
export function barChart(
  data,
  {
    height = 170,
    color = "var(--brand)",
    format = (v) => fmtMinutes(v),
    highlightIndex = -1,
  } = {},
) {
  const w = 720;
  const pad = { t: 12, r: 12, b: 22, l: 40 };
  const iw = w - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  const max = Math.max(1, ...data.map((d) => d.value));
  const niceMax = Math.ceil(max / 60) * 60 || 60;
  const bw = iw / Math.max(1, data.length);
  const y = (v) => pad.t + ih - (v / niceMax) * ih;

  const gridLines = [0, 0.5, 1]
    .map((f) => {
      const v = niceMax * f;
      return (
        `<line x1="${pad.l}" y1="${y(v).toFixed(1)}" x2="${w - pad.r}" y2="${y(v).toFixed(1)}" stroke="var(--grid)"/>` +
        `<text x="${pad.l - 7}" y="${(y(v) + 3.5).toFixed(1)}" text-anchor="end" font-size="9.5" fill="var(--text-3)">${format(v)}</text>`
      );
    })
    .join("");

  const bars = data
    .map((d, i) => {
      const bh = Math.max(0, (d.value / niceMax) * ih);
      const bx = pad.l + i * bw + bw * 0.18;
      const bwidth = bw * 0.64;
      return `<rect x="${bx.toFixed(1)}" y="${(pad.t + ih - bh).toFixed(1)}" width="${bwidth.toFixed(1)}" height="${Math.max(d.value > 0 ? 2 : 0, bh).toFixed(1)}" rx="3" fill="${i === highlightIndex ? "var(--brand-2)" : color}" opacity="${i === highlightIndex ? 1 : 0.82}"><title>${d.label}: ${format(d.value)}</title></rect>`;
    })
    .join("");

  const step = Math.max(1, Math.floor(data.length / 10));
  const labels = data
    .map((d, i) =>
      i % step === 0 || i === data.length - 1
        ? `<text x="${(pad.l + i * bw + bw / 2).toFixed(1)}" y="${height - 6}" text-anchor="middle" font-size="9.5" fill="var(--text-3)">${d.label}</text>`
        : "",
    )
    .join("");

  return h("div", {
    html: `<svg viewBox="0 0 ${w} ${height}" style="width:100%;height:${height}px;display:block" preserveAspectRatio="none">
    ${gridLines}${bars}${labels}
  </svg>`,
  });
}

/** Donut chart with a legend. */
export function donutChart(
  items,
  { size = 168, thickness = 9, centerLabel, centerValue } = {},
) {
  const total = items.reduce((a, i) => a + i.value, 0) || 1;
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;

  const circles = items
    .map((i) => {
      const len = (i.value / total) * c;
      const seg = `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="${i.color}" stroke-width="${thickness}"
      stroke-dasharray="${len.toFixed(2)} ${(c - len).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}"><title>${i.label}: ${i.display || i.value}</title></circle>`;
      offset += len;
      return seg;
    })
    .join("");

  return h(
    "div",
    {
      class: "row",
      style: { gap: "18px", alignItems: "center", flexWrap: "wrap" },
    },
    h(
      "div",
      {
        class: "donut-ring",
        style: {
          position: "relative",
          width: `${size}px`,
          height: `${size}px`,
          flexShrink: 0,
        },
      },
      h("div", {
        html: `<svg width="${size}" height="${size}" class="donut"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="var(--surface-3)" stroke-width="${thickness}"/>${circles}</svg>`,
      }),
      h(
        "div",
        {
          style: {
            position: "absolute",
            inset: "0",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
          },
        },
        h(
          "div",
          {
            style: {
              fontSize: "21px",
              fontWeight: "700",
              letterSpacing: "-.02em",
            },
          },
          centerValue ?? fmtMinutes(total),
        ),
        h(
          "div",
          { class: "tiny muted", style: { fontWeight: "600" } },
          centerLabel || "Total",
        ),
      ),
    ),
    h(
      "div",
      { class: "stack", style: { gap: "7px", flex: "1", minWidth: "140px" } },
      items.map((i) =>
        h(
          "div",
          { class: "row", style: { gap: "8px", fontSize: "12.5px" } },
          h("span", {
            style: {
              width: "9px",
              height: "9px",
              borderRadius: "3px",
              background: i.color,
              flexShrink: 0,
            },
          }),
          h("span", { class: "trunc", style: { flex: "1" } }, i.label),
          h("span", { class: "strong" }, i.display ?? i.value),
        ),
      ),
    ),
  );
}

/** Horizontal ranked bars (great for subject comparison). */
export function rankedBars(
  items,
  { format = (v) => fmtMinutes(v), max: forcedMax } = {},
) {
  const max = forcedMax || Math.max(1, ...items.map((i) => i.value));
  return h(
    "div",
    { class: "stack", style: { gap: "13px" } },
    items.map((i) =>
      h(
        "div",
        {},
        h(
          "div",
          { class: "row", style: { marginBottom: "5px", gap: "8px" } },
          h(
            "span",
            { class: "small strong trunc", style: { flex: "1" } },
            i.label,
          ),
          i.badge || null,
          h("span", { class: "small mono muted" }, format(i.value)),
        ),
        h(
          "div",
          { class: "bar" },
          h("div", {
            class: "bar-fill",
            style: {
              width: `${(i.value / max) * 100}%`,
              "--c": i.color || "var(--brand)",
            },
          }),
        ),
        i.sub
          ? h(
              "div",
              { class: "tiny muted", style: { marginTop: "3px" } },
              i.sub,
            )
          : null,
      ),
    ),
  );
}

/* ================= Session card ================= */

export function sessionCard(
  session,
  subject,
  {
    onStart,
    onComplete,
    onSkip,
    onMiss,
    onEdit,
    onReschedule,
    compact = false,
  } = {},
) {
  const color = subject?.color || "var(--brand)";
  const status = session.status;

  return h(
    "div",
    { class: `slot-card ${status}`, style: { "--c": color } },
    h(
      "div",
      { class: "row", style: { gap: "9px", alignItems: "flex-start" } },
      h(
        "div",
        { style: { flex: "1", minWidth: "0" } },
        h(
          "div",
          { class: "row", style: { gap: "8px", flexWrap: "wrap" } },
          h("span", { class: "slot-title" }, session.subjectName),
          h(
            "span",
            {
              class: "badge",
              style: {
                color: TYPE_COLOR[session.type],
                borderColor: "transparent",
                background: "var(--surface-2)",
              },
            },
            session.type,
          ),
          status === "completed"
            ? h("span", { class: "badge ok" }, icon("check", 11), "Done")
            : null,
          status === "missed"
            ? h("span", { class: "badge danger" }, "Missed")
            : null,
          status === "skipped"
            ? h("span", { class: "badge" }, "Skipped")
            : null,
          status === "in_progress"
            ? h(
                "span",
                { class: "badge brand" },
                icon("play", 10),
                "In progress",
              )
            : null,
          session.rescheduled
            ? h("span", { class: "badge info" }, icon("refresh", 10), "Moved")
            : null,
        ),
        h(
          "div",
          { class: "slot-obj" },
          h("span", { class: "strong" }, session.topic || "—"),
          " · ",
          session.objective || "",
        ),
        h(
          "div",
          {
            class: "row tiny muted",
            style: { gap: "10px", marginTop: "5px", flexWrap: "wrap" },
          },
          h(
            "span",
            { class: "row", style: { gap: "3px" } },
            icon("clock", 11),
            `${session.duration} min`,
          ),
          h(
            "span",
            { class: "row", style: { gap: "3px" } },
            icon("target", 11),
            `Priority ${session.priority || 0}/100`,
          ),
          session.notes
            ? h(
                "span",
                { class: "row", style: { gap: "3px" } },
                icon("quote", 11),
                session.notes,
              )
            : null,
          session.accomplished
            ? h(
                "span",
                { class: "row", style: { gap: "3px", color: "var(--ok)" } },
                icon("check", 11),
                session.accomplished,
              )
            : null,
        ),
      ),
      h(
        "div",
        {
          class: "mono small strong",
          style: { textAlign: "right", flexShrink: 0 },
        },
        h("div", {}, session.startTime || "—"),
        h("div", { class: "tiny muted" }, session.endTime || ""),
      ),
    ),

    !compact &&
      (status === "planned" || status === "in_progress" || status === "missed")
      ? h(
          "div",
          { class: "slot-actions" },
          status === "planned"
            ? h(
                "button",
                {
                  class: "btn btn-sm btn-primary",
                  onclick: () => onStart?.(session),
                },
                icon("play", 12),
                "Start",
              )
            : null,
          status === "planned" || status === "in_progress"
            ? h(
                "button",
                { class: "btn btn-sm", onclick: () => onComplete?.(session) },
                icon("check", 12),
                "Complete",
              )
            : null,
          status === "in_progress"
            ? h(
                "button",
                { class: "btn btn-sm", onclick: () => onSkip?.(session) },
                icon("skip", 12),
                "Skip",
              )
            : null,
          status === "planned"
            ? h(
                "button",
                {
                  class: "btn btn-sm btn-ghost",
                  onclick: () => onSkip?.(session),
                },
                "Skip",
              )
            : null,
          status === "missed"
            ? h(
                "button",
                {
                  class: "btn btn-sm btn-primary",
                  onclick: () => onReschedule?.(session),
                },
                icon("sparkles", 12),
                "Let AI reschedule",
              )
            : null,
          h(
            "button",
            { class: "btn btn-sm btn-ghost", onclick: () => onEdit?.(session) },
            icon("edit", 12),
            "Edit",
          ),
        )
      : null,
  );
}

/* ================= Timeline of a day ================= */

export function dayTimeline(sessions, subjects, handlers = {}) {
  if (!sessions.length) {
    return h(
      "div",
      { class: "empty" },
      h("div", { class: "empty-icon" }, icon("calendar", 22)),
      h("h3", {}, "No sessions planned"),
      h(
        "p",
        { class: "small" },
        "Generate an AI plan to fill this day based on your deadlines.",
      ),
    );
  }
  return h(
    "div",
    { class: "timeline" },
    sessions.map((s) => {
      const subject = subjects.find((x) => x.id === s.subjectId);
      return h(
        "div",
        { class: "slot" },
        h(
          "div",
          { class: "slot-time" },
          h("div", {}, s.startTime || "—"),
          h("small", {}, s.endTime || ""),
        ),
        h(
          "div",
          { class: "slot-body" },
          h("span", {
            class: "slot-dot",
            style: { "--c": subject?.color || "var(--brand)" },
          }),
          sessionCard(s, subject, handlers),
        ),
      );
    }),
  );
}

/* ================= AI insight card ================= */

const INSIGHT_ICONS = {
  imbalance: "layers",
  exam: "exam",
  missed: "refresh",
  overload: "clock",
  underload: "plus",
  deadline: "flag",
  habit: "zap",
  projection: "chart",
  clear: "check",
};

export function insightCard(insight) {
  return h(
    "div",
    { class: `insight sev-${insight.severity}` },
    h(
      "div",
      { class: "insight-icon" },
      icon(INSIGHT_ICONS[insight.type] || "sparkles", 16),
    ),
    h(
      "div",
      { style: { flex: "1", minWidth: "0" } },
      h("h4", {}, insight.title),
      h("p", {}, insight.message),
    ),
  );
}

/* ================= Misc ================= */

export function aiNote(message, { title = "Study AI" } = {}) {
  return h(
    "div",
    { class: "ai-note" },
    h("div", { class: "ai-avatar" }, "S"),
    h(
      "div",
      { style: { flex: "1", minWidth: "0" } },
      h("b", { class: "small" }, title),
      h(
        "div",
        { class: "small", style: { marginTop: "3px", lineHeight: "1.6" } },
        message,
      ),
    ),
  );
}

export function difficultyBadge(d) {
  return h("span", { class: `badge ${DIFFICULTY[d] || ""}` }, d);
}

export function countdownBadge(days) {
  if (days === null || days === undefined) return null;
  if (days < 0) return h("span", { class: "badge" }, "Exam passed");
  if (days === 0)
    return h("span", { class: "badge danger" }, icon("fire", 11), "Today!");
  if (days <= 3)
    return h(
      "span",
      { class: "badge danger" },
      `${days} day${days === 1 ? "" : "s"} left`,
    );
  if (days <= 7) return h("span", { class: "badge warn" }, `${days} days left`);
  if (days <= 14)
    return h("span", { class: "badge info" }, `${days} days left`);
  return h("span", { class: "badge" }, `${days} days left`);
}

/** Minimal markdown → HTML for the AI chat (bold, bullets, code, paragraphs). */
export function mdToHtml(text) {
  const inline = (s) =>
    esc(s)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|\s)\*([^*]+)\*/g, "$1<em>$2</em>")
      .replace(
        /`(.+?)`/g,
        '<code style="background:var(--surface-3);padding:1px 5px;border-radius:5px;font-size:12px">$1</code>',
      );

  const out = [];
  let list = null; // 'ul' | 'ol' | null
  for (const rawLine of String(text || "").split("\n")) {
    const line = rawLine.trimEnd();
    const bullet = line.match(/^\s*[•\-*]\s+(.*)$/);
    const num = line.match(/^\s*(\d+)\.\s+(.*)$/);
    if (bullet || num) {
      const listType = num ? "ol" : "ul";
      if (!list) {
        out.push(`<${listType}>`);
        list = listType;
      } else if (list !== listType) {
        out.push(`</${list}>`);
        out.push(`<${listType}>`);
        list = listType;
      }
      out.push(`<li>${inline(bullet ? bullet[1] : num[2])}</li>`);
      continue;
    }
    if (list) {
      out.push(`</${list}>`);
      list = null;
    }
    if (!line.trim()) {
      out.push("");
      continue;
    }
    out.push(`<p>${inline(line)}</p>`);
  }
  if (list) out.push(`</${list}>`);
  return out.join("").replace(/<p>\s*<\/p>/g, "");
}
