/**
 * seed.js — realistic first-run demo student so the UI is never empty.
 * Course: B.Tech CSE, Semester 1, 5 subjects, real exam dates, tasks,
 * a fortnight of session history, progress values, streak and XP.
 */
import { uid } from "./store.js";
import { newUser } from "./auth.js";
import {
  addDays,
  todayKey,
  dayOfWeek,
  windowFor,
  minutesToHHMM,
} from "./date-utils.js";
import {
  generatePlan,
  markTopicStudied,
  awardXP,
  scheduleRevisions,
} from "./ai.js";

const COLORS = {
  Mathematics: "#6366f1",
  Programming: "#06b6d4",
  Physics: "#f59e0b",
  "Communication Skills": "#ec4899",
  "Environmental Studies": "#10b981",
};

function iso(dateKey, time) {
  return `${dateKey}T${time}:00`;
}

export function seedDemoUser() {
  const today = todayKey();
  const user = newUser({
    name: "Aarav Sharma",
    email: "aarav@college.edu",
    password: "study123",
    course: "B.Tech CSE",
    semester: 1,
  });
  user.onboarded = true;
  user.isDemo = true;
  user.settings = {
    availableHours: 5,
    preferredTime: "Evening",
    holidays: [0], // Sunday off
    targetGpa: 8.5,
    dailyStudyGoalHours: 5,
    pomodoro: { focus: 25, shortBreak: 5, longBreak: 10 },
    notifications: {
      sessions: true,
      exams: true,
      deadlines: true,
      missed: true,
      revision: true,
    },
  };
  user.subjects = [
    {
      id: uid("sub"),
      name: "Mathematics",
      difficulty: "Hard",
      preparation: 65,
      priority: 5,
      examDate: addDays(today, 12),
      color: COLORS.Mathematics,
      archived: false,
      topicProgress: {},
      createdAt: new Date().toISOString(),
    },
    {
      id: uid("sub"),
      name: "Programming",
      difficulty: "Medium",
      preparation: 80,
      priority: 5,
      examDate: addDays(today, 20),
      color: COLORS.Programming,
      archived: false,
      topicProgress: {},
      createdAt: new Date().toISOString(),
    },
    {
      id: uid("sub"),
      name: "Physics",
      difficulty: "Hard",
      preparation: 40,
      priority: 4,
      examDate: addDays(today, 18),
      color: COLORS.Physics,
      archived: false,
      topicProgress: {},
      createdAt: new Date().toISOString(),
    },
    {
      id: uid("sub"),
      name: "Communication Skills",
      difficulty: "Easy",
      preparation: 55,
      priority: 2,
      examDate: addDays(today, 26),
      color: COLORS["Communication Skills"],
      archived: false,
      topicProgress: {},
      createdAt: new Date().toISOString(),
    },
    {
      id: uid("sub"),
      name: "Environmental Studies",
      difficulty: "Easy",
      preparation: 25,
      priority: 1,
      examDate: addDays(today, 33),
      color: COLORS["Environmental Studies"],
      archived: false,
      topicProgress: {},
      createdAt: new Date().toISOString(),
    },
  ];

  const M = user.subjects[0],
    P = user.subjects[1],
    PH = user.subjects[2],
    C = user.subjects[3],
    E = user.subjects[4];
  // A few topics learned, with spaced-revision schedules already running.
  markTopicStudied(user, M.id, "Limits & Continuity");
  markTopicStudied(user, M.id, "Differentiation");
  M.topicProgress["Limits & Continuity"].nextRevision = addDays(today, 1);
  M.topicProgress["Differentiation"].nextRevision = addDays(today, 2);
  markTopicStudied(user, P.id, "Basics & Syntax");
  markTopicStudied(user, P.id, "Control Flow");
  markTopicStudied(user, P.id, "Functions");
  P.topicProgress["Basics & Syntax"].nextRevision = addDays(today, 4);
  markTopicStudied(user, PH.id, "Units & Measurements");
  markTopicStudied(user, C.id, "Grammar Basics");
  C.topicProgress["Grammar Basics"].nextRevision = addDays(today, 7);

  user.tasks = [
    {
      id: uid("t"),
      userId: user.id,
      title: "Calculus Assignment 2",
      type: "Assignment",
      subjectId: M.id,
      subjectName: M.name,
      dueDate: addDays(today, 2),
      priority: "high",
      progress: 60,
      status: "in_progress",
      notes: "Q1-Q6 done, need Q7-Q10 on integration by parts.",
      createdAt: new Date().toISOString(),
    },
    {
      id: uid("t"),
      userId: user.id,
      title: "Python Lab Record — Week 5",
      type: "Lab work",
      subjectId: P.id,
      subjectName: P.name,
      dueDate: addDays(today, 1),
      priority: "high",
      progress: 80,
      status: "in_progress",
      notes: "Finish array experiments and paste outputs.",
      createdAt: new Date().toISOString(),
    },
    {
      id: uid("t"),
      userId: user.id,
      title: "Rotational Motion Problem Sheet",
      type: "Assignment",
      subjectId: PH.id,
      subjectName: PH.name,
      dueDate: addDays(today, 5),
      priority: "medium",
      progress: 30,
      status: "in_progress",
      notes: "",
      createdAt: new Date().toISOString(),
    },
    {
      id: uid("t"),
      userId: user.id,
      title: "Group Presentation — Climate Change",
      type: "Presentation",
      subjectId: E.id,
      subjectName: E.name,
      dueDate: addDays(today, 8),
      priority: "medium",
      progress: 15,
      status: "todo",
      notes: "Slides 1-3 drafted, need data and conclusion.",
      createdAt: new Date().toISOString(),
    },
    {
      id: uid("t"),
      userId: user.id,
      title: "Essay Draft — My Communication Style",
      type: "Assignment",
      subjectId: C.id,
      subjectName: C.name,
      dueDate: addDays(today, 10),
      priority: "low",
      progress: 0,
      status: "todo",
      notes: "",
      createdAt: new Date().toISOString(),
    },
    {
      id: uid("t"),
      userId: user.id,
      title: "Mini Project — Number Guessing Game",
      type: "Project",
      subjectId: P.id,
      subjectName: P.name,
      dueDate: addDays(today, 15),
      priority: "medium",
      progress: 35,
      status: "in_progress",
      notes: "Core loop works, add scoreboard + input validation.",
      createdAt: new Date().toISOString(),
    },
  ];

  user.gamification = {
    xp: 1840,
    level: 5,
    badges: [
      "first_session",
      "streak_3",
      "streak_7",
      "focus_5h",
      "night_owl",
      "planner_10",
    ],
    dailyGoalXP: 100,
  };
  user.preferences = { theme: "dark" };

  return user;
}

/** Build 14 days of believable session history + 14 forward days of plan. */
export function seedSessions(user) {
  const db = globalThis.__STUDY_DB__;
  const today = todayKey();
  const [winStart] = windowFor(
    user.settings.preferredTime,
    user.settings.availableHours,
  );
  const sessions = [];

  const history = [
    // [daysAgo, subject, topic, type, duration, startOffsetMin, status]
    [
      0,
      "Communication Skills",
      "Vocabulary Building",
      "Practice",
      30,
      0,
      "completed",
    ],
    [0, "Mathematics", "Limits & Continuity", "Revision", 30, 45, "completed"],
    [13, "Programming", "Arrays & Strings", "Learning", 60, 0, "completed"],
    [13, "Mathematics", "Limits & Continuity", "Practice", 45, 75, "completed"],
    [12, "Physics", "Kinematics", "Learning", 60, 0, "completed"],
    [
      12,
      "Communication Skills",
      "Vocabulary Building",
      "Practice",
      30,
      75,
      "completed",
    ],
    [11, "Mathematics", "Differentiation", "Learning", 90, 0, "completed"],
    [11, "Programming", "Functions", "Practice", 45, 105, "completed"],
    [10, "Physics", "Laws of Motion", "Learning", 60, 0, "completed"],
    [10, "Programming", "Mini Project", "Practice", 60, 75, "completed"],
    [9, "Mathematics", "Integration", "Practice", 60, 0, "completed"],
    [
      9,
      "Environmental Studies",
      "Ecosystem Structure",
      "Learning",
      45,
      75,
      "completed",
    ],
    [8, "Physics", "Work Energy Power", "Learning", 75, 0, "completed"],
    [8, "Programming", "OOP Concepts", "Learning", 60, 90, "missed"],
    [7, "Mathematics", "Limits & Continuity", "Revision", 30, 0, "completed"],
    [
      7,
      "Communication Skills",
      "Presentation Skills",
      "Learning",
      45,
      45,
      "completed",
    ],
    [6, "Physics", "Work Energy Power", "Practice", 60, 0, "completed"],
    [6, "Programming", "Arrays & Strings", "Practice", 45, 75, "completed"],
    [
      5,
      "Mathematics",
      "Matrices & Determinants",
      "Learning",
      90,
      0,
      "completed",
    ],
    [5, "Programming", "OOP Concepts", "Learning", 60, 105, "completed"],
    [4, "Physics", "Rotational Motion", "Learning", 60, 0, "completed"],
    [
      4,
      "Environmental Studies",
      "Pollution & Control",
      "Learning",
      45,
      75,
      "completed",
    ],
    [3, "Mathematics", "Differentiation", "Practice", 60, 0, "completed"],
    [3, "Programming", "Functions", "Revision", 30, 75, "completed"],
    [2, "Physics", "Thermodynamics", "Learning", 60, 0, "completed"],
    [2, "Mathematics", "Integration", "Practice", 45, 75, "missed"],
    [
      1,
      "Communication Skills",
      "Group Discussion",
      "Practice",
      30,
      0,
      "completed",
    ],
    [1, "Programming", "Data Structures", "Learning", 60, 45, "completed"],
  ];

  for (const [
    ago,
    subjectName,
    topic,
    type,
    duration,
    offset,
    status,
  ] of history) {
    const date = addDays(today, -ago);
    if (dayOfWeek(date) === 0) continue;
    const subject = user.subjects.find((s) => s.name === subjectName);
    if (!subject) continue;
    const start = winStart + offset;
    sessions.push({
      id: uid("s"),
      userId: user.id,
      subjectId: subject.id,
      subjectName,
      topic,
      type,
      objective: `${type} of ${topic}`,
      date,
      startTime: minutesToHHMM(start),
      endTime: minutesToHHMM(start + duration),
      duration,
      priority: 60,
      status,
      notes: "",
      rescheduled: false,
      createdAt: iso(date, "17:00"),
    });
  }

  db.sessions.push(...sessions);

  // Forward plan: the AI fills the next 14 days.
  const { created } = generatePlan(user, { fromDay: today, horizonDays: 14 });
  for (const s of created) s.userId = user.id;
  db.sessions = db.sessions.filter((s) => s.userId);
  return { history: sessions.length, planned: created.length };
}
