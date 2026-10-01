import { h, icon, toast, addDays, today, dayKey } from "../ui.js";
import { post, get } from "../api.js";
import {
  field,
  textInput,
  selectInput,
  rangeInput,
  errorSummary,
  setFieldError,
  difficultyBadge,
} from "../components.js";

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
const PRESETS = {
  Mathematics: [
    "Limits & Continuity",
    "Differentiation",
    "Integration",
    "Matrices & Determinants",
    "Vectors & 3D",
    "Probability",
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
    "Algorithms",
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
  ],
  "Communication Skills": [
    "Grammar Basics",
    "Vocabulary Building",
    "Listening Skills",
    "Presentation Skills",
    "Group Discussion",
  ],
  "Environmental Studies": [
    "Ecosystem Structure",
    "Pollution & Control",
    "Energy & Environment",
    "Sustainable Development",
  ],
};

const STEPS = [
  "About you",
  "Subjects",
  "Exams & tasks",
  "Availability",
  "Goals",
];
let step = 0;

const state = {
  name: "",
  course: "",
  semester: 1,
  subjects: [
    {
      name: "Mathematics",
      difficulty: "Hard",
      preparation: 40,
      priority: 5,
      examDate: "",
    },
    {
      name: "Programming",
      difficulty: "Medium",
      preparation: 55,
      priority: 5,
      examDate: "",
    },
    {
      name: "Physics",
      difficulty: "Hard",
      preparation: 30,
      priority: 4,
      examDate: "",
    },
  ],
  tasks: [],
  availableHours: 4,
  preferredTime: "Evening",
  holidays: [0],
  targetGpa: 8.5,
  dailyGoalHours: 4,
};

export function onboardingPage({ user, onDone }) {
  state.name = state.name || user.name || "";
  state.course = state.course || user.course || "";
  state.semester = state.semester || user.semester || 1;

  const root = h("div", {
    class: "auth-bg",
    style: { alignItems: "flex-start", paddingTop: "36px" },
  });

  function stepsBar() {
    return h(
      "div",
      { class: "steps" },
      STEPS.map((s, i) =>
        h(
          "div",
          { class: "step " + (i === step ? "active" : i < step ? "done" : "") },
          h("div", { class: "step-bar" }),
          h("span", {}, `${i + 1}. ${s}`),
        ),
      ),
    );
  }

  function stepBody() {
    if (step === 0) return aboutStep();
    if (step === 1) return subjectsStep();
    if (step === 2) return tasksStep();
    if (step === 3) return availabilityStep();
    return goalsStep();
  }

  function aboutStep() {
    return h(
      "div",
      { class: "stack" },
      h(
        "div",
        {},
        h("h2", {}, "Let’s get you set up"),
        h(
          "p",
          { class: "dim small", style: { marginTop: "4px" } },
          "This takes about a minute. The more accurate your data, the smarter your schedule.",
        ),
      ),
      field({
        label: "Full name",
        input: textInput({
          name: "name",
          value: state.name,
          placeholder: "Aarav Sharma",
          onInput: (v) => {
            state.name = v;
          },
        }),
      }),
      h(
        "div",
        { class: "grid g-2" },
        field({
          label: "Course / degree",
          input: textInput({
            name: "course",
            value: state.course,
            placeholder: "B.Tech CSE",
            onInput: (v) => {
              state.course = v;
            },
          }),
        }),
        field({
          label: "Semester / year",
          input: selectInput({
            name: "semester",
            value: state.semester,
            options: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({
              value: n,
              label: `Semester ${n}`,
            })),
            onChange: (v) => {
              state.semester = Number(v);
            },
          }),
        }),
      ),
    );
  }

  function subjectsStep() {
    const list = h("div", { class: "stack", style: { gap: "9px" } });

    function draw() {
      list.innerHTML = "";
      state.subjects.forEach((s, i) => {
        list.append(
          h(
            "div",
            { class: "subj-row" },
            field({
              label: "Subject",
              input: h("input", {
                class: "input",
                name: `subj-${i}-name`,
                value: s.name,
                placeholder: "e.g. Mathematics",
                list: "subject-presets",
                oninput: (e) => {
                  s.name = e.target.value;
                  const opts = PRESETS[e.target.value] ? [] : [];
                },
              }),
            }),
            field({
              label: "Difficulty",
              input: selectInput({
                value: s.difficulty,
                options: ["Easy", "Medium", "Hard"].map((d) => ({
                  value: d,
                  label: d,
                })),
                onChange: (v) => {
                  s.difficulty = v;
                  draw();
                },
              }),
            }),
            field({
              label: `Preparation — ${s.preparation}%`,
              input: rangeInput({
                value: s.preparation,
                min: 0,
                max: 100,
                step: 5,
                onInput: (v) => {
                  s.preparation = Number(v);
                  draw();
                },
              }),
            }),
            h(
              "div",
              { class: "row", style: { gap: "5px" } },
              h(
                "button",
                {
                  class: "btn btn-ghost btn-icon",
                  title: "Remove subject",
                  onclick: () => {
                    state.subjects.splice(i, 1);
                    draw();
                  },
                },
                icon("trash", 15),
              ),
            ),
          ),
        );
      });

      if (!state.subjects.length) {
        list.append(
          h(
            "p",
            {
              class: "muted small",
              style: { textAlign: "center", padding: "18px" },
            },
            "Add at least one subject so the planner has something to schedule.",
          ),
        );
      }
    }
    draw();

    const datalist = h(
      "datalist",
      { id: "subject-presets" },
      Object.keys(PRESETS).map((k) => h("option", { value: k })),
    );

    return h(
      "div",
      { class: "stack" },
      h(
        "div",
        {},
        h("h2", {}, "Your subjects"),
        h(
          "p",
          { class: "dim small", style: { marginTop: "4px" } },
          "Difficulty and preparation level directly drive how much time each subject gets.",
        ),
      ),
      list,
      datalist,
      h(
        "button",
        {
          class: "btn btn-block",
          onclick: () => {
            state.subjects.push({
              name: "",
              difficulty: "Medium",
              preparation: 0,
              priority: 3,
              examDate: "",
            });
            draw();
          },
        },
        icon("plus", 15),
        "Add another subject",
      ),
    );
  }

  function tasksStep() {
    const list = h("div", { class: "stack", style: { gap: "9px" } });

    function draw() {
      list.innerHTML = "";
      state.tasks.forEach((t, i) => {
        list.append(
          h(
            "div",
            {
              class: "subj-row",
              style: {
                gridTemplateColumns: "2fr 1.2fr 1fr auto",
                alignItems: "end",
              },
            },
            field({
              label: "Task",
              input: textInput({
                value: t.title,
                placeholder: "Assignment title",
                onInput: (v) => {
                  t.title = v;
                },
              }),
            }),
            field({
              label: "Type",
              input: selectInput({
                value: t.type,
                options: [
                  "Assignment",
                  "Project",
                  "Lab work",
                  "Presentation",
                  "Other",
                ].map((x) => ({ value: x, label: x })),
                onChange: (v) => {
                  t.type = v;
                },
              }),
            }),
            field({
              label: "Due date",
              input: h("input", {
                class: "input",
                type: "date",
                value: t.dueDate,
                oninput: (e) => {
                  t.dueDate = e.target.value;
                },
              }),
            }),
            h(
              "button",
              {
                class: "btn btn-ghost btn-icon",
                onclick: () => {
                  state.tasks.splice(i, 1);
                  draw();
                },
              },
              icon("trash", 15),
            ),
          ),
        );
      });
      if (!state.tasks.length) {
        list.append(
          h(
            "p",
            {
              class: "muted small",
              style: { textAlign: "center", padding: "18px" },
            },
            "No deadlines yet. You can add these later from the Tasks page.",
          ),
        );
      }
    }
    draw();

    return h(
      "div",
      { class: "stack" },
      h(
        "div",
        {},
        h("h2", {}, "Exams & deadlines"),
        h(
          "p",
          { class: "dim small", style: { marginTop: "4px" } },
          "Set exam dates on the next step. Add any assignment or project deadlines here — the AI raises a subject’s priority as they approach.",
        ),
      ),
      list,
      h(
        "button",
        {
          class: "btn btn-block",
          onclick: () => {
            state.tasks.push({
              title: "",
              type: "Assignment",
              dueDate: addDays(today(), 7),
            });
            draw();
          },
        },
        icon("plus", 15),
        "Add a deadline",
      ),
    );
  }

  function availabilityStep() {
    const chips = h(
      "div",
      { class: "chips" },
      DAYS.map((d, i) =>
        h(
          "button",
          {
            class: "chip" + (state.holidays.includes(i) ? " active" : ""),
            type: "button",
            onclick: (e) => {
              if (state.holidays.includes(i))
                state.holidays = state.holidays.filter((x) => x !== i);
              else state.holidays.push(i);
              e.currentTarget.classList.toggle("active");
            },
          },
          d,
        ),
      ),
    );

    return h(
      "div",
      { class: "stack" },
      h(
        "div",
        {},
        h("h2", {}, "When can you study?"),
        h(
          "p",
          { class: "dim small", style: { marginTop: "4px" } },
          "The planner schedules only inside the hours you actually have — no 6am sessions you’ll never do.",
        ),
      ),

      field({
        label: `Daily available study hours — ${state.availableHours}h`,
        input: rangeInput({
          value: state.availableHours,
          min: 1,
          max: 12,
          step: 1,
          onInput: (v) => {
            state.availableHours = Number(v);
            redraw();
          },
        }),
      }),

      h(
        "div",
        { class: "grid g-2" },
        field({
          label: "Preferred study time",
          input: selectInput({
            value: state.preferredTime,
            options: TIMES.map((t) => ({ value: t, label: t })),
            onChange: (v) => {
              state.preferredTime = v;
            },
          }),
        }),
        h(
          "div",
          { class: "field" },
          h("label", {}, "Weekly holidays / free days"),
          chips,
          h(
            "span",
            { class: "hint" },
            "Free days still get a light revision block so you don’t lose the streak.",
          ),
        ),
      ),

      h(
        "div",
        {},
        h(
          "label",
          {
            class: "small strong",
            style: { display: "block", marginBottom: "8px" },
          },
          "Exam dates",
        ),
        h(
          "div",
          { class: "stack", style: { gap: "8px" } },
          state.subjects.map((s, i) =>
            h(
              "div",
              { class: "row", style: { gap: "10px" } },
              h(
                "span",
                {
                  class: "small strong",
                  style: { flex: "1", minWidth: "80px" },
                },
                s.name || `Subject ${i + 1}`,
              ),
              difficultyBadge(s.difficulty),
              h("input", {
                class: "input",
                type: "date",
                style: { maxWidth: "170px" },
                value: s.examDate,
                oninput: (e) => {
                  s.examDate = e.target.value;
                },
              }),
            ),
          ),
        ),
      ),
    );
  }

  function goalsStep() {
    return h(
      "div",
      { class: "stack" },
      h(
        "div",
        {},
        h("h2", {}, "Your goals"),
        h(
          "p",
          { class: "dim small", style: { marginTop: "4px" } },
          "These shape the daily target on your dashboard and keep the AI honest about pacing.",
        ),
      ),
      field({
        label: `Daily study goal — ${state.dailyGoalHours}h`,
        input: rangeInput({
          value: state.dailyGoalHours,
          min: 1,
          max: 12,
          step: 1,
          onInput: (v) => {
            state.dailyGoalHours = Number(v);
            redraw();
          },
        }),
      }),
      field({
        label: `Target GPA / percentage — ${state.targetGpa}`,
        input: rangeInput({
          value: state.targetGpa,
          min: 5,
          max: 10,
          step: 0.5,
          onInput: (v) => {
            state.targetGpa = Number(v);
            redraw();
          },
        }),
        hint:
          state.targetGpa >= 9
            ? "Ambitious — expect early mornings and short bursts."
            : "A realistic target keeps the plan sustainable.",
      }),
      h(
        "div",
        { class: "ai-note" },
        h("div", { class: "ai-avatar" }, "S"),
        h(
          "div",
          {},
          h("b", {}, "How the AI will use this"),
          h(
            "p",
            { class: "small", style: { marginTop: "4px", lineHeight: "1.6" } },
            `You have ${state.availableHours}h a day and ${state.subjects.length} subjects. Exams and hard subjects with low preparation will consume most of that time — easy or far-off subjects get maintenance blocks instead. Revision is scheduled automatically at 1, 2, 4, 7, 14 and 30 days after you learn a topic.`,
          ),
        ),
      ),
    );
  }

  function redraw() {
    render();
  }

  function validate() {
    const errors = {};
    if (step === 0) {
      if (state.name.trim().length < 2) errors.name = "Please enter your name.";
      if (state.course.trim().length < 2)
        errors.course = "Enter your course or degree.";
    }
    if (step === 1) {
      const named = state.subjects.filter((s) => s.name.trim().length >= 2);
      if (!named.length)
        errors.subjects = "Add at least one subject with a name.";
      const dupes = named
        .map((s) => s.name.toLowerCase())
        .filter((n, i, a) => a.indexOf(n) !== i);
      if (dupes.length)
        errors.subjects =
          "Duplicate subject names — each subject should appear once.";
    }
    if (step === 2) {
      for (const t of state.tasks)
        if (t.title.trim().length < 3) {
          errors.tasks = "Every deadline needs a title.";
          break;
        }
    }
    return errors;
  }

  function render() {
    root.innerHTML = "";
    const body = stepBody();
    const nextBtn = h(
      "button",
      {
        class: "btn btn-primary",
        onclick: async () => {
          const errors = validate();
          if (Object.keys(errors).length) {
            toast(Object.values(errors)[0], {
              kind: "err",
              title: "Check your details",
            });
            return;
          }
          if (step < STEPS.length - 1) {
            step++;
            render();
            return;
          }
          await finish();
        },
      },
      step === STEPS.length - 1 ? "Generate my study plan" : "Continue",
      icon("arrow", 15),
    );

    root.append(
      h(
        "div",
        { class: "auth-card wide" },
        h(
          "div",
          { class: "auth-logo" },
          h("div", { class: "brand-mark" }, "S"),
          h(
            "div",
            {},
            h("div", { class: "brand-name" }, "Study AI"),
            h(
              "div",
              { class: "brand-sub" },
              `Step ${step + 1} of ${STEPS.length}`,
            ),
          ),
        ),
        h("div", { style: { marginTop: "18px" } }, stepsBar()),
        body,
        h(
          "div",
          { class: "row mt-3", style: { gap: "9px" } },
          step > 0
            ? h(
                "button",
                {
                  class: "btn",
                  onclick: () => {
                    step--;
                    render();
                  },
                },
                icon("chevronL", 15),
                "Back",
              )
            : null,
          h("div", { class: "spacer" }),
          nextBtn,
        ),
      ),
    );
  }

  async function finish() {
    const btn = document.querySelector(".btn-primary");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Building your plan…";
    }
    try {
      const res = await post("/onboarding", {
        name: state.name,
        course: state.course,
        semester: state.semester,
        settings: {
          availableHours: state.availableHours,
          dailyStudyGoalHours: state.dailyGoalHours,
          preferredTime: state.preferredTime,
          holidays: state.holidays,
          targetGpa: state.targetGpa,
        },
        subjects: state.subjects
          .filter((s) => s.name.trim().length >= 2)
          .map((s, i) => ({
            ...s,
            priority:
              s.priority ||
              (s.difficulty === "Hard" ? 5 : s.difficulty === "Easy" ? 2 : 3),
          })),
      });
      for (const t of state.tasks.filter((t) => t.title.trim().length >= 3)) {
        const subject = res.user.subjects?.find(
          (s) => s.name.toLowerCase() === t.title.toLowerCase(),
        );
        await post("/tasks", {
          title: t.title,
          type: t.type,
          dueDate: t.dueDate || null,
          priority: "medium",
        });
      }
      toast(
        `Your AI plan is ready — ${res.sessionsCreated} sessions scheduled across the next 14 days.`,
        { kind: "ok", title: "Plan generated", duration: 6000 },
      );
      onDone(res.user);
    } catch (err) {
      toast(err.message, { kind: "err", title: "Could not finish setup" });
      btn.disabled = false;
      btn.textContent = "Generate my study plan";
    }
  }

  render();
  return root;
}
