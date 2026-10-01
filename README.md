# Study AI — AI-Powered Student Study Planner

A fully functional study planner for college/university students. It turns your
subjects, exam dates, assignment deadlines, preparation levels and available
hours into a realistic day-by-day schedule — and keeps optimising it as your
data changes.

```bash
node server/index.js       # or: npm start
# open http://localhost:4173
```

No build step, no dependencies. Node 18+ only. (`npm` is not required — every
command works with plain `node`.)

---

## Sign in

Click **“Explore the demo account”** on the login screen to load a realistic
B.Tech CSE Semester 1 student: 5 subjects, 5 exams, 6 deadlines, 14 days of
study history and a 14-day generated plan. Or register your own account and go
through onboarding.

---

## What makes the planner intelligent

### Priority scoring

Every subject gets a 0–100 score, recomputed on each read:

| Signal             | Weight | How it is measured                                                 |
| ------------------ | ------ | ------------------------------------------------------------------ |
| Exam urgency       | 30     | `exp(-daysToExam / 12)` — 5 days out scores 0.66, 20 days out 0.19 |
| Difficulty         | 14     | Easy 0.25 · Medium 0.6 · Hard 1.0                                  |
| Low preparation    | 22     | `(1 − prep/100)^1.3`                                               |
| Deadline urgency   | 12     | Average exponential decay of open assignment due dates             |
| Subject importance | 14     | Your 1–5 rating, normalised                                        |
| Missed sessions    | 8      | Count of missed sessions in the last 14 days, capped at 3          |

So a Hard subject with an exam in 5 days at 30% preparation outranks an Easy
subject with an exam in 20 days — verified by the test suite.

### Plan generation

1. Subjects are ranked by priority score.
2. The daily time budget is split across them **proportionally to priority**,
   with a fresh allocation each day.
3. For each subject, the planner picks the single most useful next action:
   a **due spaced-repetition revision** → a **new topic to learn** (while there
   is runway before the exam) → **practice on weak material** → a **timed mock
   test** (final 7 days) → **consolidation**.
4. Sessions are placed into real clock times inside your chosen window
   (Morning 06:00 · Afternoon 13:00 · Evening 17:00 · Night 21:00) and never
   outside it.
5. Free days get a lighter 40% block so the streak survives without burnout.

Existing future sessions are preserved and their time is subtracted, so
regenerating never double-books you.

### AI rescheduling

Missing a session does not just mark it red. The AI takes the lost minutes and
redistributes them across the next 5 days into whichever subject most needs
them, then reports what it did in plain language:

> You missed your Mathematics session. I've redistributed the remaining 60 minutes
> across the next 2 days without affecting your Physics revision.

If your coming days are already full, it says so instead of silently doing
nothing.

### Spaced repetition

Mark a topic _learned_ and it is automatically scheduled at **Day 1 → 2 → 4 →
7 → 14 → 30** (quick revision → practice → revision → final revision → long-term
recall). Due revisions take priority over new material and appear in your plan
and notifications.

### Insights & the Study AI chatbot

Insights are computed from your real data — imbalance between time spent and
preparation level, exam-countdown pressure, missed-session recovery, plan
overload, deadline risk, most-productive time of day, and readiness projection.
The chatbot answers "what should I study today?", "I have 3 hours", "I have an
exam in 5 days", "I missed yesterday", explains topics, and generates graded
MCQ quizzes — all grounded in your planner.

---

## Architecture

```
server/
  index.js            zero-dependency HTTP server: static files + REST API
  lib/
    store.js          JSON-file persistence with debounced atomic writes
    auth.js           scrypt-style salted hashing (timing-safe), tokens, validation
    ai.js             the planner brain (priority, generation, rescheduling, SRS, analytics)
    ai-provider.js    language layer — local engine, or a live LLM if configured
    date-utils.js     timezone-local date/time helpers
    seed.js           realistic first-run demo data
public/
  index.html
  css/styles.css      design system, light + dark themes, fully responsive
  js/
    app.js            bootstrap, hash router, shared session actions
    shell.js          sidebar, topbar, theme toggle, XP widget
    api.js            fetch wrapper with auth + 401 handling
    ui.js             DOM helper, icons, date/format utilities, toasts
    components.js     cards, modals, forms, charts (dependency-free SVG), session cards
    pages/*.js        one module per screen
server/data/db.json   your data (created on first run)
```

### Design decisions

- **Zero dependencies.** Built on Node built-ins only, so it runs anywhere Node
  does — no install step, no supply chain, no build tooling.
- **Planner logic is deterministic and local.** Scheduling never calls out to a
  network. Only the chat language layer is swappable, so your study data stays on
  your machine.
- **Plain ES modules on the frontend**, no bundler, no framework — the browser
  loads the same source files.

### Connecting a real AI model

The scheduler always runs locally. To upgrade only the chat language layer:

```bash
export AI_API_KEY=sk-...
export AI_MODEL=gpt-4o-mini          # optional
export AI_API_URL=https://api.openai.com/v1/chat/completions   # optional
node server/index.js
```

Any OpenAI-compatible endpoint works; adapt `callModel()` in
`server/lib/ai-provider.js` for others. If the call fails, it falls back to the
local engine automatically. `GET /api/ai/status` reports which is active.

---

## API

All routes are under `/api` and require `Authorization: Bearer <token>` except
register, login, demo and ai status.

| Area       | Endpoints                                                                                                                                               |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth       | `POST /auth/register` · `/auth/login` · `/auth/demo` · `/auth/logout` · `GET /auth/me`                                                                  |
| Onboarding | `POST /onboarding`                                                                                                                                      |
| Dashboard  | `GET /dashboard`                                                                                                                                        |
| Plan       | `GET /plan` · `POST /plan/generate` · `POST /plan/reschedule-missed`                                                                                    |
| Sessions   | `GET /sessions` · `PATCH /sessions/:id` · `POST /sessions/:id/status` · `POST /sessions/:id/reschedule`                                                 |
| Subjects   | `GET/POST /subjects` · `PATCH/DELETE /subjects/:id` · `POST /subjects/:id/topics` · `DELETE /subjects/:id/topics/:topic` · `POST /subjects/:id/learned` |
| Tasks      | `GET/POST /tasks` · `PATCH/DELETE /tasks/:id`                                                                                                           |
| Exams      | `GET /exams`                                                                                                                                            |
| Calendar   | `GET /calendar` · `PATCH /calendar/move`                                                                                                                |
| Focus      | `GET /focus` · `GET /focus/history`                                                                                                                     |
| Analytics  | `GET /analytics?days=30`                                                                                                                                |
| Insights   | `GET /insights`                                                                                                                                         |
| Revisions  | `GET /revisions`                                                                                                                                        |
| Study AI   | `POST /ai/ask` · `GET /ai/status` · `POST /ai/quick/:intent`                                                                                            |
| Settings   | `GET /settings` · `PATCH /settings` · `POST /settings/password` · `POST /data/reset` · `DELETE /account`                                                |

---

## Tests

```bash
node test/run.mjs        # boots its own server on a free port, runs everything
npm test                 # same thing (if you have npm)
```

The runner picks a free port, starts the server, waits until it answers,
runs the three suites, then shuts it down — so you don't need a server running
in another terminal, and running the tests twice in a row never collides on a
port.

| Suite               | What it covers                                                                                                                                            |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `test/imports.mjs`  | Every frontend import resolves to a real export (catches the classic "not exported" load-time crash)                                                      |
| `test/e2e.mjs`      | 80 API assertions: auth, validation, priority ordering, plan windows, rescheduling, spaced repetition, CRUD, data isolation, AI intents, settings effects |
| `test/frontend.mjs` | 110 assertions: executes **every page module** against a minimal DOM shim, so a `ReferenceError` on any render path fails the run                         |

Individual suites can be run against an already-running server:

```bash
node test/e2e.mjs                       # defaults to http://127.0.0.1:4173
BASE=http://127.0.0.1:5000/api node test/e2e.mjs
```

There is no browser automation available on this machine, so `frontend.mjs`
replaces it by actually running the real render code in Node and asserting the
output — which catches import errors, undefined variables and broken render
paths that a screenshot would not.

---

## Keyboard shortcuts

`D` dashboard · `P` plan · `S` subjects · `T` tasks · `E` exams · `C` calendar ·
`F` focus · `A` analytics · `I` Study AI

## Security notes

- Passwords are salted and hashed; comparison is timing-safe. Hashes are never returned by the API.
- Every query is scoped by `userId` — the test suite asserts a second account cannot see the first one's data.
- Static file serving is path-traversal guarded.
- Data stays in `server/data/db.json` on your machine. Nothing is sent anywhere unless you configure an AI API key.
