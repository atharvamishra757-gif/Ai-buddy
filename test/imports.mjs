/**
 * Static import/export consistency check across the frontend.
 * Catches the #1 class of frontend break: importing a name a module
 * doesn't actually export (which throws at load time in the browser).
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('public/js');
const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.js')) files.push(p);
  }
})(ROOT);

const exportsOf = new Map();
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const names = new Set();
  // export function x / export async function x / export class x
  for (const m of src.matchAll(/export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  for (const m of src.matchAll(/export\s+class\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  // export const/let/var a = ..., b = ...
  for (const m of src.matchAll(/export\s+(?:const|let|var)\s+([^=;]+)=/g)) {
    for (const part of m[1].split(',')) {
      const n = part.trim().split(/[\s=]/)[0];
      if (n && /^[A-Za-z_$][\w$]*$/.test(n)) names.add(n);
    }
  }
  // export { a, b as c }
  for (const m of src.matchAll(/export\s*\{([^}]+)\}/g)) {
    for (const part of m[1].split(',')) {
      const bits = part.trim().split(/\s+as\s+/);
      const n = (bits[1] || bits[0] || '').trim();
      if (n) names.add(n);
    }
  }
  if (/export\s+default/.test(src)) names.add('default');
  exportsOf.set(f, names);
}

let problems = 0;
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const importRe = /import\s+([^'"]+?)\s+from\s+['"]([^'"]+)['"]/g;
  for (const m of src.matchAll(importRe)) {
    const clause = m[1].trim();
    const spec = m[2];
    if (!spec.startsWith('.')) continue;
    const target = path.resolve(path.dirname(f), spec);
    if (!fs.existsSync(target)) {
      console.log(`MISSING FILE  ${path.relative(ROOT, f)}  ->  ${spec}`);
      problems++;
      continue;
    }
    const avail = exportsOf.get(target);
    if (!avail) continue;

    const named = clause.match(/\{([^}]*)\}/);
    if (!named) continue;
    for (const part of named[1].split(',')) {
      const raw = part.trim();
      if (!raw) continue;
      const name = raw.split(/\s+as\s+/)[0].trim();
      if (!name) continue;
      if (!avail.has(name)) {
        console.log(`MISSING EXPORT  ${path.relative(ROOT, f)}  imports '${name}' from ${spec}`);
        console.log(`               ${path.relative(ROOT, target)} exports: ${[...avail].sort().join(', ')}`);
        problems++;
      }
    }
  }
}

console.log(problems ? `\n${problems} import problem(s)` : '\nAll frontend imports resolve correctly.');
process.exit(problems ? 1 : 0);
