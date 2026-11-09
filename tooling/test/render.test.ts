import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { describe, expect, it } from 'vitest';
import { run } from '../src/cli';
import { examples, parse } from '../src/proschi';
import { renderArchitectureSvg, renderMarkdown, renderSequenceSvg, renderSvgs } from '../src/render';
import { previewHtml, renderPreviewContent } from '../src/render/preview';
import { fileResolver } from '../src/imports';
import { techIcon } from '../src/render/icons';
import { PALETTE, tint } from '../../frontend/src/dsl/palette';
import { SYSTEM_SIZE } from '../../frontend/src/dsl/autoLayout';
import { COLORS, esc, fit, textWidth } from '../src/render/svg';

async function capture(argv: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await run(argv, (s) => out.push(s), (s) => err.push(s));
  return { code, out: out.join('\n'), err: err.join('\n') };
}

function expectWellFormed(svg: string) {
  expect(XMLValidator.validate(svg)).toBe(true);
  const doc = new XMLParser({ ignoreAttributes: false }).parse(svg);
  expect(doc.svg['@_xmlns']).toBe('http://www.w3.org/2000/svg');
  // A white background, so the SVG reads well in dark viewers too.
  expect(svg).toContain(`<rect width="100%" height="100%" fill="${COLORS.background}"/>`);
}

/** Every opened HTML tag is closed in order; void elements and self-closed SVG elements aside. */
function expectBalancedHtml(html: string) {
  const voids = new Set(['meta', 'br', 'img', 'hr', 'input', 'link']);
  const stack: string[] = [];
  for (const [, close, name, selfClose] of html.matchAll(/<(\/?)([a-zA-Z][\w-]*)[^>]*?(\/?)>/g)) {
    const tag = name.toLowerCase();
    if (voids.has(tag) || selfClose) continue;
    if (!close) stack.push(tag);
    else expect(stack.pop(), `</${tag}>`).toBe(tag);
  }
  expect(stack).toEqual([]);
}

/** The `<g>` element of a step's message in a sequence SVG. */
function stepGroups(svg: string, kind: string): string[] {
  return [...svg.matchAll(new RegExp(`<g data-step="\\d+" data-kind="${kind}"[^>]*>[\\s\\S]*?</g>`, 'g'))].map((m) => m[0]);
}

const dir = mkdtempSync(join(tmpdir(), 'proschi-render-'));
const exampleFiles = examples.map((e) => {
  const file = join(dir, `${e.id}.proschi`);
  writeFileSync(file, e.source);
  return { ...e, file };
});

describe('proschi render', () => {
  it.each(exampleFiles.map((e) => [e.id, e]))('renders %s as SVG files', async (_id, example) => {
    const out = join(dir, 'svg', example.id);
    const r = await capture(['render', example.file, '--out', out]);
    expect(r.code).toBe(0);
    const { diagram } = parse(example.source);

    const arch = readFileSync(join(out, 'architecture.svg'), 'utf8');
    expectWellFormed(arch);
    for (const node of diagram.nodes.filter((n) => n.kind === 'component')) expect(arch).toContain(`>${esc(node.name)}<`);

    for (const uc of diagram.useCases) {
      for (const s of uc.scenarios) {
        const file = join(out, `${uc.id}--${s.id}.svg`);
        expect(r.out).toContain(file);
        const svg = readFileSync(file, 'utf8');
        expectWellFormed(svg);
        expect(svg).toContain(esc(uc.name));
        expect(stepGroups(svg, '(?:request|failed)')).toHaveLength(s.steps.length);
        for (const g of stepGroups(svg, 'failed')) expect(g).toContain(`stroke="${COLORS.error}"`);
        for (const g of stepGroups(svg, 'response')) {
          if (g.includes('data-error="true"')) expect(g).toContain(`stroke="${COLORS.error}"`);
          else expect(g).not.toContain(COLORS.error);
        }
      }
    }
  });

  it.each(exampleFiles.map((e) => [e.id, e]))('renders %s as Markdown and HTML', async (_id, example) => {
    const out = join(dir, 'docs', example.id);
    expect((await capture(['render', example.file, '--out', out, '--format', 'md'])).code).toBe(0);
    expect((await capture(['render', example.file, '--out', out, '--format', 'html'])).code).toBe(0);
    const { diagram } = parse(example.source);

    const md = readFileSync(join(out, `${example.id}.md`), 'utf8');
    expect(md.startsWith(`# ${diagram.title}\n`)).toBe(true);
    const scenarios = diagram.useCases.reduce((n, uc) => n + uc.scenarios.length, 0);
    expect(md.match(/^```mermaid$/gm)).toHaveLength(1 + scenarios);
    expect(md.match(/^sequenceDiagram$/gm)).toHaveLength(scenarios);

    const html = readFileSync(join(out, `${example.id}.html`), 'utf8');
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html.match(/<svg [^>]*font-family=/g)).toHaveLength(1 + scenarios);
    for (const uc of diagram.useCases) for (const s of uc.scenarios) expect(html).toContain(`href="#${uc.id}--${s.id}"`);
    expect(html).not.toMatch(/<script|<link|https?:\/\/(?!www\.w3\.org)/);
    // Each inline SVG has its own marker ids.
    const ids = [...html.matchAll(/<marker id="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(exampleFiles.map((e) => [e.id, e]))('renders %s as a preview page with a scenario picker', async (_id, example) => {
    const out = join(dir, 'preview', example.id);
    const r = await capture(['render', example.file, '--out', out, '--format', 'preview-html']);
    expect(r.code).toBe(0);
    expect(r.out).toBe(join(out, `${example.id}.preview.html`));
    const { diagram } = parse(example.source);
    const slugs = diagram.useCases.flatMap((uc) => uc.scenarios.map((s) => `${uc.id}--${s.id}`));

    const html = readFileSync(join(out, `${example.id}.preview.html`), 'utf8');
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<details open><summary>Architecture</summary>');
    expect(html.match(/<svg [^>]*font-family=/g)).toHaveLength(1 + slugs.length);
    for (const slug of slugs) {
      expect(html).toContain(`<option value="${slug}">`);
      expect(html).toContain(`data-slug="${slug}"`);
    }
    // Only the first scenario shows before the script runs.
    expect(html.match(/class="scenario" data-slug="[^"]+" hidden>/g) ?? []).toHaveLength(Math.max(0, slugs.length - 1));
    expect(html).not.toMatch(/<link|https?:\/\/(?!www\.w3\.org)/);
    expect(html.match(/<script>/g)).toHaveLength(1);
    const ids = [...html.matchAll(/<marker id="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(exampleFiles.map((e) => [e.id, e]))('renders %s as an HLD in Markdown and HTML', async (_id, example) => {
    const out = join(dir, 'hld', example.id);
    const md = await capture(['render', example.file, '--out', out, '--format', 'hld-md']);
    expect(md.code).toBe(0);
    expect(md.out).toBe(join(out, `${example.id}.hld.md`));
    expect((await capture(['render', example.file, '--out', out, '--format', 'hld-html'])).code).toBe(0);
    const { diagram } = parse(example.source);
    const scenarios = diagram.useCases.flatMap((uc) => uc.scenarios.filter((s) => s.steps.length).map((s) => `${uc.id}--${s.id}`));

    const text = readFileSync(join(out, `${example.id}.hld.md`), 'utf8');
    expect(text.startsWith(`# ${diagram.title}\n`)).toBe(true);
    expect(text).toContain('\n## Overview\n');
    expect(text).toContain('\n## Components\n');
    expect(text.match(/^sequenceDiagram$/gm) ?? []).toHaveLength(scenarios.length);

    const html = readFileSync(join(out, `${example.id}.hld.html`), 'utf8');
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expectBalancedHtml(html);
    expect(html).toContain('<section id="overview">');
    // The architecture and one sequence diagram per scenario, as inline SVG.
    expect(html.match(/<svg [^>]*font-family=/g)).toHaveLength(1 + scenarios.length);
    expect(html).not.toMatch(/<script|<link|https?:\/\/(?!www\.w3\.org)/);
    const ids = [...html.matchAll(/<marker id="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('refuses documents with errors, but renders warnings', async () => {
    const bad = join(dir, 'bad.proschi');
    writeFileSync(bad, 'a [REST API]\na [Redis]\n');
    const r = await capture(['render', bad, '--out', join(dir, 'bad')]);
    expect(r.code).toBe(1);
    expect(r.err).toContain(`${bad}:2:1: error: Duplicate id 'a'`);
    expect(existsSync(join(dir, 'bad'))).toBe(false);

    const warn = join(dir, 'warn.proschi');
    writeFileSync(warn, 'api [Nope]\nusecase "U" {\n  api -> db : GET /x\n  b --> a : 200\n}\n');
    expect((await capture(['render', warn, '--out', join(dir, 'warn')])).code).toBe(0);
    expect(existsSync(join(dir, 'warn', 'u--main.svg'))).toBe(true);
  });

  it('renders a document that imports another file, and refuses when the import has errors', async () => {
    const multi = join(dir, 'multi');
    mkdirSync(join(multi, 'shared'), { recursive: true });
    writeFileSync(join(multi, 'shared', 'infra.proschi'), 'db "Orders DB" [PostgreSQL]\n');
    writeFileSync(join(multi, 'main.proschi'), 'import "shared/infra.proschi"\napi "Order API" [REST API]\napi -> db : SQL\nusecase "Read" {\n  api -> db : SELECT\n}\n');
    const out = join(multi, 'out');
    const r = await capture(['render', join(multi, 'main.proschi'), '--out', out]);
    expect(r.code).toBe(0);
    const arch = readFileSync(join(out, 'architecture.svg'), 'utf8');
    expect(arch).toContain('>Orders DB<');
    expect(arch).toContain('>Order API<');
    expect(readFileSync(join(out, 'read--main.svg'), 'utf8')).toContain('>Orders DB<');

    writeFileSync(join(multi, 'shared', 'infra.proschi'), 'db [PostgreSQL]\ndb [Redis]\n');
    const bad = await capture(['render', join(multi, 'main.proschi'), '--out', join(multi, 'bad')]);
    expect(bad.code).toBe(1);
    expect(bad.err).toMatch(/infra\.proschi:2:1: error: Duplicate id 'db'/);
  });

  it('rejects bad usage with exit code 2', async () => {
    const file = exampleFiles[0].file;
    expect((await capture(['render'])).code).toBe(2);
    expect((await capture(['render', file, file])).code).toBe(2);
    expect((await capture(['render', '--format', 'pdf', file])).code).toBe(2);
    expect((await capture(['render', file, '--out'])).code).toBe(2);
    expect((await capture(['render', '--nope', file])).code).toBe(2);
    expect((await capture(['render', join(dir, 'missing.proschi')])).code).toBe(2);
    expect((await capture(['--help'])).out).toContain('proschi render');
  });

  describe('systems', () => {
    const drone = (file: string) => fileURLToPath(new URL(`./fixtures/drone/${file}`, import.meta.url));
    const render = async (file: string, flags: string[], name: string) => {
      const out = join(dir, name);
      const r = await capture(['render', ...flags, drone(file), '--out', out]);
      return { ...r, arch: r.code === 0 ? readFileSync(join(out, 'architecture.svg'), 'utf8') : '' };
    };
    const kindOf = (svg: string, id: string) => svg.match(new RegExp(`data-node="${id.replace('.', '\\.')}" data-kind="([^"]+)"`))?.[1];

    it('draws each system collapsed by default, with its team, promise and sent / headroom', async () => {
      const { code, arch } = await render('org.proschi', [], 'sys-ok');
      expect(code).toBe(0);
      expectWellFormed(arch);
      expect(kindOf(arch, 'orders')).toBe('system');
      expect(arch).toContain('data-status="ok"');
      expect(arch).toContain('>@Orders<');
      expect(arch).toContain('>promise p99 150 ms<');
      expect(arch).toContain('>100 / 4.7k rps<');
      expect(arch).not.toContain('data-node="orders.db"');
      // The box is drawn at the layout's size, so edge routes end on its border.
      const box = arch.match(/data-node="orders" data-kind="system"[^>]*>\n<rect[^>]* height="([\d.]+)"/);
      expect(Number(box?.[1])).toBe(SYSTEM_SIZE.height);
    });

    it('flags a system sent more than it takes', async () => {
      const { arch } = await render('org-busy.proschi', [], 'sys-busy');
      expect(arch).toMatch(/data-node="orders" data-kind="system" data-status="saturated"/);
      expect(arch).toMatch(/data-node="warehouse" data-kind="system" data-status="hot"/);
      expect(arch).toContain('>✗ saturated<');
      expect(arch).toContain('>5.2k / 4.7k rps<');
    });

    it('expands systems in place, and focuses into one', async () => {
      const expanded = await render('org-busy.proschi', ['--expand', 'orders,feed'], 'sys-expanded');
      expect(expanded.code).toBe(0);
      expectWellFormed(expanded.arch);
      expect(kindOf(expanded.arch, 'orders')).toBe('system-frame');
      expect(kindOf(expanded.arch, 'feed')).toBe('system-frame');
      expect(kindOf(expanded.arch, 'warehouse')).toBe('system');
      expect(expanded.arch).toContain('data-node="orders.db"');
      expect(expanded.arch).toMatch(/✗ saturated · @Orders · p99 150 ms · 5\.2k \/ 4\.7k rps/);
      // Inside the frame, each card carries its load under what the team is sent, as on the terminal.
      expect(expanded.arch).toMatch(/data-node="orders\.db" data-kind="database" data-load="110%">\n<rect[^>]*\/>\n<rect[^>]* fill="#FFD9D6"/);
      expect(expanded.arch).toContain('data-node="orders.api" data-kind="service" data-load="92%"');
      expect(expanded.arch).toContain('data-node="feed.api" data-kind="service" data-load="95%"');

      const repeated = await render('org.proschi', ['--expand', 'orders', '--expand', 'feed'], 'sys-repeated');
      expect(kindOf(repeated.arch, 'feed')).toBe('system-frame');

      const focused = await render('org-busy.proschi', ['--focus', 'orders'], 'sys-focus');
      expect(focused.code).toBe(0);
      expect(focused.arch).toContain('<title>Orders</title>');
      expect(kindOf(focused.arch, 'db')).toBe('database');
      expect(focused.arch).not.toContain('data-node="frontend"');
    });

    it('refuses an id that names no system, with exit code 2', async () => {
      const unknown = await render('org.proschi', ['--expand', 'order'], 'sys-unknown');
      expect(unknown.code).toBe(2);
      expect(unknown.err).toBe("No system 'order' to expand; the systems are frontend, orders, warehouse, feed.");
      expect(existsSync(join(dir, 'sys-unknown'))).toBe(false);
      const focus = await render('org.proschi', ['--focus', 'shopper'], 'sys-unknown');
      expect(focus.code).toBe(2);
      expect(focus.err).toMatch(/^No system 'shopper' to focus/);
      expect((await capture(['render', drone('org.proschi'), '--expand'])).err).toBe('Missing system id after --expand');
      expect((await render('org.proschi', ['--focus', '--out'], 'sys-unknown')).code).toBe(2);
    });
  });
});

describe('SVG rendering', () => {
  const { diagram } = parse(`title "Shop & <Co>"
group vpc "AWS VPC" [Network Boundary] {
  gateway "API Gateway" [AWS API Gateway] @platform
  group core "Core" {
    orders "Order <Service>" [REST API]
  }
}
db "Orders DB" [PostgreSQL]
gateway -> orders : HTTP & "json"
orders -> db : SQL

usecase "Create order" {
  gateway -> orders : POST /orders json {"sku": "A1"}
  orders -> orders : validate
  alt "Created" {
    par {
      orders -> db : INSERT order
      orders ->> db : audit
    }
    orders --> gateway : 201 {"id": 1}
  } alt "DB down" {
    orders -x db : INSERT order
    orders --> gateway : 503
  }
}
`);

  it('draws nested groups, nodes with tech and team, and escaped labels', async () => {
    const svg = await renderArchitectureSvg(diagram);
    expectWellFormed(svg);
    expect(svg).toContain('<title>Shop &amp; &lt;Co&gt;</title>');
    expect(svg.match(/data-kind="group"/g)).toHaveLength(2);
    expect(svg).toContain('stroke-dasharray="7 5"');
    expect(svg).toContain('>Order &lt;Service&gt;<');
    expect(svg).toContain('>AWS API Gateway<');
    expect(svg).toContain('>Team: platform<');
    // Cards like ComponentNode: monochrome, an ink border and a hard shadow, the glyph in ink, a handle top and bottom.
    expect(svg).toContain(`fill="${COLORS.background}"/>`);
    expect(svg.match(/<svg x="[^"]+" y="[^"]+" width="18" height="18" color="#111111"/g)).toHaveLength(3);
    expect(svg.match(/width="9" height="9"/g)).toHaveLength(6);
    // Both groups carry GroupNode's folder icon and an upper-case name.
    expect(svg.match(/width="14" height="14" color="#111111"/g)).toHaveLength(2);
    // No class or style attributes leak from the React icons.
    expect(svg).not.toMatch(/ (class|style)="/);
    expect(svg).toContain('>HTTP &amp; &quot;json&quot;<');
    // Edges follow their orthogonal routes, with RoutedEdge's own arrowhead rather than a marker, as on the canvas.
    expect(svg).not.toContain('marker-end');
    const edges = [...svg.matchAll(/<g data-edge="[^"]+">\n<path d="([^"]+)" fill="none"[^>]*\/>\n<path d="(M[^"]+Z)" fill="[^"]+"\/>/g)];
    expect(edges.length).toBe(diagram.edges.length);
    for (const [, d] of edges) expect(d).toMatch(/^M[\d.]+,[\d.]+( (L|Q)[\d.,]+( [\d.,]+)?)+$/);
  });

  it('draws an edge between pinned nodes along the fallback route between their facing sides', async () => {
    const pinned = parse('a "A" [REST API] pos 0,0\nb "B" [Redis] pos 400,0\na -> b : call').diagram;
    const svg = await renderArchitectureSvg(pinned);
    const d = svg.match(/<g data-edge="[^"]+">\n<path d="([^"]+)"/)![1];
    // From A's right side straight across to B's left side (cut back for the arrowhead).
    expect(d).toBe('M272,68 L422,68');
  });

  it('draws numbered requests, responses, self-calls, par regions, and errors in red', () => {
    const [created, down] = diagram.useCases[0].scenarios;
    const ok = renderSequenceSvg(diagram, diagram.useCases[0], created, 'x-');
    expectWellFormed(ok);
    expect(ok).toContain('Create order › Created');
    expect(ok).toContain('data-kind="par"');
    expect(ok).toContain('>par<');
    expect(ok).toContain('<tspan font-weight="700">201</tspan>');
    expect(ok).toContain('marker-end="url(#x-solid)"');
    expect(ok).toContain('marker-end="url(#x-open)"');
    expect(ok.replace(/<defs>[\s\S]*?<\/defs>/, '')).not.toContain(COLORS.error);
    // The self-call is a loop on one lifeline.
    expect(stepGroups(ok, 'request')[1]).toContain('<path d="M');

    const bad = renderSequenceSvg(diagram, diagram.useCases[0], down);
    expectWellFormed(bad);
    expect(bad).toContain('error path');
    const [failed] = stepGroups(bad, 'failed');
    expect(failed).toContain(`stroke="${COLORS.error}"`);
    expect(failed).not.toContain('marker-end');
    const [response] = stepGroups(bad, 'response');
    expect(response).toContain('data-error="true"');
    expect(response).toContain('marker-end="url(#open-error)"');
    expect(response).toContain('>503</tspan>');
  });

  it('renders an empty document and a use case without steps', async () => {
    const empty = parse('').diagram;
    expectWellFormed(await renderArchitectureSvg(empty));
    const noSteps = parse('usecase "Nothing" {\n}\n').diagram;
    const { scenarios } = await renderSvgs(noSteps);
    expect(scenarios).toHaveLength(1);
    expectWellFormed(scenarios[0].svg);
    expect(scenarios[0].svg).toContain('No steps');
  });

  it('renders the canvas icons as plain nested SVG', () => {
    const pg = techIcon('PostgreSQL', 10, 20, 20, '#ffffff');
    expect(pg.startsWith('<svg x="10" y="20" width="20" height="20" color="#ffffff"')).toBe(true);
    expect(pg).toContain('viewBox="0 0 24 24"');
    expect(XMLValidator.validate(pg)).toBe(true);
    // A lucide icon keeps its children's own sizes (Rectangle → Square has a <rect width>).
    const square = techIcon('Rectangle', 0, 0, 16, '#000000');
    expect(square).toMatch(/<rect [^>]*width="18"/);
    expect(square).not.toMatch(/ (class|style)="/);
  });

  it('draws a broker as its own kind, with the broker glyph', async () => {
    const svg = await renderArchitectureSvg(parse('events [Redpanda]\njobs [Message Queue]').diagram);
    expect(svg).toContain('<g data-node="events" data-kind="broker">');
    expect(svg).toContain('<g data-node="jobs" data-kind="queue">');
    expect(techIcon('AWS SNS', 0, 0, 16, '#000', 'broker')).toBe(techIcon('Message Broker', 0, 0, 16, '#000', 'broker'));
    expect(techIcon('Message Broker', 0, 0, 16, '#000', 'broker')).not.toBe(techIcon('Message Queue', 0, 0, 16, '#000', 'queue'));
  });

  it('places nodes where the canvas does, honouring pinned positions', async () => {
    const pinned = parse('a "A" [REST API] pos 500,40\nb "B" [Redis] pos 100,300\na -> b').diagram;
    const svg = await renderArchitectureSvg(pinned);
    const card = (id: string) => svg.match(new RegExp(`<g data-node="${id}"[^>]*>\\n<rect x="([\\d.]+)" y="([\\d.]+)"`))!.slice(1).map(Number);
    const [ax, ay] = card('a');
    const [bx, by] = card('b');
    expect([ax - bx, ay - by]).toEqual([400, -260]);
  });

  it('draws a reply that has no status or body', () => {
    const d = parse('usecase "U" {\n  a -> b : call\n  b --> a\n}').diagram;
    const svg = renderSequenceSvg(d, d.useCases[0], d.useCases[0].scenarios[0]);
    const [reply] = stepGroups(svg, 'response');
    expect(reply).toContain('stroke-dasharray="6 4"');
    expect(reply).not.toContain('<text');
  });

  it('estimates and fits text', () => {
    expect(textWidth('MMMM', 10)).toBeGreaterThan(textWidth('iiii', 10));
    expect(fit('short', 200, 12)).toBe('short');
    const cut = fit('a very long label that does not fit', 80, 12);
    expect(cut.endsWith('…')).toBe(true);
    expect(textWidth(cut, 12)).toBeLessThanOrEqual(80);
  });

  it('writes Markdown with scenario headings', () => {
    const md = renderMarkdown(diagram);
    expect(md).toContain('### Create order');
    expect(md).toContain('`POST /orders`');
    expect(md).toContain('#### Created');
    expect(md).toContain('#### DB down (error)');
  });
});

describe('VS Code preview', () => {
  it('builds a page with a strict CSP and a nonce for the script and style', () => {
    const html = previewHtml({ nonce: 'abc123', cspSource: 'vscode-resource:', title: 'Preview <x>', body: '<p>hi</p>' });
    const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)![1];
    expect(csp).toBe("default-src 'none'; img-src vscode-resource: data:; style-src 'nonce-abc123'; script-src 'nonce-abc123'");
    expect(html).toContain('<title>Preview &lt;x&gt;</title>');
    expect(html).toContain('<style nonce="abc123">');
    expect(html).toContain('<script nonce="abc123">');
    expect(html.match(/<script/g)).toHaveLength(1);
    expect(html).toContain('<div id="root"><p>hi</p></div>');
    expect(html).not.toMatch(/https?:\/\//);
  });

  it('renders the architecture and a scenario picker, showing the first scenario', async () => {
    const source = examples.find((e) => e.id === 'ecommerce')!.source;
    const content = await renderPreviewContent(source);
    expect(content.ok).toBe(true);
    expect(content.html).toContain('<h1>E-Commerce Platform</h1>');
    expect(content.html).toContain('<select id="scenario">');
    expect(content.html).toContain('<optgroup label="Create order">');
    expect(content.html).toContain('<option value="create-order--database-down">Database down (error)</option>');
    const figures = [...content.html.matchAll(/<div class="figure scenario" data-slug="([^"]+)"( hidden)?>/g)];
    expect(figures).toHaveLength(5);
    expect(figures[0][2]).toBeUndefined();
    expect(figures.slice(1).every((f) => f[2] === ' hidden')).toBe(true);
    // No inline style attributes or scripts, which the CSP would block.
    expect(content.html).not.toMatch(/ style="|<script|<style/);
  });

  it('lists errors instead of rendering', async () => {
    const content = await renderPreviewContent('a [REST API]\na [Redis]\n');
    expect(content.ok).toBe(false);
    expect(content.html).toContain('1 error(s)');
    expect(content.html).toContain("Line 2:1: Duplicate id &#39;a&#39;");
  });

  it('resolves imports through the given resolver', async () => {
    const files: Record<string, string> = { '/w/infra.proschi': 'db "Orders DB" [PostgreSQL]\n' };
    const content = await renderPreviewContent('import "infra.proschi"\napi -> db\n', {
      path: '/w/main.proschi',
      resolve: (p, from) => {
        const abs = `${from!.slice(0, from!.lastIndexOf('/'))}/${p}`;
        return files[abs] === undefined ? undefined : { path: abs, source: files[abs] };
      },
    });
    expect(content.ok).toBe(true);
    expect(content.html).toContain('>Orders DB<');
  });

  it('gives the reason an import failed, as check and the language server do', async () => {
    const project = mkdtempSync(join(tmpdir(), 'proschi-preview-'));
    mkdirSync(join(project, 'app'));
    writeFileSync(join(project, 'app', 'proschi.json'), '{}');
    const entry = join(project, 'app', 'main.proschi');
    const source = 'import "../outside.proschi"\nimport "git:github.com/acme/infra//db.proschi@main"\napi -> db\n';
    const content = await renderPreviewContent(source, { path: entry, resolve: fileResolver({ entry }) });
    expect(content.ok).toBe(false);
    expect(content.html).toContain('&#39;../outside.proschi&#39; is outside the project root');
    expect(content.html).toContain('is a remote import and there is no proschi.lock; run proschi imports sync');
    expect(content.html).not.toContain('Cannot find');
  });

  it('draws system boxes with their status, promise and sent / headroom, as proschi render does', async () => {
    const entry = fileURLToPath(new URL('./fixtures/drone/org-busy.proschi', import.meta.url));
    const content = await renderPreviewContent(readFileSync(entry, 'utf8'), { path: entry, resolve: fileResolver({ entry }) });
    expect(content.ok).toBe(true);
    expect(content.html).toMatch(/data-node="orders" data-kind="system" data-status="saturated"/);
    expect(content.html).toContain('>promise p99 150 ms<');
    expect(content.html).toContain('>5.2k / 4.7k rps<');
  });

  it('hints at use cases when there are none', async () => {
    const content = await renderPreviewContent('api -> db\n');
    expect(content.ok).toBe(true);
    expect(content.html).toContain('Add a <code>usecase</code>');
  });
});

describe('colors, legend and critical in the architecture SVG', () => {
  const styled = parse(`legend {
  owned "Owned & run" green
  planned "Planned flow" blue dashed
}
api "API" [REST API] critical
db [PostgreSQL] color #ff0000
group g "G" .owned {
  w [Go]
}
api -> db .planned : sync
api -> w
`).diagram;

  it('tints cards by category and color, frames tagged groups, and strokes tagged edges', async () => {
    const svg = await renderArchitectureSvg(styled);
    expectWellFormed(svg);
    const blue = tint(PALETTE.blue, 'light');
    const green = tint(PALETTE.green, 'light');
    expect(svg).toContain(`fill="${blue.fill}" stroke="${blue.line}"`);
    expect(svg).toContain(`stroke="${tint('#ff0000', 'light').line}"`);
    expect(svg).toContain(`fill="${green.groupFill}" stroke="${green.line}"`);
    expect(svg).toMatch(new RegExp(`<path d="M[^"]+" fill="none" stroke="${blue.line}" stroke-width="2" stroke-dasharray="7 5"/>`));
    expect(svg.match(/data-critical="true"/g)).toHaveLength(1);
  });

  it('draws the legend with one swatch per entry, escaped', async () => {
    const svg = await renderArchitectureSvg(styled);
    expect(svg).toContain('data-legend="true"');
    expect(svg.match(/data-entry="/g)).toHaveLength(2);
    expect(svg).toContain('>Owned &amp; run<');
    expect(await renderArchitectureSvg(parse('a').diagram)).not.toContain('data-legend');
  });
});
