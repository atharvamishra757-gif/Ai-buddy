/**
 * store.js — JSON-file persistence with debounced atomic writes.
 *
 * The entire DB is kept in memory as `globalThis.__STUDY_DB__` and flushed
 * to disk at most once per second.  This keeps reads instant and prevents
 * write storms when many fields update in quick succession.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');

/* ------------------------------------------------------------------ *
 * Blank-slate structure
 * ------------------------------------------------------------------ */
function emptyDb() {
  return {
    users: [],
    sessions: [],
    tokens: {},
    _version: 1,
  };
}

/* ------------------------------------------------------------------ *
 * Bootstrap — read from disk if it exists, otherwise start empty
 * ------------------------------------------------------------------ */
function loadDb() {
  try {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    if (fs.existsSync(DB_PATH)) {
      const raw = fs.readFileSync(DB_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      // Ensure required top-level arrays exist (backwards compat)
      return {
        users: [],
        sessions: [],
        tokens: {},
        _version: 1,
        ...parsed,
      };
    }
  } catch (err) {
    console.warn('[store] Could not read db.json — starting with empty DB:', err.message);
  }
  return emptyDb();
}

// Expose the live DB as a global so every module can reach it without
// circular imports — the same pattern used throughout ai.js / ai-provider.js.
globalThis.__STUDY_DB__ = loadDb();

/* ------------------------------------------------------------------ *
 * Debounced write
 * ------------------------------------------------------------------ */
let _timer = null;

export function persist() {
  clearTimeout(_timer);
  _timer = setTimeout(_flush, 800);
}

function _flush() {
  _timer = null;
  const tmp = DB_PATH + '.tmp';
  try {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    const json = JSON.stringify(globalThis.__STUDY_DB__, null, 2);
    fs.writeFileSync(tmp, json, 'utf8');
    fs.renameSync(tmp, DB_PATH);
  } catch (err) {
    console.error('[store] Failed to persist db.json:', err.message);
  }
}

/** Flush synchronously — call on clean shutdown. */
export function flushSync() {
  clearTimeout(_timer);
  _flush();
}

/* ------------------------------------------------------------------ *
 * Accessor — always returns the live object
 * ------------------------------------------------------------------ */
export function data() {
  return globalThis.__STUDY_DB__;
}

/* ------------------------------------------------------------------ *
 * UID generator — collision-resistant, URL-safe
 * ------------------------------------------------------------------ */
export function uid(prefix = 'id') {
  return `${prefix}_${crypto.randomBytes(9).toString('base64url')}`;
}
