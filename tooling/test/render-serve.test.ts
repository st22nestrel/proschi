import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { request, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { collectFiles, run } from '../src/cli';
import { createPreviewServer, resolveInput } from '../src/render/serve';

const DOC = `a "A" [Actor]
b "B" [REST API]
usecase "Get" "Calls b. Requests: One (x)." {
  a -> b : one
}
`;

let root: string;
let server: Server;
let base: string;

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'proschi-serve-'));
  writeFileSync(join(root, 'top.proschi'), `title "Top \\"one\\""\n${DOC}`);
  writeFileSync(join(root, 'zz.proschi'), DOC);
  mkdirSync(join(root, 'classic'));
  writeFileSync(join(root, 'classic', 'proschi.json'), JSON.stringify({ theme: 'classic' }));
  writeFileSync(join(root, 'classic', 'c.proschi'), DOC);
  writeFileSync(join(root, 'broken.proschi'), 'a "A" [Actor]\nb "B" [Nonsense\n');
  writeFileSync(join(root, 'secret.txt'), 'not a diagram');
  server = createPreviewServer({ root, listFiles: (dir) => collectFiles([dir]) });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((done) => server.close(() => done())));

const get = async (path: string) => {
  const res = await fetch(base + path, { redirect: 'manual' });
  return { status: res.status, headers: res.headers, html: await res.text() };
};
const view = (path: string) => get(`/view?path=${encodeURIComponent(path)}`);

describe('proschi preview server', () => {
  it('lists the files under the root by directory, with titles, and one box to filter or paste a path', async () => {
    const { status, headers, html } = await get('/');
    expect(status).toBe(200);
    expect(headers.get('cache-control')).toBe('no-store');
    expect(html).toContain('<form class="find" action="/view" method="get"><input id="filter" name="path"');
    expect(html).toContain(`<a href="/view?path=${encodeURIComponent(join(root, 'top.proschi'))}"><span class="name">top.proschi</span><span class="title">Top &quot;one&quot;</span></a>`);
    expect(html).toContain('<section class="group"><h2>classic/</h2>');
    expect(html).toContain('<option value="" selected disabled>Choose a file…</option>');
    expect(html).not.toContain('secret.txt');
    // Its only script is the navigation one, allowed by hash.
    expect(html.match(/<script>/g)).toHaveLength(1);
    expect(html).toMatch(/script-src 'sha256-[^']+'; base-uri/);
  });

  it('renders the preview page of a file, with a bar to switch files', async () => {
    const file = join(root, 'top.proschi');
    const { status, html } = await view(file);
    expect(status).toBe(200);
    expect(html).toContain('<select id="scenario">');
    expect(html).toContain('<details class="description">');
    expect(html).toContain(`<option value="${file}" selected>Top &quot;one&quot; — top.proschi</option>`);
    expect(html).toContain(`<input id="path" name="path" value="${file}"`);
    expect(html).toContain('<p class="file-path">top.proschi</p>');
    expect(html).toContain("form-action 'self'");
    expect(html.match(/<script>/g)).toHaveLength(2);
  });

  it('links the previous and next files in list order', async () => {
    const { html } = await view('top.proschi');
    expect(html).toContain(`id="next" href="/view?path=${encodeURIComponent(join(root, 'zz.proschi'))}"`);
    expect(html).toContain(`id="prev" href="/view?path=${encodeURIComponent(join(root, 'broken.proschi'))}"`);
    const last = await view('classic/c.proschi');
    expect(last.html).toContain('<span class="button step" aria-disabled="true" aria-label="Next file">');
    expect((await view('broken.proschi')).html).toContain('<span class="button step" aria-disabled="true" aria-label="Previous file">');
  });

  it('adds a file outside the root to the dropdown', async () => {
    const outside = join(mkdtempSync(join(tmpdir(), 'proschi-elsewhere-')), 'o.proschi');
    writeFileSync(outside, DOC);
    const { html } = await view(outside);
    expect(html).toContain(`<optgroup label="Elsewhere"><option value="${outside}" selected>`);
    expect(html).toContain(`<p class="file-path">${outside}</p>`);
  });

  it('accepts relative paths, file:// URLs and quoted paths', async () => {
    expect((await view('top.proschi')).status).toBe(200);
    expect((await view(pathToFileURL(join(root, 'top.proschi')).href)).status).toBe(200);
    expect((await view(`"${join(root, 'top.proschi')}"`)).status).toBe(200);
  });

  it("uses the theme of the file's nearest proschi.json", async () => {
    const top = await view('top.proschi');
    const classic = await view('classic/c.proschi');
    expect(classic.html).not.toEqual(top.html.replace('top.proschi', join('classic', 'c.proschi')));
    expect(classic.html.match(/<style>[\s\S]*?<\/style>/)?.[0]).not.toEqual(top.html.match(/<style>[\s\S]*?<\/style>/)?.[0]);
  });

  it('lists the errors of a broken file instead of rendering it', async () => {
    const { status, html } = await view('broken.proschi');
    expect(status).toBe(422);
    expect(html).toContain('error(s); fix them and reload.');
    expect(html).toContain('broken.proschi:2:');
  });

  it('opens only .proschi files that exist', async () => {
    const txt = await view('secret.txt');
    expect(txt.status).toBe(400);
    expect(txt.html).not.toContain('not a diagram');
    expect((await view('missing.proschi')).status).toBe(404);
    expect((await get('/elsewhere')).status).toBe(404);
  });

  it('sends an empty path back to the start page', async () => {
    const { status, headers } = await get('/view?path=');
    expect(status).toBe(303);
    expect(headers.get('location')).toBe('/');
  });

  it('escapes the path it shows', async () => {
    const { html } = await view('<b>x</b>.proschi');
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;.proschi');
    expect(html).not.toContain('<b>x</b>');
  });

  it('refuses another Host (DNS rebinding) and other methods', async () => {
    const { port } = server.address() as AddressInfo;
    const status = (method: string, host: string) =>
      new Promise<number>((done, fail) => {
        const req = request({ host: '127.0.0.1', port, path: '/', method, headers: { host } }, (res) => {
          res.resume();
          done(res.statusCode ?? 0);
        });
        req.on('error', fail);
        req.end();
      });
    expect(await status('GET', `evil.example:${port}`)).toBe(403);
    expect(await status('GET', `localhost:${port}`)).toBe(200);
    expect(await status('POST', `127.0.0.1:${port}`)).toBe(405);
  });
});

describe('resolveInput', () => {
  it('expands ~ and resolves the rest against the root', () => {
    expect(resolveInput('~/a.proschi', '/r')).toBe(join(homedir(), 'a.proschi'));
    expect(resolveInput(' sub/a.proschi ', '/r')).toBe('/r/sub/a.proschi');
    expect(resolveInput('/abs/a.proschi', '/r')).toBe('/abs/a.proschi');
  });
});

describe('proschi preview arguments', () => {
  const capture = async (argv: string[]) => {
    const err: string[] = [];
    const code = await run(argv, () => {}, (s) => err.push(s));
    return { code, err: err.join('\n') };
  };
  it('rejects bad flags before listening', async () => {
    expect(await capture(['preview', '--port', 'x'])).toEqual({ code: 2, err: "Expected a port number after --port, got 'x'" });
    expect((await capture(['preview', '--theme', 'neon'])).err).toContain("Unknown theme 'neon'");
    expect((await capture(['preview', '--root', join(root, 'top.proschi')])).err).toContain('Not a directory');
  });
});
