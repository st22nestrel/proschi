/**
 * `proschi preview`: a local web server for the `preview-html` page of any
 * .proschi file on disk. The start page lists the files under `--root` and
 * has a box for a path (absolute, `~/…`, `file://…` or relative to the
 * root); each page has the same box in its header. Files are read and
 * rendered on every request, so a reload shows the latest edits.
 *
 * It listens on 127.0.0.1 only, answers only requests whose Host is that
 * address or localhost (so another site can't reach it by DNS rebinding),
 * and opens only .proschi files.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { homedir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze } from '../../../frontend/src/sim/analyze';
import { displayPath, parseFile } from '../imports';
import { viewOverlay } from '../terminal/systems';
import { themeFlagAt, themeFor } from './themeConfig';
import { fileListHtml, NAV_SCRIPT, navBarHtml, pageCsp, previewStyle, renderPreviewHtml, renderSvgs, type PreviewFile } from './index';
import { esc } from './svg';
import { SKETCH, type RenderTheme } from './theme';

export const DEFAULT_PORT = 4280;
/** The start page lists at most this many files. */
const MAX_LISTED = 1000;

export interface PreviewServerOptions {
  /** Relative paths resolve against it, and the start page lists the .proschi files below it. */
  root: string;
  /** `--theme`; without it, each file's nearest proschi.json decides. */
  theme?: string;
  /** The .proschi files below a directory (the CLI's `collectFiles`). */
  listFiles: (dir: string) => string[];
}

/** A pasted path as an absolute one: quotes trimmed, `file://` URLs and `~` understood, the rest relative to `root`. */
export function resolveInput(input: string, root: string): string {
  let p = input.trim().replace(/^(["'])(.*)\1$/, '$2');
  if (p.startsWith('file://')) p = fileURLToPath(p);
  else if (p === '~' || p.startsWith('~/')) p = join(homedir(), p.slice(1));
  return resolve(root, p);
}

/** A page of the server itself (start page, errors): its own style and script by hash, forms to this server only. */
function page(title: string, nav: { current?: string; files: PreviewFile[] }, body: string, theme: RenderTheme): string {
  const style = previewStyle(theme);
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${pageCsp(style, [NAV_SCRIPT], true)}">`,
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${esc(title)}</title>`,
    `<style>${style}</style>`,
    '</head>',
    '<body>',
    navBarHtml(nav),
    `<header><h1>${esc(title)}</h1>${nav.current ? `<p class="file-path">${esc(nav.current)}</p>` : ''}</header>`,
    `<main><div class="content">${body}</div></main>`,
    `<script>${NAV_SCRIPT}</script>`,
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

/** The `title "…"` of a file, read without parsing it. */
function titleOf(file: string): string | undefined {
  try {
    const m = /^[ \t]*title[ \t]+"((?:[^"\\\n]|\\.)*)"/m.exec(readFileSync(file, 'utf8'));
    return m?.[1].replace(/\\(.)/g, '$1');
  } catch {
    return undefined;
  }
}

/** The .proschi files under the root (at most MAX_LISTED), with their titles, and how many there are in all. */
function listing(options: PreviewServerOptions): { files: PreviewFile[]; total: number; error?: string } {
  let paths: string[];
  try {
    paths = options.listFiles(options.root);
  } catch (e) {
    return { files: [], total: 0, error: (e as Error).message };
  }
  const files = paths.slice(0, MAX_LISTED).map((p) => {
    const path = resolve(options.root, p);
    return { path, dir: relative(options.root, dirname(path)) || '.', name: basename(path), title: titleOf(path) };
  });
  return { files, total: paths.length };
}

/** How a file is named on its page: relative to the root when it is below it. */
function shownPath(file: string, root: string): string {
  const rel = relative(root, file);
  return rel && !rel.startsWith('..') && !rel.startsWith('/') ? rel : file;
}

/** The server's own pages look like the root's diagrams: --theme, else the root's proschi.json. */
function look(options: PreviewServerOptions): RenderTheme {
  try {
    return themeFor(join(options.root, 'index.proschi'), options.theme);
  } catch {
    return SKETCH;
  }
}

const viewLink = (file: string) => `/view?path=${encodeURIComponent(file)}`;

function startPage(options: PreviewServerOptions): string {
  const { files, total, error } = listing(options);
  const theme = look(options);
  if (error) return page('Proschi preview', { files }, `<p class="errors">Can't list ${esc(options.root)}: ${esc(error)}</p>`, theme);
  const more = total > files.length ? `<p class="about">And ${total - files.length} more; paste a path above to open one.</p>` : '';
  const about = `<p class="about">${total} file${total === 1 ? '' : 's'} under ${esc(options.root)}</p>`;
  return page('Proschi preview', { files }, `${about}${fileListHtml(files, options.root)}${more}`, theme);
}

/** The preview page of `file`, or a page saying why there is none. */
async function filePage(file: string, options: PreviewServerOptions): Promise<{ status: number; html: string }> {
  const { files } = listing(options);
  const fail = (status: number, body: string) => ({ status, html: page('Not shown', { current: file, files }, body, look(options)) });
  if (!file.endsWith('.proschi')) return fail(400, `<p class="errors">Only .proschi files open here: ${esc(file)}</p>`);
  if (!existsSync(file) || !statSync(file).isFile()) return fail(404, `<p class="errors">No such file: ${esc(file)}</p>`);
  const theme = themeFor(file, options.theme);
  const { diagram, diagnostics } = parseFile(file);
  const errors = diagnostics.filter((d) => d.severity === 'error');
  if (errors.length) {
    const items = errors.map((d) => `<li>${esc(d.file ?? displayPath(file))}:${d.line}:${d.col}: ${esc(d.message)}</li>`).join('');
    return fail(422, `<p class="errors">${errors.length} error(s); fix them and reload.</p><ul class="errors">${items}</ul>`);
  }
  const analysis = diagram.systems?.length && diagram.traffic?.length ? analyze(diagram) : undefined;
  const { systems, nodes } = viewOverlay(diagram, analysis);
  const rendered = await renderSvgs(diagram, true, { systems, nodes, theme });
  return { status: 200, html: renderPreviewHtml(diagram, rendered, theme, { current: file, files, shown: shownPath(file, options.root) }) };
}

function send(res: ServerResponse, status: number, html: string, head: boolean) {
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  });
  res.end(head ? undefined : html);
}

/** The server, not yet listening; listen on 127.0.0.1. */
export function createPreviewServer(options: PreviewServerOptions): Server {
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    void (async () => {
      const head = req.method === 'HEAD';
      if (req.method !== 'GET' && !head) {
        res.writeHead(405, { Allow: 'GET, HEAD' }).end();
        return;
      }
      const { port } = server.address() as AddressInfo;
      const hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
      if (!hosts.includes(req.headers.host ?? '')) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' }).end(`Open http://127.0.0.1:${port}/ instead.\n`);
        return;
      }
      const url = new URL(req.url ?? '/', `http://${hosts[0]}`);
      if (url.pathname === '/') return send(res, 200, startPage(options), head);
      if (url.pathname !== '/view') return send(res, 404, page('Not found', { files: listing(options).files }, `<p class="errors">No page at ${esc(url.pathname)}.</p>`, look(options)), head);
      const input = url.searchParams.get('path') ?? '';
      if (!input.trim()) {
        res.writeHead(303, { Location: '/' }).end();
        return;
      }
      let file: string;
      try {
        file = resolveInput(input, options.root);
      } catch (e) {
        return send(res, 400, page('Not shown', { files: listing(options).files }, `<p class="errors">${esc((e as Error).message)}</p>`, look(options)), head);
      }
      try {
        const { status, html } = await filePage(file, options);
        send(res, status, html, head);
      } catch (e) {
        send(res, 500, page('Not shown', { current: file, files: listing(options).files }, `<p class="errors">${esc(String((e as Error).message ?? e))}</p>`, look(options)), head);
      }
    })();
  });
  return server;
}

/** `proschi preview [--port <n>] [--root <dir>] [--theme <name>] [<file>]`: serves until stopped (Ctrl+C). */
export async function previewCommand(args: string[], listFiles: (dir: string) => string[], out: (s: string) => void, err: (s: string) => void, usage: string): Promise<number> {
  let port = DEFAULT_PORT;
  let root = '.';
  let theme: string | undefined;
  const files: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--port') {
      const value = args[++i];
      if (!value || !/^\d+$/.test(value) || Number(value) > 65535) {
        err(`Expected a port number after --port, got '${value ?? ''}'`);
        return 2;
      }
      port = Number(value);
    } else if (arg === '--root') {
      const value = args[++i];
      if (!value || value.startsWith('-')) {
        err('Missing directory after --root');
        return 2;
      }
      root = value;
    } else if (arg === '--theme' || arg.startsWith('--theme=')) {
      const flag = themeFlagAt(args, i);
      if ('error' in flag) {
        err(flag.error);
        return 2;
      }
      theme = flag.value;
      i = flag.next;
    } else if (arg.startsWith('-')) {
      err(`Unknown option ${arg}\n\n${usage}`);
      return 2;
    } else files.push(arg);
  }
  if (files.length > 1) {
    err(usage);
    return 2;
  }
  root = resolve(root);
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    err(`Not a directory: ${root}`);
    return 2;
  }

  const server = createPreviewServer({ root, theme, listFiles });
  const listening = await new Promise<true | Error>((done) => {
    server.once('error', done);
    server.listen(port, '127.0.0.1', () => done(true));
  });
  if (listening !== true) {
    const inUse = (listening as NodeJS.ErrnoException).code === 'EADDRINUSE';
    err(inUse ? `Port ${port} is in use; pick another with --port` : listening.message);
    return 2;
  }
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  out(`Proschi preview at ${base}/ (files under ${root}); Ctrl+C stops it.`);
  if (files[0]) out(`${base}${viewLink(resolveInput(files[0], process.cwd()))}`);
  return new Promise((done) => server.on('close', () => done(0)));
}
