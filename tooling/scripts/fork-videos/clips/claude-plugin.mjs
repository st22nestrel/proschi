// The Claude Code plugin in Ghostty (pictures): /proschi view, the player's
// sequence view switch (v), playing a scenario in it, and ↓ Inline (i).
//
// It runs your `claude` with this repo's plugin (--plugin-dir) and only the
// local settings of a scratch folder, so your installed plugins and hooks
// stay out. `/proschi view` is handled by the plugin; no prompt goes to the
// model.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { openTerminal } from '../lib/terminal.mjs';
import { PLUGIN, sleep, withoutClaudeSession } from '../lib/env.mjs';

export const title = 'Claude Code plugin in Ghostty: sequence view and the inline switch';
export const needs = ['ghostty', 'claude', 'python3', 'wmctrl'];
export const size = [1920, 1080];

export const record = (ctx) =>
  recordPlugin(ctx, {
    terminal: { app: 'ghostty', fontSize: 12 },
    intro: "Claude Code with the fork's plugin, in Ghostty (pictures)",
    // ctrl+x as the kitty keyboard protocol sends it (Claude Code turns the protocol on there).
    ctrlX: '\x1b[120;5u',
  });

/**
 * The plugin's steps in any terminal. `terminal` goes to openTerminal; `ctrlX`
 * is how that terminal sends ctrl+x; `options` are the plugin's userConfig.
 */
export async function recordPlugin({ screen, rec, diagram, work }, { terminal, intro, ctrlX, options }) {
  const FOCUS_PANE = [ctrlX, '\t'];
  const folder = join(work, 'project');
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, 'e-commerce.proschi'), readFileSync(diagram, 'utf8'));
  // Plugin options are read from user, --settings or managed settings only; a --plugin-dir plugin is `proschi@inline`.
  const settings = join(work, 'settings.json');
  writeFileSync(settings, JSON.stringify({ pluginConfigs: { 'proschi@inline': { options: options ?? {} } } }, null, 2));

  const term = await openTerminal(screen, {
    cwd: folder,
    workDir: work,
    ...terminal,
    command: 'claude',
    args: ['--setting-sources', 'local', '--settings', settings, '--plugin-dir', PLUGIN],
    // The fullscreen renderer gives the pane its own half of the screen.
    env: { ...withoutClaudeSession(screen.env), CLAUDE_CODE_NO_FLICKER: '1' },
  });
  /** Waits for the pane's picture to finish drawing (nothing printed for a while), then lets it show for `view` ms. */
  const settle = async (view) => {
    await sleep(400);
    await term.waitQuiet(1200, 20_000);
    await sleep(view);
  };
  try {
    await term.waitFor(/trust this folder|for shortcuts|auto mode|\?\s*for/i, { timeout: 60_000 });
    if (/trust this folder/i.test(term.text())) {
      await term.waitQuiet(1500);
      const from = term.mark();
      await term.key('down', 300);
      await term.waitFor(/❯\s*Yes, I trust/, { from, timeout: 5_000 });
      await term.key('enter', 1000);
    }
    await term.waitQuiet(2000);

    rec.start();
    rec.caption(intro);
    await sleep(1500);
    await term.type('/proschi view e-commerce.proschi', 55);
    await sleep(600);
    await term.key('enter', 0);
    await sleep(1500);
    await term.waitQuiet(2500, 30_000);
    await sleep(1500);

    rec.caption('`ctrl+x tab` focuses the pane; its keys drive the player');
    for (const k of FOCUS_PANE) await term.key(k, 150);
    await settle(2500);

    rec.caption('New: `v` (⇅ Sequence) swaps the architecture for the scenario\'s sequence diagram');
    await term.key('v', 0);
    await settle(3000);
    rec.caption('Its sections and par get titled frames');
    await sleep(3000);

    rec.caption('`p` plays it: the step\'s calls are lit, the participants outlined, the rest faded');
    await term.key('p', 0);
    await sleep(12_000);
    await term.key('p', 0); // pause, so the switch below happens at a known step
    await settle(1500);

    rec.caption('`b` / `n` step back and forth');
    for (const k of ['b', 'b', 'n']) {
      await term.key(k, 0);
      await settle(1500);
    }

    rec.caption('`v` again: back to the architecture, at the same step');
    await term.key('v', 0);
    await settle(3500);
    await term.key('n', 0);
    await settle(2500);

    rec.caption('`v` once more, then `i` (↓ Inline) moves the drawing into the transcript');
    await term.key('v', 0);
    await settle(2500);
    await term.key('i', 0);
    await settle(4000);
    await rec.stop();
  } finally {
    // Leave Claude Code cleanly so the session isn't left half-open.
    try {
      await term.key('ctrl-c', 300);
      await term.key('ctrl-c', 800);
    } catch {
      /* already closed */
    }
    await term.close();
  }
}
