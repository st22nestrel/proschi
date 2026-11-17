# Fork feature videos

Records what this fork adds as short, silent MP4 clips with captions in a bar
under the picture, for the description of the pull request into
[gvart/proschi](https://github.com/gvart/proschi). Each clip runs on its own
virtual X display (Xvfb), so the recordings don't touch your screen and come
out the same on every run. Rerun them after you change anything.

```sh
node tooling/scripts/fork-videos/record.mjs                  # all clips → out/
node tooling/scripts/fork-videos/record.mjs vscode themes    # only these
node tooling/scripts/fork-videos/record.mjs --concat         # also out/all.mp4
node tooling/scripts/fork-videos/record.mjs --list
```

| # | Clip | Shows |
|---|---|---|
| 01 | `themes` | `proschi render --theme sketch-light / sketch-dark / classic` as the `preview-html` page (architecture, scenario picker) and as the `hld-html` document |
| 02 | `sections` | `section "Name" { … }` in use cases: the source next to the sequence SVG, one titled frame per section (and `par`) |
| 03 | `preview-server` | `proschi preview --root <dir>`: the file list and its filter, a file's page, the file dropdown, previous/next, and an edit showing up on reload |
| 04 | `vscode` | The VS Code extension: `section` highlighting, the preview with descriptions and section frames, the `proschi.preview.theme` setting (classic, then sketch-dark under a dark VS Code theme) |
| 05 | `claude-plugin` | The Claude Code plugin in Ghostty: `/proschi view`, the ⇅ Sequence switch (`v`), playing a scenario in it, back to the architecture at the same step, ↓ Inline (`i`) |
| 06 | `web-sequence` | The web app's editor: use case playback switched between the architecture and the sequence view, the shared zoom controls, other scenarios and use cases, the dark theme |

The diagram is [`examples/e-commerce.proschi`](examples/e-commerce.proschi):
sections inside alt branches, a section that wraps alt branches, and `par`
blocks inside sections. Show another one with `--diagram <file>` (or
`FORK_VIDEOS_DIAGRAM`); the `sections` clip expects use cases named
`Create order`, `Get order` and `Cancel order` (`SHOTS` in
`clips/sections.mjs`).

## What it needs

- Linux with `Xvfb`, `openbox`, `wmctrl`, `ffmpeg` (with libx264 and libass)
  and `python3`.
- `npm ci` in `frontend/` (Playwright and Vite) and in `tooling/`. The script
  runs `node build.mjs` in `tooling/` when `tooling/dist` is missing, or with
  `--build`; rerun it with `--build` after you change the CLI, the extension
  or the plugin.
- Google Chrome (`google-chrome`) for the browser clips. Playwright drives the
  installed Chrome (`channel: 'chrome'`), so no `npx playwright install` is
  needed. `FORK_VIDEOS_CHROMIUM=<path>` uses another build instead.
- VS Code (`/usr/share/code/code`; `FORK_VIDEOS_VSCODE=<path>` elsewhere) for
  `vscode`. It runs with a throwaway profile and loads the extension from
  `tooling/vscode` as a development extension, so your own setup isn't used
  or changed.
- Ghostty and a logged-in `claude` for `claude-plugin`. It starts
  `claude --setting-sources local --plugin-dir plugin` in a scratch folder,
  so your installed plugins, hooks and user settings stay out, and
  `CLAUDE_CODE_NO_FLICKER=1` for the fullscreen renderer, which gives the
  pane half the screen. `/proschi view` is handled by the plugin, so no prompt
  reaches the model. The first run accepts the folder trust prompt for
  `$TMPDIR/proschi-fork-videos/claude-plugin/project`.

A clip whose tools are missing is skipped with a message.

## Options

| Option | Does |
|---|---|
| `--diagram <file>` | The `.proschi` file to show |
| `--out <dir>` | Where the MP4s go (default `out/` here, git-ignored) |
| `--web-url <url>` | Record the web app from a server you already run (e.g. `npx vite` in `frontend/`) |
| `--build` | Run `node build.mjs` in `tooling/` first |
| `--concat` | Also join the clips into `all.mp4` (scaled to 1600×964) |
| `--keep` | Keep each clip's raw capture (`$TMPDIR/proschi-fork-videos/<clip>/raw.mkv`) and captions (`raw.ass`) |
| `FORK_VIDEOS_SCALE` | The browser's zoom (default 1.25; the web app uses 1) |

## How it works

- `record.mjs` starts a display per clip (`lib/display.mjs`), runs the clip,
  records the display with ffmpeg's `x11grab` from `rec.start()` to
  `rec.stop()`, then encodes the MP4 (H.264, no audio) with the captions in
  a 64 px bar under the picture. The captions are written as ASS subtitles
  (`` `code` `` in a caption turns monospace).
- Browser clips (`lib/browser.mjs`) run a headed, fullscreen Chrome under
  Playwright on that display.
- `vscode` starts VS Code with `--remote-debugging-port` and drives the
  workbench over CDP with Playwright.
- `claude-plugin` (`lib/terminal.mjs`) runs Ghostty, whose command is
  `lib/ptyrelay.py`: it runs `claude` in a pty, copies its output to a log the
  clip waits on, and passes keys the clip writes to a FIFO, as if typed.

To change what a clip does or says, edit its `clips/<name>.mjs`: the steps
are plain Playwright calls or keys, each with a `rec.caption(…)`.

## Not recorded

- The JetBrains plugin's preview (`preview-html`, its theme setting, use
  case descriptions): recording an IDE needs a licensed or downloaded IDE
  build, and it shows the same page as the `themes` and `preview-server`
  clips.
- The warning when a response is drawn in other section frames than written
  (`proschi check`).
