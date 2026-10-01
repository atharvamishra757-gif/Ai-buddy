#!/usr/bin/env node
/**
 * Zero-dependency test runner.
 *
 * `npm` is not installed on every machine, so this runs the whole suite with
 * plain `node`: it boots the server on a free port, waits for it to be ready,
 * runs the three suites, then shuts the server down.
 *
 * Usage:  node test/run.mjs
 */
import { spawn } from "node:child_process";
import path from "node:path";
import net from "node:net";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

const SUITES = [
  {
    name: "imports  (frontend import/export consistency)",
    file: "imports.mjs",
    needsServer: false,
  },
  {
    name: "e2e       (API + planner logic)",
    file: "e2e.mjs",
    needsServer: true,
  },
  {
    name: "frontend  (every page module renders)",
    file: "frontend.mjs",
    needsServer: true,
  },
];

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

async function waitForServer(url, timeoutMs = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(`${url}/api/ai/status`);
      if (res.ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

function run(file, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(__dirname, file)], {
      cwd: ROOT,
      env: { ...process.env, ...env },
      stdio: "inherit",
    });
    child.on("close", (code) => resolve(code ?? 1));
  });
}

function banner(text) {
  console.log(`\n\x1b[1m${text}\x1b[0m`);
  console.log("─".repeat(text.length));
}

const port = await freePort();
const base = `http://127.0.0.1:${port}`;

console.log(`\x1b[1mStudy AI — test suite\x1b[0m  (port ${port})`);

banner("Starting server");
const server = spawn(
  process.execPath,
  [path.join(ROOT, "server", "index.js")],
  {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let serverLog = "";
server.stdout.on("data", (d) => {
  serverLog += d;
});
server.stderr.on("data", (d) => {
  serverLog += d;
});

const up = await waitForServer(base);
if (!up) {
  console.error("\x1b[31mServer failed to start.\x1b[0m");
  console.error(serverLog);
  server.kill("SIGKILL");
  process.exit(1);
}
console.log(`  ready at ${base}`);

// Test suites expect BASE to point at the API root (…/api).
const env = { BASE: `${base}/api`, PORT: String(port) };
let failed = 0;

try {
  for (const suite of SUITES) {
    banner(suite.name);
    const code = await run(suite.file, env);
    if (code !== 0) failed++;
  }
} finally {
  server.kill("SIGKILL");
}

banner(
  failed
    ? `\x1b[31m${failed} suite(s) failed\x1b[0m`
    : "\x1b[32mAll suites passed\x1b[0m",
);
process.exit(failed ? 1 : 0);
