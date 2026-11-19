#!/usr/bin/env node
// Records the fork's features as silent MP4 clips for the upstream PR.
// See README.md in this folder for what each clip shows and what it needs.
//
//   node tooling/scripts/fork-videos/record.mjs [options] [clip...]
//
//   --diagram <file>   the .proschi file to show (default: $FORK_VIDEOS_DIAGRAM,
//                      else examples/e-commerce.proschi next to this script)
//   --out <dir>        where the MP4s go (default: tooling/scripts/fork-videos/out)
//   --web-url <url>    record the web app from a running server instead of
//                      starting `vite` (e.g. http://127.0.0.1:5173/)
//   --build            run `node build.mjs` in tooling/ first (also done when
//                      tooling/dist is missing)
//   --concat           also join the clips into all.mp4
//   --keep             keep each clip's raw capture and captions (.mkv, .ass)
//   --list             list the clips and exit
//
// With no clip names, records all of them in order.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { onDisplay, startRecording } from './lib/display.mjs';
import { assertBuilt, freshDir, has, HERE, TOOLING } from './lib/env.mjs';

const CLIPS = ['themes', 'sections', 'preview-server', 'vscode', 'claude-plugin', 'claude-plugin-text', 'web-sequence'];
const BASE_NEEDS = ['Xvfb', 'openbox', 'ffmpeg'];

const { values: opts, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    diagram: { type: 'string', default: process.env.FORK_VIDEOS_DIAGRAM ?? join(HERE, 'examples/e-commerce.proschi') },
    out: { type: 'string', default: join(HERE, 'out') },
    'web-url': { type: 'string' },
    build: { type: 'boolean', default: false },
    concat: { type: 'boolean', default: false },
    keep: { type: 'boolean', default: false },
    list: { type: 'boolean', default: false },
  },
});

const modules = Object.fromEntries(await Promise.all(CLIPS.map(async (name) => [name, await import(`./clips/${name}.mjs`)])));

if (opts.list) {
  CLIPS.forEach((name, i) => console.log(`${String(i + 1).padStart(2, '0')} ${name.padEnd(15)} ${modules[name].title}`));
  process.exit(0);
}

const unknown = positionals.filter((p) => !CLIPS.includes(p));
if (unknown.length) {
  console.error(`Unknown clip(s): ${unknown.join(', ')}. Clips: ${CLIPS.join(', ')}`);
  process.exit(2);
}
const chosen = positionals.length ? CLIPS.filter((c) => positionals.includes(c)) : CLIPS;

const diagram = resolve(opts.diagram);
if (!existsSync(diagram)) {
  console.error(`No diagram at ${diagram}`);
  process.exit(2);
}
const missingTools = BASE_NEEDS.filter((t) => !has(t));
if (missingTools.length) {
  console.error(`Missing: ${missingTools.join(', ')} (see README.md)`);
  process.exit(2);
}
if (opts.build || assertBuilt().length) {
  console.log('Building tooling (node build.mjs)…');
  execFileSync(process.execPath, ['build.mjs'], { cwd: TOOLING, stdio: 'inherit' });
}

const outDir = resolve(opts.out);
mkdirSync(outDir, { recursive: true });
const workRoot = join(tmpdir(), 'proschi-fork-videos');
const made = [];
const failed = [];

for (const name of chosen) {
  const clip = modules[name];
  const index = String(CLIPS.indexOf(name) + 1).padStart(2, '0');
  const lacking = (clip.needs ?? []).filter((t) => !has(t));
  if (lacking.length) {
    console.log(`\n${index} ${name}: skipped, needs ${lacking.join(', ')}`);
    continue;
  }
  console.log(`\n${index} ${name}: ${clip.title}`);
  const work = freshDir(workRoot, name);
  const size = clip.size ?? [1600, 900];
  const file = join(outDir, `${index}-${name}.mp4`);
  try {
    await onDisplay(size[0], size[1], async (screen) => {
      let recording;
      let finished;
      const rec = {
        /** Starts the capture; call it once the scene is set up. */
        start() {
          recording ??= startRecording(screen, join(work, 'raw.mkv'));
        },
        caption(text) {
          if (!finished) recording?.caption(text);
        },
        /** Ends the capture before the clip tears its scene down (otherwise it ends when the clip returns). */
        stop() {
          if (!recording) throw new Error('The clip never started recording');
          finished ??= recording.finish(file);
          return finished;
        },
      };
      try {
        await clip.record({ screen, rec, diagram, work, args: { webUrl: opts['web-url'] } });
      } catch (error) {
        if (!finished) await recording?.abort();
        throw error;
      }
      await rec.stop();
    });
    if (opts.keep) console.log(`    raw capture kept in ${work}`);
    else rmSync(join(work, 'raw.mkv'), { force: true });
    console.log(`    → ${file}`);
    made.push(file);
  } catch (error) {
    console.error(`    ✗ ${name} failed: ${error.stack ?? error}`);
    failed.push(name);
  }
}

if (opts.concat && made.length > 1) {
  const list = join(workRoot, 'concat.txt');
  writeFileSync(list, made.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n'));
  const all = join(outDir, 'all.mp4');
  // Clips can differ in size, so scale and pad each to 1600×964 before joining.
  const inputs = made.flatMap((f) => ['-i', f]);
  const scaled = made.map((_, i) => `[${i}:v]scale=1600:964:force_original_aspect_ratio=decrease,pad=1600:964:(ow-iw)/2:(oh-ih)/2:color=0x1b1b1f,setsar=1,fps=30[v${i}]`).join(';');
  const joined = `${made.map((_, i) => `[v${i}]`).join('')}concat=n=${made.length}:v=1:a=0[out]`;
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...inputs, '-filter_complex', `${scaled};${joined}`, '-map', '[out]', '-c:v', 'libx264', '-preset', 'slow', '-crf', '24', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', all], { stdio: 'inherit' });
  console.log(`\nall clips → ${all}`);
}

console.log(`\n${made.length} clip(s) in ${outDir}${failed.length ? `; failed: ${failed.join(', ')}` : ''}`);
process.exit(failed.length ? 1 : 0);
