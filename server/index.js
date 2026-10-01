/**
 * server/index.js — zero-dependency HTTP server.
 *
 * Serves static files from public/ and exposes a REST API under /api.
 * All route logic is kept in this file so there is a single import graph.
 *
 * Run:   node server/index.js
 * Env:   PORT=4173  AI_API_KEY=sk-...  AI_MODEL=gpt-4o-mini  AI_API_URL=...
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT) || 4173;

/* ------------------------------------------------------------------ *
 * Lazy-load modules after store.js has initialised the global DB.
 * ------------------------------------------------------------------ */
import { data, persist, uid, flushSync } from './lib/store.js';
import {
  hashPassword, verifyPassword, createToken, userFromToken, destroyToken,
  publicUser, validateRegistration, newUser, defaultSettings,
} from './lib/auth.js';
import {
  generatePlan, rescheduleMissed, buildContext,
  scoreAllSubjects, analytics, generateInsights, awardXP, BADGES,
  pendingRevisions, scheduleRevisions, markTopicStudied, curriculumFor,
} from './lib/ai.js';
import { seedDemoUser } from './lib/seed.js';
import { aiStatus, handleAsk, handleQuickIntent } from './lib/ai-provider.js';
import { todayKey, addDays, daysBetween, dayOfWeek } from './lib/date-utils.js';

/* ------------------------------------------------------------------ *
 * Static file serving
 * ------------------------------------------------------------------ */

const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
};

function serveStatic(req, res) {
  // Path-traversal guard
  const safePath = path.normalize(req.url.split('?')[0]).replace(/^(\.\.[/\\])+/, '');
  let abs = path.join(PUBLIC, safePath);

  // Default to index.html for SPA routing
  if (!fs.existsSync(abs) || fs.statSync(abs).isDirectory()) {
    abs = path.join(PUBLIC, 'index.html');
  }

  const ext = path.extname(abs);
  const type = MIME[ext] || 'application/octet-stream';
  try {
    const body = fs.readFileSync(abs);
    res.writeHead(200, { 'Content-Type': type });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}

/* ------------------------------------------------------------------ *
 * Request helpers
 * ------------------------------------------------------------------ */

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve(text ? JSON.parse(text) : {});
      } catch {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

function ok(res, body, status = 200) {
  const json = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(json);
}

function err(res, message, status = 400, fields = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: message, fields }));
}

function notFound(res) { err(res, 'Not found', 404); }

function requireAuth(req, res) {
  const auth = req.headers.authorization || '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  const user = userFromToken(token);
  if (!user) {
    err(res, 'Unauthorised. Please sign in again.', 401);
    return null;
  }
  return user;
}

/* ------------------------------------------------------------------ *
 * Dashboard helpers
 * ------------------------------------------------------------------ */

function dashboardData(user) {
  const db = data();
  const today = todayKey();
  const settings = user.settings || defaultSettings();
  const ctx = buildContext(user);
  const ranked = scoreAllSubjects(user, ctx);

  const todaySessions = db.sessions.filter((s) => s.userId === user.id && s.date === today);
  const done = todaySessions.filter((s) => s.status === 'completed').reduce((a, s) => a + s.duration, 0);
  const goalMinutes = (settings.dailyStudyGoalHours || settings.availableHours || 4) * 60;

  // Weekly (7 days from start of this week)
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const dt = new Date();
    dt.setDate(dt.getDate() - dt.getDay() + i);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  });
  const weekly = weekDays.map((d) => ({
    date: d,
    label: d,
    minutes: db.sessions
      .filter((s) => s.userId === user.id && s.date === d && s.status === 'completed')
      .reduce((a, s) => a + s.duration, 0),
    planned: db.sessions
      .filter((s) => s.userId === user.id && s.date === d)
      .reduce((a, s) => a + s.duration, 0),
  }));

  // Upcoming tasks (not completed)
  const tasks = (user.tasks || []).filter((t) => t.status !== 'completed');

  // Upcoming exams
  const exams = examsData(user).exams.filter((e) => e.daysToExam >= 0);

  // Streak
  const streakData = analytics(user, { days: 60 });

  const insights = generateInsights(user, ctx);

  const lp = levelProgress(user);

  return {
    today: {
      date: today,
      dateLabel: new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' }),
      sessions: todaySessions,
      done,
      totalMinutes: todaySessions.reduce((a, s) => a + s.duration, 0),
      goalMinutes,
    },
    weekly,
    subjects: ranked.map((s) => ({
      ...s,
      daysToExam: s.examDate ? daysBetween(today, s.examDate) : null,
    })),
    tasks,
    exams,
    streak: streakData.streak,
    insights,
    levelProgress: lp,
    gamification: user.gamification || { xp: 0, level: 1, badges: [] },
  };
}

function levelProgress(user) {
  const g = user.gamification || { xp: 0, level: 1, badges: [] };
  const level = g.level || 1;
  const xp = g.xp || 0;
  const levelSpan = level * level * 100;
  const prevSpan = (level - 1) * (level - 1) * 100;
  const intoLevel = xp - prevSpan;
  const pct = Math.min(100, Math.round((intoLevel / levelSpan) * 100));
  return { level, xp, percent: pct, levelSpan, intoLevel };
}

function examsData(user) {
  const today = todayKey();
  const ctx = buildContext(user);
  const ranked = scoreAllSubjects(user, ctx);
  const exams = ranked
    .filter((s) => s.examDate)
    .map((s) => {
      const daysToExam = daysBetween(today, s.examDate);
      const preparation = Math.round(s.preparation || 0);
      const gap = 100 - preparation;
      const minutesPerDay = daysToExam > 0 ? Math.max(15, Math.min(150, Math.round((gap / 100) * (s.priorityScore / 100) * 120))) : 0;
      const urgent = daysToExam >= 0 && daysToExam <= 5 && preparation < 65;
      const verdict = preparation >= 65 ? { label: 'On track', tone: 'ok' }
        : daysToExam <= 7 ? { label: 'At risk', tone: 'danger' }
          : daysToExam <= 14 ? { label: 'Needs attention', tone: 'warn' }
            : { label: 'Plan ahead', tone: 'muted' };
      const topics = (s.topicProgress ? Object.keys(s.topicProgress) : []).length;
      const learned = (s.topicProgress ? Object.values(s.topicProgress).filter((t) => t.learned) : []).length;
      const topReason = daysToExam !== null && daysToExam < 14 ? `exam in ${daysToExam} days`
        : preparation < 50 ? `only ${preparation}% prepared`
          : s.difficulty === 'Hard' ? 'subject is Hard'
            : 'general priority';
      return {
        ...s,
        daysToExam,
        preparation,
        minutesPerDay,
        urgent,
        verdict,
        topics,
        learned,
        topReason,
      };
    })
    .sort((a, b) => {
      if (a.daysToExam < 0 && b.daysToExam >= 0) return 1;
      if (b.daysToExam < 0 && a.daysToExam >= 0) return -1;
      return a.daysToExam - b.daysToExam;
    });
  return { exams };
}

function focusData(user) {
  const db = data();
  const sessions = db.sessions.filter((s) => s.userId === user.id && s.status === 'completed');
  const totalFocusMinutes = sessions.reduce((a, s) => a + s.duration, 0);
  const sessionCount = sessions.length;

  // Streak
  const streakData = analytics(user, { days: 60 });

  // By hour
  const byHourMap = {};
  for (const s of sessions) {
    if (!s.startTime) continue;
    const [h] = s.startTime.split(':').map(Number);
    if (!byHourMap[h]) byHourMap[h] = { hour: h, minutes: 0, sessions: 0 };
    byHourMap[h].minutes += s.duration;
    byHourMap[h].sessions++;
  }
  const byHour = Object.values(byHourMap).sort((a, b) => a.hour - b.hour);

  // By type
  const byType = {};
  for (const s of sessions) byType[s.type] = (byType[s.type] || 0) + s.duration;

  // Best streak (days consecutive)
  const daySet = new Set(sessions.map((s) => s.date));
  let bestStreak = 0, cur = 0, prev = null;
  const sorted = [...daySet].sort();
  for (const d of sorted) {
    if (prev && daysBetween(prev, d) === 1) cur++;
    else cur = 1;
    if (cur > bestStreak) bestStreak = cur;
    prev = d;
  }

  const avgSession = sessionCount ? Math.round(totalFocusMinutes / sessionCount) : 0;
  const pomodoro = user.settings?.pomodoro || { focus: 25, shortBreak: 5, longBreak: 10 };

  return {
    settings: { ...pomodoro },
    stats: { totalFocusMinutes, sessionCount, byHour, byType, bestStreak, avgSession, streak: streakData.streak },
    levelProgress: levelProgress(user),
  };
}

/* ------------------------------------------------------------------ *
 * Notification builder
 * ------------------------------------------------------------------ */
function buildNotifications(user) {
  const db = data();
  const today = todayKey();
  const settings = user.settings || defaultSettings();
  const notifSettings = settings.notifications || {};
  const notes = [];

  if (notifSettings.sessions !== false) {
    const planned = db.sessions.filter((s) => s.userId === user.id && s.date === today && s.status === 'planned');
    if (planned.length) {
      notes.push({
        kind: 'session',
        severity: 'info',
        title: `${planned.length} session${planned.length === 1 ? '' : 's'} planned today`,
        message: `You have ${planned.length} study session${planned.length === 1 ? '' : 's'} scheduled. Don't forget to start them!`,
      });
    }
  }

  if (notifSettings.missed !== false) {
    const missed = db.sessions.filter((s) => s.userId === user.id && s.status === 'missed' && daysBetween(s.date, today) <= 3 && daysBetween(s.date, today) >= 0);
    if (missed.length) {
      notes.push({
        kind: 'missed',
        severity: 'warn',
        title: `${missed.length} missed session${missed.length === 1 ? '' : 's'}`,
        message: 'Let the AI redistribute this time so you stay on track.',
      });
    }
  }

  if (notifSettings.exams !== false) {
    const exams = (user.subjects || []).filter((s) => s.examDate && daysBetween(today, s.examDate) >= 0 && daysBetween(today, s.examDate) <= 7);
    for (const e of exams) {
      notes.push({
        kind: 'exam',
        severity: daysBetween(today, e.examDate) <= 3 ? 'critical' : 'warn',
        title: `${e.name} exam in ${daysBetween(today, e.examDate)} days`,
        message: `You're ${e.preparation}% ready. Focus on this today.`,
      });
    }
  }

  if (notifSettings.revision !== false) {
    const revisions = pendingRevisions(user);
    if (revisions.length) {
      notes.push({
        kind: 'revision',
        severity: 'info',
        title: `${revisions.length} revision${revisions.length === 1 ? '' : 's'} due`,
        message: revisions.slice(0, 3).join(', ') + (revisions.length > 3 ? '…' : ''),
      });
    }
  }

  return notes;
}

/* ------------------------------------------------------------------ *
 * Router
 * ------------------------------------------------------------------ */

async function route(req, res) {
  const url = new URL(req.url, `http://localhost`);
  const p = url.pathname;
  const method = req.method;

  // Only handle /api/* routes here
  if (!p.startsWith('/api')) {
    serveStatic(req, res);
    return;
  }

  const api = p.slice(4); // strip /api

  // ---- Public routes ----

  if (api === '/ai/status' && method === 'GET') {
    return ok(res, aiStatus());
  }

  if (api === '/auth/register' && method === 'POST') {
    const body = await readBody(req);
    const errors = validateRegistration(body);
    if (Object.keys(errors).length) return err(res, 'Validation failed', 422, errors);
    const db = data();
    if (db.users.find((u) => u.email === String(body.email).toLowerCase().trim())) {
      return err(res, 'An account with this email already exists.', 409);
    }
    const user = newUser(body);
    db.users.push(user);
    persist();
    const token = createToken(user.id);
    return ok(res, { token, user: publicUser(user) }, 201);
  }

  if (api === '/auth/login' && method === 'POST') {
    const { email, password } = await readBody(req);
    const db = data();
    const user = db.users.find((u) => u.email === String(email || '').toLowerCase().trim());
    if (!user) return err(res, 'No account found with that email.', 401);
    if (!verifyPassword(String(password || ''), user.passwordSalt, user.passwordHash)) {
      return err(res, 'Incorrect password.', 401);
    }
    const token = createToken(user.id);
    return ok(res, { token, user: publicUser(user) });
  }

  if (api === '/auth/demo' && method === 'POST') {
    const db = data();
    let demo = db.users.find((u) => u.isDemo);
    if (!demo) {
      demo = seedDemoUser();
      db.users.push(demo);
      // Seed sessions into the global sessions array
      if (demo._sessions) {
        db.sessions.push(...demo._sessions);
        delete demo._sessions;
      }
      persist();
    }
    const token = createToken(demo.id);
    return ok(res, { token, user: publicUser(demo) });
  }

  // ---- Auth required below ----
  const user = requireAuth(req, res);
  if (!user) return;

  if (api === '/auth/me' && method === 'GET') {
    return ok(res, { user: publicUser(user) });
  }

  if (api === '/auth/logout' && method === 'POST') {
    const auth = req.headers.authorization || '';
    const token = auth.replace(/^Bearer\s+/i, '').trim();
    destroyToken(token);
    return ok(res, { ok: true });
  }

  // ---- Onboarding ----

  if (api === '/onboarding' && method === 'POST') {
    const body = await readBody(req);
    if (body.name) user.name = String(body.name).trim();
    if (body.course) user.course = String(body.course).trim();
    if (body.semester) user.semester = Number(body.semester);
    if (body.settings) {
      user.settings = { ...defaultSettings(), ...user.settings, ...body.settings };
    }
    // Add subjects
    user.subjects = user.subjects || [];
    const COLORS = ['#6366f1', '#06b6d4', '#f59e0b', '#ec4899', '#10b981', '#8b5cf6', '#f97316'];
    let ci = 0;
    for (const sub of (body.subjects || [])) {
      if (!sub.name) continue;
      const existing = user.subjects.find((s) => s.name === sub.name);
      if (!existing) {
        user.subjects.push({
          id: uid('sub'),
          name: String(sub.name).trim(),
          difficulty: sub.difficulty || 'Medium',
          preparation: Number(sub.preparation) || 0,
          priority: Number(sub.priority) || 3,
          examDate: sub.examDate || null,
          color: COLORS[ci++ % COLORS.length],
          topics: [],
          topicProgress: {},
          archived: false,
          createdAt: new Date().toISOString(),
        });
      }
    }
    // Add tasks
    user.tasks = user.tasks || [];
    for (const task of (body.tasks || [])) {
      if (!task.title) continue;
      user.tasks.push({
        id: uid('task'),
        title: String(task.title).trim(),
        type: task.type || 'Assignment',
        dueDate: task.dueDate || null,
        subjectId: task.subjectId || null,
        priority: task.priority || 'medium',
        status: 'pending',
        progress: 0,
        notes: task.notes || '',
        createdAt: new Date().toISOString(),
      });
    }
    user.onboarded = true;
    persist();

    // Generate an initial plan
    const result = generatePlan(user, { horizonDays: 14, replace: true });
    persist();

    return ok(res, { user: publicUser(user), sessionsCreated: result.created?.length || 0 });
  }

  // ---- Dashboard ----

  if (api === '/dashboard' && method === 'GET') {
    return ok(res, dashboardData(user));
  }

  // ---- Subjects ----

  if (api === '/subjects' && method === 'GET') {
    const ctx = buildContext(user);
    const today = todayKey();
    const ranked = scoreAllSubjects(user, ctx).map((s) => ({
      ...s,
      topics: curriculumFor(s),
      daysToExam: s.examDate ? daysBetween(today, s.examDate) : null,
    }));
    return ok(res, { subjects: ranked });
  }

  if (api === '/subjects' && method === 'POST') {
    const body = await readBody(req);
    if (!body.name || String(body.name).trim().length < 2) {
      return err(res, 'Validation failed', 422, { name: 'Subject name must be at least 2 characters.' });
    }
    user.subjects = user.subjects || [];
    const COLORS = ['#6366f1', '#06b6d4', '#f59e0b', '#ec4899', '#10b981', '#8b5cf6', '#f97316'];
    const color = COLORS[user.subjects.length % COLORS.length];
    const subject = {
      id: uid('sub'),
      name: String(body.name).trim(),
      difficulty: body.difficulty || 'Medium',
      preparation: Number(body.preparation) || 0,
      priority: Number(body.priority) || 3,
      examDate: body.examDate || null,
      color: body.color || color,
      topics: body.topics || [],
      topicProgress: {},
      archived: false,
      createdAt: new Date().toISOString(),
    };
    if (subject.preparation < 0 || subject.preparation > 100) {
      return err(res, 'Validation failed', 422, { preparation: 'Must be between 0 and 100.' });
    }
    user.subjects.push(subject);
    persist();
    return ok(res, { subject, suggestion: 'Generate a plan to start scheduling this subject.' }, 201);
  }

  const subjectMatch = api.match(/^\/subjects\/([^/]+)$/);
  if (subjectMatch) {
    const subId = subjectMatch[1];
    const idx = (user.subjects || []).findIndex((s) => s.id === subId);
    if (idx === -1) return notFound(res);

    if (method === 'PATCH') {
      const body = await readBody(req);
      const sub = user.subjects[idx];
      if (body.name !== undefined) sub.name = String(body.name).trim();
      if (body.difficulty !== undefined) sub.difficulty = body.difficulty;
      if (body.preparation !== undefined) sub.preparation = Number(body.preparation);
      if (sub.preparation < 0 || sub.preparation > 100) {
        return err(res, 'Validation failed', 422, { preparation: 'Must be between 0 and 100.' });
      }
      if (body.priority !== undefined) sub.priority = Number(body.priority);
      if (body.examDate !== undefined) sub.examDate = body.examDate || null;
      if (body.color !== undefined) sub.color = body.color;
      sub.updatedAt = new Date().toISOString();
      persist();
      const ctx = buildContext(user);
      const ranked = scoreAllSubjects(user, ctx);
      const enriched = ranked.find((s) => s.id === subId) || sub;
      return ok(res, { subject: enriched, recalculated: true, message: 'Subject updated. Priorities recalculated.' });
    }

    if (method === 'DELETE') {
      user.subjects.splice(idx, 1);
      persist();
      return ok(res, { ok: true });
    }
  }

  const topicMatch = api.match(/^\/subjects\/([^/]+)\/topics$/);
  if (topicMatch && method === 'POST') {
    const subId = topicMatch[1];
    const sub = (user.subjects || []).find((s) => s.id === subId);
    if (!sub) return notFound(res);
    const { topic } = await readBody(req);
    if (!topic) return err(res, 'Topic name required.', 422);
    sub.topics = sub.topics || [];
    if (!sub.topics.includes(topic)) sub.topics.push(topic);
    persist();
    return ok(res, { topics: sub.topics });
  }

  const topicDelMatch = api.match(/^\/subjects\/([^/]+)\/topics\/(.+)$/);
  if (topicDelMatch && method === 'DELETE') {
    const sub = (user.subjects || []).find((s) => s.id === topicDelMatch[1]);
    if (!sub) return notFound(res);
    sub.topics = (sub.topics || []).filter((t) => t !== decodeURIComponent(topicDelMatch[2]));
    persist();
    return ok(res, { topics: sub.topics });
  }

  const learnedMatch = api.match(/^\/subjects\/([^/]+)\/learned$/);
  if (learnedMatch && method === 'POST') {
    const sub = (user.subjects || []).find((s) => s.id === learnedMatch[1]);
    if (!sub) return notFound(res);
    const { topic } = await readBody(req);
    if (!topic) return err(res, 'Topic name required.', 422);
    markTopicStudied(user, sub.id, topic);
    persist();
    return ok(res, { ok: true, revision: sub.topicProgress[topic], topicProgress: sub.topicProgress });
  }

  // ---- Tasks ----

  if (api === '/tasks' && method === 'GET') {
    const tasks = (user.tasks || [])
      .filter((t) => t.status !== 'completed')
      .sort((a, b) => {
        const pa = { high: 3, medium: 2, low: 1 }[a.priority] || 2;
        const pb = { high: 3, medium: 2, low: 1 }[b.priority] || 2;
        return pb - pa;
      });
    return ok(res, { tasks });
  }

  if (api === '/tasks' && method === 'POST') {
    const body = await readBody(req);
    if (!body.title || String(body.title).trim().length < 3) {
      return err(res, 'Validation failed', 422, { title: 'Task title must be at least 3 characters.' });
    }
    const task = {
      id: uid('task'),
      title: String(body.title).trim(),
      type: body.type || 'Assignment',
      dueDate: body.dueDate || null,
      subjectId: body.subjectId || null,
      priority: body.priority || 'medium',
      status: 'pending',
      progress: 0,
      notes: body.notes || '',
      createdAt: new Date().toISOString(),
    };
    user.tasks = user.tasks || [];
    user.tasks.push(task);
    persist();
    return ok(res, { task }, 201);
  }

  const taskMatch = api.match(/^\/tasks\/([^/]+)$/);
  if (taskMatch) {
    const taskId = taskMatch[1];
    const idx = (user.tasks || []).findIndex((t) => t.id === taskId);
    if (idx === -1) return notFound(res);

    if (method === 'PATCH') {
      const body = await readBody(req);
      const task = user.tasks[idx];
      if (body.title !== undefined) task.title = String(body.title).trim();
      if (body.type !== undefined) task.type = body.type;
      if (body.dueDate !== undefined) task.dueDate = body.dueDate || null;
      if (body.subjectId !== undefined) task.subjectId = body.subjectId || null;
      if (body.priority !== undefined) task.priority = body.priority;
      if (body.status !== undefined) {
        task.status = body.status;
        if (body.status === 'completed') task.completedAt = new Date().toISOString();
      }
      if (body.progress !== undefined) {
        task.progress = Number(body.progress);
        if (task.progress >= 100) {
          task.progress = 100;
          task.status = 'completed';
          task.completedAt = new Date().toISOString();
        }
      }
      if (body.notes !== undefined) task.notes = body.notes;
      persist();
      return ok(res, { task });
    }

    if (method === 'DELETE') {
      user.tasks.splice(idx, 1);
      persist();
      return ok(res, { ok: true });
    }
  }

  // ---- Exams ----

  if (api === '/exams' && method === 'GET') {
    return ok(res, examsData(user));
  }

  // ---- Plan ----

  if (api === '/plan' && method === 'GET') {
    const db = data();
    const from = url.searchParams.get('from') || todayKey();
    const days = Math.min(60, Number(url.searchParams.get('days')) || 14);
    const sessions = db.sessions
      .filter((s) => s.userId === user.id && s.date >= from && s.date <= addDays(from, days - 1))
      .sort((a, b) => (a.date + (a.startTime || '')).localeCompare(b.date + (b.startTime || '')));

    const plan = {};
    for (const s of sessions) {
      if (!plan[s.date]) plan[s.date] = [];
      plan[s.date].push(s);
    }
    const ranked = scoreAllSubjects(user, buildContext(user)).map((s) => ({
      ...s,
      daysToExam: s.examDate ? daysBetween(todayKey(), s.examDate) : null,
    }));
    return ok(res, { plan, ranked, from, days });
  }

  if (api === '/plan/generate' && method === 'POST') {
    const body = await readBody(req);
    const result = generatePlan(user, {
      fromDay: body.fromDay || todayKey(),
      horizonDays: Number(body.horizonDays) || 14,
      replace: Boolean(body.replace),
    });
    persist();
    return ok(res, { created: result.created?.length || 0, message: 'Plan generated.' });
  }

  if (api === '/plan/reschedule-missed' && method === 'POST') {
    const db = data();
    const today = todayKey();
    const missed = db.sessions.filter(
      (s) => s.userId === user.id && s.status === 'missed' && s.date >= addDays(today, -7)
    );
    const results = [];
    for (const s of missed) {
      const r = rescheduleMissed(user, s.id);
      if (r.ok) results.push(r);
    }
    persist();
    const count = results.length;
    return ok(res, {
      message: count
        ? `Redistributed ${count} missed session${count === 1 ? '' : 's'} across the coming days.`
        : 'No missed sessions to reschedule.',
      redistributed: results.flatMap((r) => r.redistributed || []),
    });
  }

  // ---- Sessions ----

  if (api === '/sessions' && method === 'GET') {
    const db = data();
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    let sessions = db.sessions.filter((s) => s.userId === user.id);
    if (from) sessions = sessions.filter((s) => s.date >= from);
    if (to) sessions = sessions.filter((s) => s.date <= to);
    sessions.sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
    return ok(res, { sessions });
  }

  const sessionPatchMatch = api.match(/^\/sessions\/([^/]+)$/);
  if (sessionPatchMatch && method === 'PATCH') {
    const db = data();
    const sId = sessionPatchMatch[1];
    const session = db.sessions.find((s) => s.id === sId && s.userId === user.id);
    if (!session) return notFound(res);
    const body = await readBody(req);
    if (body.topic !== undefined) session.topic = body.topic;
    if (body.objective !== undefined) session.objective = body.objective;
    if (body.duration !== undefined) {
      const duration = Number(body.duration);
      if (!Number.isFinite(duration) || duration < 5 || duration > 240) {
        return err(res, 'Validation failed', 422, { duration: 'Must be between 5 and 240 minutes.' });
      }
      session.duration = duration;
    }
    if (body.date !== undefined) session.date = body.date;
    if (body.type !== undefined) session.type = body.type;
    if (body.notes !== undefined) session.notes = body.notes;
    session.updatedAt = new Date().toISOString();
    persist();
    return ok(res, { session });
  }

  const sessionStatusMatch = api.match(/^\/sessions\/([^/]+)\/status$/);
  if (sessionStatusMatch && method === 'POST') {
    const db = data();
    const sId = sessionStatusMatch[1];
    const session = db.sessions.find((s) => s.id === sId && s.userId === user.id);
    if (!session) return notFound(res);
    const body = await readBody(req);
    if (!['planned', 'in_progress', 'completed', 'skipped', 'missed'].includes(body.status)) {
      return err(res, 'Validation failed', 422, { status: 'Invalid session status.' });
    }
    const prevStatus = session.status;
    session.status = body.status;
    session.updatedAt = new Date().toISOString();
    if (body.notes !== undefined) session.notes = body.notes;
    if (body.accomplished !== undefined) session.accomplished = body.accomplished;

    let xpResult = null;
    let badges = [];
    let streak = 0;

    if (body.status === 'completed' && prevStatus !== 'completed') {
      const xp = Math.round(session.duration / 5);
      const result = awardXP(user, { amount: xp, reason: 'session completed' });
      xpResult = result;
      badges = result.newBadges || [];
      // Calculate streak
      const today = todayKey();
      const completedDays = new Set(
        db.sessions
          .filter((s) => s.userId === user.id && s.status === 'completed')
          .map((s) => s.date)
      );
      let s2 = 0;
      let d = today;
      while (completedDays.has(d)) {
        s2++;
        d = addDays(d, -1);
      }
      streak = s2;
      persist();
    }

    if (body.status === 'in_progress') {
      persist();
    }

    return ok(res, {
      session,
      xp: xpResult,
      badges,
      streak,
    });
  }

  const sessionRescheduleMatch = api.match(/^\/sessions\/([^/]+)\/reschedule$/);
  if (sessionRescheduleMatch && method === 'POST') {
    const sId = sessionRescheduleMatch[1];
    const result = rescheduleMissed(user, sId);
    persist();
    return ok(res, result);
  }

  // ---- Calendar ----

  if (api === '/calendar' && method === 'GET') {
    const db = data();
    const from = url.searchParams.get('from') || todayKey();
    const months = Number(url.searchParams.get('months')) || 1;
    const to = addDays(from, months * 31);
    const sessions = db.sessions
      .filter((s) => s.userId === user.id && s.date >= from && s.date <= to)
      .sort((a, b) => a.date.localeCompare(b.date));
    const tasks = (user.tasks || []).filter((t) => t.dueDate && t.dueDate >= from && t.dueDate <= to);
    const exams = (user.subjects || []).filter((s) => s.examDate && s.examDate >= from && s.examDate <= to);
    const events = [
      ...sessions.map((s) => ({
        id: s.id,
        kind: 'session',
        date: s.date,
        time: s.startTime,
        duration: s.duration,
        status: s.status,
        title: `${s.subjectName} · ${s.topic}`,
        color: s.color || 'var(--brand)',
      })),
      ...tasks.map((t) => ({
        id: t.id,
        kind: 'deadline',
        date: t.dueDate,
        title: t.title,
        color: 'var(--warn)',
      })),
      ...exams.map((s) => ({
        id: `exam-${s.id}`,
        kind: 'exam',
        date: s.examDate,
        title: `${s.name} exam`,
        color: 'var(--danger)',
      })),
    ];
    return ok(res, { events, sessions, tasks, exams });
  }

  if (api === '/calendar/move' && method === 'PATCH') {
    const db = data();
    const body = await readBody(req);
    const sessionId = body.sessionId || body.id;
    const newDate = body.newDate || body.date;
    const session = db.sessions.find((s) => s.id === sessionId && s.userId === user.id);
    if (!session) return notFound(res);
    session.date = newDate;
    session.rescheduled = true;
    persist();
    return ok(res, { session });
  }

  // ---- Focus ----

  if (api === '/focus' && method === 'GET') {
    return ok(res, focusData(user));
  }

  if (api === '/focus/history' && method === 'GET') {
    const db = data();
    const days = Number(url.searchParams.get('days')) || 14;
    const from = addDays(todayKey(), -days);
    const sessions = db.sessions
      .filter((s) => s.userId === user.id && s.status === 'completed' && s.date >= from)
      .sort((a, b) => a.date.localeCompare(b.date));
    return ok(res, { sessions });
  }

  // ---- Analytics ----

  if (api === '/analytics' && method === 'GET') {
    const days = Number(url.searchParams.get('days')) || 30;
    const result = analytics(user, { days });
    return ok(res, result);
  }

  // ---- Insights ----

  if (api === '/insights' && method === 'GET') {
    const ctx = buildContext(user);
    const insights = generateInsights(user, ctx);
    return ok(res, { insights });
  }

  // ---- Revisions ----

  if (api === '/revisions' && method === 'GET') {
    const revisions = pendingRevisions(user);
    return ok(res, { revisions });
  }

  // ---- Notifications ----

  if (api === '/notifications' && method === 'GET') {
    const notifications = buildNotifications(user);
    return ok(res, { notifications });
  }

  // ---- AI ----

  if (api === '/ai/ask' && method === 'POST') {
    const body = await readBody(req);
    try {
      const result = await handleAsk(user, body.message || '', body.context || {});
      return ok(res, result);
    } catch (error) {
      return err(res, error.message, error.status || 500);
    }
  }

  if (api.startsWith('/ai/quick/') && method === 'POST') {
    const intent = api.slice('/ai/quick/'.length);
    const body = await readBody(req);
    try {
      const result = await handleQuickIntent(user, intent, body);
      return ok(res, result);
    } catch (error) {
      return err(res, error.message, error.status || 500);
    }
  }

  // ---- Settings ----

  if (api === '/settings' && method === 'GET') {
    const ctx = buildContext(user);
    return ok(res, {
      settings: user.settings || defaultSettings(),
      account: {
        name: user.name,
        email: user.email,
        course: user.course,
        semester: user.semester,
      },
      gamification: user.gamification || { xp: 0, level: 1, badges: [] },
      badges: BADGES,
      ai: aiStatus(),
    });
  }

  if (api === '/settings' && method === 'PATCH') {
    const body = await readBody(req);
    const s = user.settings || defaultSettings();
    const requestedHours = body.availableHours ?? body.availability;

    if (requestedHours !== undefined) {
      const h = Number(requestedHours);
      if (h < 1 || h > 12) return err(res, 'Validation failed', 422, { availability: 'Must be between 1 and 12 hours.', availableHours: 'Must be between 1 and 12 hours.' });
      s.availableHours = h;
    }
    if (body.preferredTime !== undefined) {
      if (!['Morning', 'Afternoon', 'Evening', 'Night'].includes(body.preferredTime)) {
        return err(res, 'Validation failed', 422, { preferredTime: 'Choose a supported study window.' });
      }
      s.preferredTime = body.preferredTime;
    }
    if (body.holidays !== undefined) s.holidays = body.holidays;
    if (body.dailyGoalHours !== undefined) s.dailyStudyGoalHours = Number(body.dailyGoalHours);
    if (body.targetGpa !== undefined) s.targetGpa = Number(body.targetGpa);
    if (body.pomodoro !== undefined) s.pomodoro = { ...s.pomodoro, ...body.pomodoro };
    if (body.notifications !== undefined) s.notifications = { ...(s.notifications || {}), ...body.notifications };
    if (body.name !== undefined) user.name = String(body.name).trim();
    if (body.course !== undefined) user.course = String(body.course).trim();
    if (body.semester !== undefined) user.semester = Number(body.semester);
    if (body.preferences) {
      user.preferences = { ...(user.preferences || {}), ...body.preferences };
    }

    user.settings = s;
    persist();

    const regenRecommended = requestedHours !== undefined || body.preferredTime !== undefined || body.holidays !== undefined;
    return ok(res, { settings: s, message: 'Settings saved.', regenRecommended });
  }

  if (api === '/settings/password' && method === 'POST') {
    const { current, new: newPwd } = await readBody(req);
    if (user.passwordHash && !verifyPassword(String(current || ''), user.passwordSalt, user.passwordHash)) {
      return err(res, 'Current password is incorrect.', 422, { current: 'Current password is incorrect.' });
    }
    if (!newPwd || String(newPwd).length < 6) {
      return err(res, 'Validation failed', 422, { new: 'New password must be at least 6 characters.' });
    }
    const { salt, hash } = hashPassword(String(newPwd));
    user.passwordSalt = salt;
    user.passwordHash = hash;
    persist();
    return ok(res, { message: 'Password updated.' });
  }

  if (api === '/data/reset' && method === 'POST') {
    const db = data();
    user.subjects = [];
    user.tasks = [];
    user.gamification = { xp: 0, level: 1, badges: [] };
    user.onboarded = false;
    db.sessions = db.sessions.filter((s) => s.userId !== user.id);
    persist();
    return ok(res, { ok: true });
  }

  if (api === '/account' && method === 'DELETE') {
    const db = data();
    db.users = db.users.filter((u) => u.id !== user.id);
    db.sessions = db.sessions.filter((s) => s.userId !== user.id);
    // Remove tokens
    for (const [tok, entry] of Object.entries(db.tokens || {})) {
      if (entry.userId === user.id) delete db.tokens[tok];
    }
    persist();
    return ok(res, { ok: true });
  }

  notFound(res);
}

/* ------------------------------------------------------------------ *
 * Boot
 * ------------------------------------------------------------------ */

export async function handleRequest(req, res) {
  // CORS headers (useful when running tests against a separate port)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  try {
    await route(req, res);
  } catch (e) {
    console.error('[server]', req.method, req.url, e);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  const server = http.createServer(handleRequest);
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Study AI server running at http://localhost:${PORT}`);
  });

  process.on('SIGTERM', () => { flushSync(); process.exit(0); });
  process.on('SIGINT', () => { flushSync(); process.exit(0); });
}
