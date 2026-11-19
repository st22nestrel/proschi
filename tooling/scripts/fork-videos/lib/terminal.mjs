// A terminal (Ghostty or GNOME Terminal) on the recorded display, running a
// command through ptyrelay.py so the clip can type into it and wait for what
// it prints.
import { execFileSync, spawn } from 'node:child_process';
import { closeSync, mkdirSync, openSync, readFileSync, rmSync, statSync, writeFileSync, writeSync } from 'node:fs';
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
 * A session bus that offers only GNOME Terminal's server. On the full one its
 * server waits on the desktop portal, which waits on the keyring, and no window
 * shows up on a bare X display.
 */
function terminalBus(workDir) {
  const services = join(workDir, 'dbus-services');
  mkdirSync(services, { recursive: true });
  writeFileSync(join(services, 'org.gnome.Terminal.service'), '[D-BUS Service]\nName=org.gnome.Terminal\nExec=/usr/libexec/gnome-terminal-server\n');
  const config = join(workDir, 'dbus-session.conf');
  writeFileSync(
    config,
    `<!DOCTYPE busconfig PUBLIC "-//freedesktop//DTD D-Bus Bus Configuration 1.0//EN" "http://www.freedesktop.org/standards/dbus/1.0/busconfig.dtd">
<busconfig>
  <type>session</type>
  <listen>unix:tmpdir=/tmp</listen>
  <auth>EXTERNAL</auth>
  <servicedir>${services}</servicedir>
  <policy context="default"><allow send_destination="*" eavesdrop="true"/><allow eavesdrop="true"/><allow own="*"/></policy>
</busconfig>
`,
  );
  return config;
}

/**
 * Opens a maximised terminal that runs `command` in `cwd`: `ghostty`
 * (undecorated) or `gnome-terminal` (Ubuntu's, with its default profile and
 * header bar). Returns `{ send, type, key, waitFor, waitQuiet, mark, text, close }`.
 */
export async function openTerminal(screen, { app = 'ghostty', cwd, command, args = [], fontSize = 13, zoom = 1, workDir, env }) {
  const keys = join(workDir, 'keys.fifo');
  const log = join(workDir, 'terminal.log');
  rmSync(keys, { force: true });
  rmSync(log, { force: true });
  execFileSync('mkfifo', [keys]);
  const relay = ['python3', join(HERE, 'lib/ptyrelay.py'), keys, log, command, ...args];
  const childEnv = { ...(env ?? screen.env) };
  // Say nothing about the terminal this script runs in; the new one sets its own.
  for (const k of ['TERM_PROGRAM', 'TERM_PROGRAM_VERSION', 'GHOSTTY_RESOURCES_DIR', 'GHOSTTY_BIN_DIR', 'GHOSTTY_SHELL_FEATURES', 'KITTY_WINDOW_ID', 'VTE_VERSION', 'COLORTERM']) delete childEnv[k];
  const proc =
    app === 'gnome-terminal'
      ? spawn(
          'dbus-run-session',
          ['--config-file', terminalBus(workDir), '--', 'gnome-terminal', '--wait', '--maximize', '--hide-menubar', `--zoom=${zoom}`, `--working-directory=${cwd}`, '--', ...relay],
          // No dconf: the stock profile, not yours.
          { cwd, env: { ...childEnv, GSETTINGS_BACKEND: 'memory', NO_AT_BRIDGE: '1' }, stdio: ['ignore', 'ignore', openSync(join(workDir, 'gnome-terminal.log'), 'w')], detached: true },
        )
      : spawn(
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
            '-e', ...relay,
          ],
          { cwd, env: childEnv, stdio: 'ignore', detached: true },
        );
  let exited = false;
  proc.once('exit', () => (exited = true));
  await maximize(screen);
  if (app === 'gnome-terminal') await sleep(1000); // the pty takes the maximised size a moment later

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
        process.kill(-proc.pid, 'SIGTERM');
      } catch {
        /* gone */
      }
    },
  };
  return term;
}
