// Paths and small helpers the clips share.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const HERE = fileURLToPath(new URL('..', import.meta.url));
export const REPO = fileURLToPath(new URL('../../../../', import.meta.url));
export const TOOLING = join(REPO, 'tooling');
export const FRONTEND = join(REPO, 'frontend');
export const PLUGIN = join(REPO, 'plugin');
export const CLI = join(TOOLING, 'dist/cli.cjs');

/** Playwright and lz-string come from frontend/node_modules (`npm ci` in frontend/). */
export const frontendRequire = createRequire(join(FRONTEND, 'package.json'));

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function has(command) {
  try {
    execFileSync('sh', ['-c', `command -v ${command}`], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** A clean directory for one clip's inputs. */
export function freshDir(...parts) {
  const dir = join(...parts);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Runs the fork's CLI (tooling/dist/cli.cjs). */
export function proschi(...args) {
  return execFileSync(process.execPath, [CLI, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
}

export function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

/**
 * Starts a long-running process and resolves once a line of its output
 * matches `ready` (the match is returned). `stop()` kills its whole group.
 */
export function startProcess(command, args, { cwd, env, ready, timeout = 60_000, log } = {}) {
  const child = spawn(command, args, { cwd, env: { ...process.env, ...env }, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const stop = () => {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      /* already gone */
    }
  };
  const matched = new Promise((resolve, reject) => {
    if (!ready) return resolve(null);
    let seen = '';
    const timer = setTimeout(() => reject(new Error(`${command} did not get ready in ${timeout} ms:\n${seen.slice(-2000)}`)), timeout);
    const onData = (chunk) => {
      seen += chunk;
      if (log) process.stderr.write(chunk);
      const m = ready.exec(seen);
      if (m) {
        clearTimeout(timer);
        resolve(m);
      }
    };
    child.stdout.setEncoding('utf8').on('data', onData);
    child.stderr.setEncoding('utf8').on('data', onData);
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`${command} exited (${code}) before it was ready:\n${seen.slice(-2000)}`));
    });
  });
  return { child, stop, ready: matched };
}

export function assertBuilt() {
  const missing = [CLI, join(TOOLING, 'vscode/dist/extension.cjs'), join(PLUGIN, 'hooks/register.js')].filter((f) => !existsSync(f));
  return missing;
}

/**
 * The environment without the markers of a Claude Code session this script
 * may itself run in (they would make the recorded `claude` a child session,
 * load other plugin dirs, or skip saving its transcript). Auth and provider
 * variables stay.
 */
export function withoutClaudeSession(env) {
  const out = { ...env };
  for (const key of Object.keys(out)) {
    if (/^(CLAUDECODE|CLAUDE_PID|CLAUDE_EFFORT|AI_AGENT)$/.test(key)) delete out[key];
    else if (key.startsWith('CLAUDE_CODE_') && !/USE_|OAUTH|API_KEY|_BASE_URL/.test(key)) delete out[key];
  }
  return out;
}
