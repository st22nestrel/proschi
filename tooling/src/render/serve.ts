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
import { existsSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { homedir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze } from '../../../frontend/src/sim/analyze';
import { displayPath, parseFile } from '../imports';
import { viewOverlay } from '../terminal/systems';
import { themeFlagAt, themeFor } from './themeConfig';
import { cspHash, openerHtml, previewStyle, renderPreviewHtml, renderSvgs } from './index';
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

/** A page of the server itself (start page, errors): its own style by hash, no scripts, forms to this server only. */
function page(title: string, path: string, body: string, theme: RenderTheme): string {
  const style = previewStyle(theme);
  const csp = [`default-src 'none'`, `style-src ${cspHash(style)}`, `base-uri 'none'`, `form-action 'self'`].join('; ');
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${csp}">`,
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${esc(title)}</title>`,
    `<style>${style}</style>`,
    '</head>',
    '<body>',
    `<header><h1>${esc(title)}</h1>${openerHtml({ path })}</header>`,
    `<main><div class="content">${body}</div></main>`,
    '</body>',
    '</html>',
    '',
  ].join('\n');
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
  let files: string[];
  try {
    files = options.listFiles(options.root);
  } catch (e) {
    return page('Proschi preview', '', `<p class="errors">Can't list ${esc(options.root)}: ${esc((e as Error).message)}</p>`, look(options));
  }
  const shown = files.slice(0, MAX_LISTED);
  const items = shown.map((f) => {
    const abs = resolve(options.root, f);
    return `<li><a href="${esc(viewLink(abs))}">${esc(relative(options.root, abs) || abs)}</a></li>`;
  });
  const more = files.length > shown.length ? `<p class="about">And ${files.length - shown.length} more; paste a path above to open one.</p>` : '';
  const list = files.length ? `<ul class="files">${items.join('')}</ul>${more}` : '<p class="about">No .proschi files here; paste a path above.</p>';
  return page('Proschi preview', '', `<p class="about">Paste the path of any .proschi file above, or pick one under ${esc(options.root)}:</p>${list}`, look(options));
}

/** The preview page of `file`, or a page saying why there is none. */
async function filePage(file: string, options: PreviewServerOptions): Promise<{ status: number; html: string }> {
  const fail = (status: number, body: string) => ({ status, html: page('Not shown', file, body, look(options)) });
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
  return { status: 200, html: renderPreviewHtml(diagram, rendered, theme, { path: file }) };
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
      if (url.pathname !== '/view') return send(res, 404, page('Not found', '', `<p class="errors">No page at ${esc(url.pathname)}.</p>`, look(options)), head);
      const input = url.searchParams.get('path') ?? '';
      if (!input.trim()) {
        res.writeHead(303, { Location: '/' }).end();
        return;
      }
      let file: string;
      try {
        file = resolveInput(input, options.root);
      } catch (e) {
        return send(res, 400, page('Not shown', input, `<p class="errors">${esc((e as Error).message)}</p>`, look(options)), head);
      }
      try {
        const { status, html } = await filePage(file, options);
        send(res, status, html, head);
      } catch (e) {
        send(res, 500, page('Not shown', file, `<p class="errors">${esc(String((e as Error).message ?? e))}</p>`, look(options)), head);
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
