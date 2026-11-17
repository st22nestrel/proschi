// A private X display (Xvfb + openbox) per clip, recorded with ffmpeg's
// x11grab, and the captions bar burnt in under the picture afterwards.
import { spawn } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { sleep } from './env.mjs';

/** Height of the captions bar added under the screen. */
const BAR = 64;
const BAR_COLOR = '1b1b1f';

function freeDisplay() {
  for (let n = 90; n < 200; n++) {
    if (!existsSync(`/tmp/.X11-unix/X${n}`) && !existsSync(`/tmp/.X${n}-lock`)) return n;
  }
  throw new Error('No free X display between :90 and :199');
}

function run(command, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'], ...opts });
    let err = '';
    child.stderr?.on('data', (d) => (err += d));
    child.once('error', reject);
    child.once('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${command} exited ${code}:\n${err.slice(-3000)}`))));
  });
}

/**
 * Starts Xvfb (width × height) with openbox, so windows can be maximised.
 * Returns `{ display, env, stop }`; `env` has DISPLAY set for children.
 */
export async function startDisplay(width, height) {
  const n = freeDisplay();
  const display = `:${n}`;
  const xvfb = spawn('Xvfb', [display, '-screen', '0', `${width}x${height}x24`, '-nolisten', 'tcp'], { stdio: 'ignore', detached: true });
  for (let i = 0; i < 100 && !existsSync(`/tmp/.X11-unix/X${n}`); i++) await sleep(50);
  const env = { ...process.env, DISPLAY: display, GDK_BACKEND: 'x11' };
  delete env.WAYLAND_DISPLAY;
  const wm = spawn('openbox', ['--sm-disable'], { env, stdio: 'ignore', detached: true });
  await sleep(500);
  const stop = () => {
    for (const p of [wm, xvfb]) {
      try {
        process.kill(-p.pid, 'SIGTERM');
      } catch {
        /* gone */
      }
    }
  };
  return { display, env, width, height, stop };
}

/**
 * Records the display to a near-lossless intermediate file. Call `caption()`
 * while it runs; `finish(out)` stops it and writes the final MP4 with the
 * captions in a bar under the picture (no audio).
 */
export function startRecording(screen, rawFile) {
  const { display, width, height } = screen;
  const ffmpeg = spawn(
    'ffmpeg',
    ['-loglevel', 'error', '-y', '-f', 'x11grab', '-draw_mouse', '0', '-framerate', '30', '-video_size', `${width}x${height}`, '-i', `${display}.0`, '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '8', '-pix_fmt', 'yuv444p', rawFile],
    { stdio: ['pipe', 'ignore', 'inherit'] },
  );
  const started = Date.now() + 150; // x11grab's first frame lands a moment after the spawn
  const exited = new Promise((resolve) => ffmpeg.once('exit', resolve));
  const cues = [];
  const now = () => (Date.now() - started) / 1000;

  return {
    /** Shows `text` in the bar from now until the next caption (null clears it). */
    caption(text) {
      const t = Math.max(0, now());
      const last = cues.at(-1);
      if (last && last.end == null) last.end = t;
      if (text) cues.push({ start: t, end: null, text });
      if (text) console.log(`    [${t.toFixed(1)}s] ${text}`);
    },
    async finish(outFile) {
      const end = now();
      const last = cues.at(-1);
      if (last && last.end == null) last.end = end;
      ffmpeg.stdin.end('q');
      await exited;
      const assFile = rawFile.replace(/\.[^.]+$/, '.ass');
      writeFileSync(assFile, ass(cues, width, height + BAR));
      await run('ffmpeg', [
        '-loglevel', 'error', '-y', '-i', rawFile,
        '-vf', `pad=${width}:${height + BAR}:0:0:color=0x${BAR_COLOR},subtitles=filename=${assFile}`,
        '-c:v', 'libx264', '-preset', 'slow', '-crf', '23', '-tune', 'stillimage', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', outFile,
      ]);
      return outFile;
    },
    /** Stops without writing an MP4 (on errors). */
    async abort() {
      ffmpeg.stdin.end('q');
      await exited;
    },
  };
}

function assTime(t) {
  const cs = Math.round(t * 100);
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
}

/** Captions as ASS, in pixels of the padded video, centred in the bar. `code` spans (backticks) get a mono font. */
function ass(cues, width, height) {
  const text = (s) =>
    s
      .replace(/[{}]/g, (c) => `\\${c}`)
      .replace(/\n/g, '\\N')
      .replace(/`([^`]+)`/g, '{\\fnDejaVu Sans Mono\\c&H8FE3FF&}$1{\\r}');
  return [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    'WrapStyle: 0',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Bar,DejaVu Sans,${Math.round(BAR * 0.4)},&H00F2F2F2,&H00F2F2F2,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,2,24,24,${Math.round(BAR * 0.27)},1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    ...cues.map((c) => `Dialogue: 0,${assTime(c.start)},${assTime(c.end)},Bar,,0,0,0,,${text(c.text)}`),
    '',
  ].join('\n');
}

/** Runs `body(screen)` on a fresh display and always tears it down. */
export async function onDisplay(width, height, body) {
  const screen = await startDisplay(width, height);
  try {
    return await body(screen);
  } finally {
    screen.stop();
  }
}

