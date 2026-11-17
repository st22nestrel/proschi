// Ghostty on the recorded display, running a command through ptyrelay.py so
// the clip can type into it and wait for what it prints.
import { execFileSync, spawn } from 'node:child_process';
import { closeSync, openSync, readFileSync, rmSync, statSync, writeSync } from 'node:fs';
import { join } from 'node:path';
import { HERE, sleep } from './env.mjs';

const ANSI = /\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07\x1b]*(?:\x07|\x1b\\)|_[^\x1b]*\x1b\\|P[^\x1b]*\x1b\\|[@-Z\\-_])/g;

/** Fills the screen with the first window that shows up (Ghostty's own --maximize races the window manager). */
export async function maximize(screen, timeout = 15_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const id = execFileSync('wmctrl', ['-l'], { env: screen.env, encoding: 'utf8' }).split('\n')[0]?.split(/\s+/)[0];
    if (id) {
      execFileSync('wmctrl', ['-i', '-r', id, '-b', 'add,maximized_vert,maximized_horz'], { env: screen.env });
      await sleep(800);
      return;
    }
    await sleep(150);
  }
  throw new Error('No window appeared to maximise');
}

/**
 * Opens a maximised, undecorated Ghostty that runs `command` in `cwd`.
 * Returns `{ send, type, waitFor, waitQuiet, close }`.
 */
export async function openTerminal(screen, { cwd, command, args = [], fontSize = 13, workDir, env }) {
  const keys = join(workDir, 'keys.fifo');
  const log = join(workDir, 'terminal.log');
  rmSync(keys, { force: true });
  rmSync(log, { force: true });
  execFileSync('mkfifo', [keys]);
  const ghostty = spawn(
    'ghostty',
    [
      '--gtk-single-instance=false',
      '--config-default-files=false',
      '--window-decoration=none',
      '--maximize=true',
      `--font-size=${fontSize}`,
      '--confirm-close-surface=false',
      '--quit-after-last-window-closed=true',
      '--cursor-style-blink=false',
      '-e', 'python3', join(HERE, 'lib/ptyrelay.py'), keys, log, command, ...args,
    ],
    { cwd, env: env ?? screen.env, stdio: 'ignore', detached: true },
  );
  let exited = false;
  ghostty.once('exit', () => (exited = true));
  await maximize(screen);

  const text = () => {
    try {
      // Cursor moves stand in for spaces and line breaks; then drop the rest.
      return readFileSync(log, 'utf8')
        .replace(/\x1b\[\d*[CG]/g, ' ')
        .replace(/\x1b\[[\d;]*[Hf]/g, '\n')
        .replace(ANSI, '');
    } catch {
      return '';
    }
  };
  const size = () => {
    try {
      return statSync(log).size;
    } catch {
      return 0;
    }
  };
  // Opened read-write so writing never blocks on a missing reader.
  const fd = openSync(keys, 'r+');

  const term = {
    /** Sends raw bytes, as if typed at once. */
    send(bytes) {
      if (exited) throw new Error('The terminal closed');
      writeSync(fd, bytes);
    },
    /** Types `s` a key at a time. */
    async type(s, delay = 60) {
      for (const ch of s) {
        term.send(ch);
        await sleep(delay);
      }
    },
    async key(name, pause = 400) {
      const KEYS = { enter: '\r', esc: '\x1b', tab: '\t', up: '\x1b[A', down: '\x1b[B', right: '\x1b[C', left: '\x1b[D', 'ctrl-c': '\x03' };
      term.send(KEYS[name] ?? name);
      await sleep(pause);
    },
    /** Waits until the output (without escape codes) since `from` matches `re`. */
    async waitFor(re, { timeout = 60_000, from = 0 } = {}) {
      const t0 = Date.now();
      while (Date.now() - t0 < timeout) {
        if (exited) throw new Error(`The terminal closed while waiting for ${re}:\n${text().slice(-1500)}`);
        if (re.test(text().slice(from))) return;
        await sleep(200);
      }
      throw new Error(`Timed out waiting for ${re}; the terminal shows:\n${text().slice(-1500)}`);
    },
    /** Waits until nothing new is printed for `quiet` ms. */
    async waitQuiet(quiet = 1500, timeout = 30_000) {
      const t0 = Date.now();
      let last = size();
      let since = Date.now();
      while (Date.now() - t0 < timeout) {
        await sleep(150);
        const now = size();
        if (now !== last) {
          last = now;
          since = Date.now();
        } else if (Date.now() - since >= quiet) return;
      }
    },
    /** How much has been printed, for `waitFor`'s `from`. */
    mark: () => text().length,
    text,
    async close() {
      try {
        closeSync(fd);
      } catch {
        /* closed */
      }
      try {
        process.kill(-ghostty.pid, 'SIGTERM');
      } catch {
        /* gone */
      }
    },
  };
  return term;
}
