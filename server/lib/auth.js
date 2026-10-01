import crypto from 'node:crypto';
import { data, persist, uid } from './store.js';

const KEY = 'sha256';

export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.createHash(KEY).update(`${salt}:${password}`).digest('hex');
  return { salt, hash };
}

export function verifyPassword(password, salt, hash) {
  const attempt = crypto.createHash(KEY).update(`${salt}:${password}`).digest('hex');
  const a = Buffer.from(attempt, 'hex');
  const b = Buffer.from(hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** In-memory token -> userId map (tokens also persisted so restarts don't log you out). */
export function createToken(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  data().tokens = data().tokens || {};
  data().tokens[token] = { userId, createdAt: Date.now() };
  persist();
  return token;
}

export function userFromToken(token) {
  if (!token) return null;
  const db = data();
  const entry = (db.tokens || {})[token];
  if (!entry) return null;
  return db.users.find((u) => u.id === entry.userId) || null;
}

export function destroyToken(token) {
  const db = data();
  if (db.tokens && db.tokens[token]) {
    delete db.tokens[token];
    persist();
  }
}

export function publicUser(user) {
  if (!user) return null;
  const { passwordHash, passwordSalt, ...rest } = user;
  return { ...rest, hasPassword: Boolean(passwordHash) };
}

/* --------------------------- validation --------------------------- */

export function validateRegistration({ name, email, password }) {
  const errors = {};
  if (!name || String(name).trim().length < 2) errors.name = 'Please enter your full name (min 2 characters).';
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email))) errors.email = 'Enter a valid email address.';
  if (!password || String(password).length < 6) errors.password = 'Password must be at least 6 characters.';
  return errors;
}

export function newUser({ name, email, password, course, semester }) {
  const { salt, hash } = hashPassword(password);
  return {
    id: uid('u'),
    name: String(name).trim(),
    email: String(email).trim().toLowerCase(),
    passwordHash: hash,
    passwordSalt: salt,
    course: course || 'Undeclared',
    semester: semester || 1,
    onboarded: false,
    settings: defaultSettings(),
    profile: null,
    gamification: { xp: 0, level: 1, badges: [], dailyGoalXP: 100 },
    preferences: { theme: 'dark' },
    createdAt: new Date().toISOString(),
  };
}

export function defaultSettings() {
  return {
    availableHours: 4,
    preferredTime: 'Evening',
    holidays: [0],
    targetGpa: 8.5,
    dailyStudyGoalHours: 4,
    pomodoro: { focus: 25, shortBreak: 5, longBreak: 10 },
    notifications: { sessions: true, exams: true, deadlines: true, missed: true, revision: true },
  };
}
