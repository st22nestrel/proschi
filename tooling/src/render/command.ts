import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { displayPath, parseFile } from '../imports';
import { analyze } from '../../../frontend/src/sim/analyze';
import type { ParseResult } from '../proschi';
import { applyView, idList, viewError, viewOverlay, type SystemsView } from '../terminal/systems';
import { FORMATS, renderFiles, type RenderFormat } from './index';
import type { RenderTheme } from './theme';
import { themeFlagAt, themeFor } from './themeConfig';

export { previewCommand } from './serve';

/**
 * `proschi render`: parses `<file>`, refuses on errors, and writes the files
 * of the chosen format. Systems are drawn collapsed unless `--expand` opens
 * them; `--focus` draws one system's team design alone. `--theme` picks the
 * look, else the `"theme"` of the nearest proschi.json, else sketch.
 */
export async function renderCommand(args: string[], out: (s: string) => void, err: (s: string) => void, usage: string): Promise<number> {
  let dir = '.';
  let format: RenderFormat = 'svg';
  const files: string[] = [];
  const expanded: string[] = [];
  let focus: string | undefined;
  let themeFlag: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--expand' || arg === '--focus') {
      const value = args[++i];
      if (!value || value.startsWith('-') || idList(value).length === 0) {
        err(`Missing system id after ${arg}`);
        return 2;
      }
      if (arg === '--expand') expanded.push(...idList(value));
      else focus = value;
    } else if (arg === '--out' || arg === '-o') {
      const value = args[++i];
      if (!value) {
        err(`Missing directory after ${arg}`);
        return 2;
      }
      dir = value;
    } else if (arg === '--theme' || arg.startsWith('--theme=')) {
      const flag = themeFlagAt(args, i);
      if ('error' in flag) {
        err(flag.error);
        return 2;
      }
      themeFlag = flag.value;
      i = flag.next;
    } else if (arg === '--format') {
      const value = args[++i];
      if (!FORMATS.includes(value as RenderFormat)) {
        err(`Unknown format '${value ?? ''}'; use ${FORMATS.join(', ')}`);
        return 2;
      }
      format = value as RenderFormat;
    } else if (arg.startsWith('-')) {
      err(`Unknown option ${arg}\n\n${usage}`);
      return 2;
    } else files.push(arg);
  }
  if (files.length !== 1) {
    err(usage);
    return 2;
  }

  const file = files[0];
  let theme: RenderTheme;
  try {
    theme = themeFor(file, themeFlag);
  } catch (e) {
    err(String((e as Error).message));
    return 2;
  }
  let result: ParseResult;
  try {
    // Imports resolve from disk exactly as for `proschi check`; the merged diagram is rendered.
    result = parseFile(file);
  } catch (e) {
    err(String((e as Error).message));
    return 2;
  }
  const { diagram, diagnostics } = result;
  const errors = diagnostics.filter((d) => d.severity === 'error');
  if (errors.length) {
    for (const d of errors) err(`${d.file ?? displayPath(file)}:${d.line}:${d.col}: error: ${d.message}`);
    err(`Not rendered: ${errors.length} error(s). Fix them, then run proschi render again.`);
    return 1;
  }

  const view: SystemsView = { ...(expanded.length ? { expanded } : {}), ...(focus !== undefined ? { focus } : {}) };
  const refused = viewError(diagram, view);
  if (refused) {
    err(refused);
    return 2;
  }
  // The system boxes show the simulation: each team's promise, and what it is sent against its headroom.
  const analysis = diagram.systems?.length && diagram.traffic?.length ? analyze(diagram) : undefined;
  const { systems, nodes } = viewOverlay(diagram, analysis, view);
  const rendered = await renderFiles(applyView(diagram, view), format, basename(file, extname(file)) || 'diagram', { systems, nodes, theme });
  mkdirSync(dir, { recursive: true });
  for (const f of rendered) {
    const path = join(dir, f.name);
    writeFileSync(path, f.content);
    out(path);
  }
  return 0;
}
