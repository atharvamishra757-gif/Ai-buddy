import { h, icon, fmtMinutes } from "../ui.js";
import { get } from "../api.js";

const CATEGORY_META = {
  hours:     { label: "Study Hours",   icon: "⏱️",  color: "#7c6cff" },
  streak:    { label: "Streaks",       icon: "🔥",  color: "#fb923c" },
  milestone: { label: "Milestones",   icon: "🏆",  color: "#fbbf24" },
  habit:     { label: "Study Habits", icon: "🌙",  color: "#34d399" },
};

const HOUR_MILESTONES = [1, 2, 5, 10, 15, 20, 25, 30, 40, 50, 60, 75, 80, 90, 100];

export async function badgesPage({ user }) {
  const data = await get("/badges");
  const el = h("div", { class: "stack badges-root" });
  render(el, data);
  return { el };
}

function render(root, data) {
  root.innerHTML = "";

  const { badges, earned, total, totalMinutes, totalHours,
          nextMilestoneHours, minutesToNext, gamification } = data;

  const totalHoursExact = totalMinutes / 60;
  const nextProgress = nextMilestoneHours
    ? Math.min(100, Math.round((totalHoursExact / nextMilestoneHours) * 100))
    : 100;

  /* ── hero strip ──────────────────────────────────────────────────────── */
  const heroPercent = Math.round((earned / total) * 100);
  root.append(
    h("div", { class: "badges-hero" },
      h("div", { class: "badges-hero-left" },
        h("div", { class: "badges-hero-icon" }, "🏅"),
        h("div", {},
          h("h2", { class: "badges-hero-title" }, "Achievement Badges"),
          h("p", { class: "badges-hero-sub" },
            `You've earned `, h("b", {}, String(earned)), ` of `, h("b", {}, String(total)), ` badges`,
          ),
        ),
      ),
      h("div", { class: "badges-hero-stats" },
        heroStat("⏱️", `${totalHours}h ${totalMinutes % 60}m`, "Study time"),
        heroStat("🎯", `${heroPercent}%`, "Completion"),
        heroStat("⚡", `${gamification?.xp ?? 0} XP`, "Total XP"),
        heroStat("🏆", `Lvl ${gamification?.level ?? 1}`, "Level"),
      ),
    ),
  );

  /* ── next milestone progress bar ──────────────────────────────────────── */
  if (nextMilestoneHours) {
    const minsLeft = minutesToNext;
    root.append(
      h("div", { class: "card badges-next" },
        h("div", { class: "badges-next-head" },
          h("div", {},
            h("div", { class: "badges-next-label" },
              h("span", { class: "badges-next-icon" }, "✨"),
              h("span", {}, `Next milestone: `),
              h("b", {}, `${nextMilestoneHours}h — `),
              h("span", { class: "muted" }, badgeName(badges, `hours_${nextMilestoneHours}`)),
            ),
            h("div", { class: "badges-next-hint" },
              minsLeft > 0
                ? `${fmtMinutes(minsLeft)} more to unlock`
                : "Almost there!",
            ),
          ),
          h("span", { class: "badges-next-pct" }, `${nextProgress}%`),
        ),
        h("div", { class: "xp-bar" },
          h("div", {
            class: "xp-fill badges-next-fill",
            style: { width: `${nextProgress}%` },
          }),
        ),
      ),
    );
  }

  /* ── category sections ──────────────────────────────────────────────── */
  const byCategory = {};
  for (const b of badges) {
    const cat = b.category || "milestone";
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(b);
  }

  // Order: hours first, then streaks, milestones, habits
  const catOrder = ["hours", "streak", "milestone", "habit"];
  for (const cat of catOrder) {
    const list = byCategory[cat];
    if (!list) continue;
    const meta = CATEGORY_META[cat] || { label: cat, icon: "🎖️", color: "#7c6cff" };
    const earnedCount = list.filter((b) => b.earned).length;

    root.append(
      h("div", { class: "card" },
        h("div", { class: "card-head" },
          h("h3", {},
            h("span", { style: { marginRight: "6px" } }, meta.icon),
            meta.label,
          ),
          h("span", { class: "sub" }, `${earnedCount}/${list.length}`),
        ),
        h("div", { class: "card-pad" },
          cat === "hours"
            ? renderHourTimeline(list)
            : h("div", { class: "badges-grid" },
                list.map(badgeCard),
              ),
        ),
      ),
    );
  }
}

/* ── hour-milestone timeline ─────────────────────────────────────────────── */
function renderHourTimeline(hourBadges) {
  // Sort by hours field
  const sorted = [...hourBadges].sort((a, b) => (a.hours || 0) - (b.hours || 0));

  return h("div", { class: "hours-timeline" },
    sorted.map((b, i) =>
      h("div", { class: `hours-node ${b.earned ? "earned" : "locked"}` },
        h("div", { class: "hours-node-connector" }),
        h("div", { class: "hours-node-card", title: b.desc },
          h("div", { class: "hours-node-icon" }, b.icon),
          h("div", { class: "hours-node-name" }, b.name),
          h("div", { class: "hours-node-label" }, `${b.hours}h`),
          b.earned
            ? h("div", { class: "hours-node-check" }, "✓")
            : h("div", { class: "hours-node-lock" }, "🔒"),
        ),
      ),
    ),
  );
}

/* ── badge card ──────────────────────────────────────────────────────────── */
function badgeCard(b) {
  return h("div", {
    class: `badge-card ${b.earned ? "badge-earned" : "badge-locked"}`,
    title: b.desc,
  },
    h("div", { class: "badge-card-shimmer" }),
    h("div", { class: "badge-card-icon" }, b.icon),
    h("div", { class: "badge-card-name" }, b.name),
    h("div", { class: "badge-card-desc" }, b.desc),
    b.earned
      ? h("div", { class: "badge-card-earned-label" }, "✓ Earned")
      : h("div", { class: "badge-card-locked-label" }, "🔒 Locked"),
  );
}

function heroStat(emoji, value, label) {
  return h("div", { class: "badges-hero-stat" },
    h("div", { class: "badges-hero-stat-val" },
      h("span", { style: { marginRight: "4px" } }, emoji),
      value,
    ),
    h("div", { class: "badges-hero-stat-label" }, label),
  );
}

function badgeName(badges, key) {
  return badges.find((b) => b.key === key)?.name ?? "";
}
