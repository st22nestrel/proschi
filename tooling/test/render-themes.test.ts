import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { XMLValidator } from 'fast-xml-parser';
import { describe, expect, it } from 'vitest';
import { run } from '../src/cli';
import { parse } from '../src/proschi';
import { getTheme, renderArchitectureSvg, renderSequenceSvg, renderSvgs, THEME_NAMES } from '../src/render';
import { typeColor } from '../src/render/icons';
import { CLASSIC, SKETCH } from '../src/render/theme';

async function capture(argv: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await run(argv, (s) => out.push(s), (s) => err.push(s));
  return { code, out: out.join('\n'), err: err.join('\n') };
}

const SOURCE = `title "Shop"
web "Web" [React]
api "Order API" [REST API]
db "Orders DB" [PostgreSQL]
group g "Backend" {
  w "Worker" [Go]
}
n "Remember" [Text Note] "Retries are idempotent."
web -> api : HTTPS
api -> db : SQL
api -> w
usecase "Place order" {
  web -> api : POST /orders
  api -> db : INSERT order
  db --> api : ok
  api --> web : 201 created
}
`;

const background = (svg: string) => svg.match(/<rect width="100%" height="100%" fill="([^"]+)"\/>/)?.[1];

/** A folder with `main.proschi` and, when given, a proschi.json. */
function project(config?: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), 'proschi-theme-'));
  writeFileSync(join(dir, 'main.proschi'), SOURCE);
  if (config !== undefined) writeFileSync(join(dir, 'proschi.json'), typeof config === 'string' ? config : JSON.stringify(config));
  return dir;
}

async function renderIn(dir: string, flags: string[] = []) {
  const out = join(dir, `out-${Math.random().toString(36).slice(2)}`);
  const r = await capture(['render', join(dir, 'main.proschi'), '--out', out, ...flags]);
  const read = (name: string) => readFileSync(join(out, name), 'utf8');
  return { ...r, out, read };
}

describe('render themes', () => {
  const { diagram } = parse(SOURCE);
  const useCase = diagram.useCases[0];

  it('names two themes, sketch by default', () => {
    expect(THEME_NAMES).toEqual(['sketch', 'classic']);
    expect(getTheme()).toBe(SKETCH);
    expect(getTheme('classic')).toBe(CLASSIC);
    expect(() => getTheme('neon')).toThrow("Unknown theme 'neon'; use sketch, classic");
  });

  it('renders the architecture in both themes', async () => {
    const sketch = await renderArchitectureSvg(diagram);
    const classic = await renderArchitectureSvg(diagram, { theme: CLASSIC });
    for (const svg of [sketch, classic]) {
      expect(XMLValidator.validate(svg)).toBe(true);
      for (const name of ['Web', 'Order API', 'Orders DB', 'Worker', 'Remember']) expect(svg).toContain(`>${name}<`);
    }
    expect(sketch).toBe(await renderArchitectureSvg(diagram, { theme: SKETCH }));

    // sketch: cream paper, ink outlines, hard shadows, outlined tiles with ink glyphs, square handles.
    expect(background(sketch)).toBe('#FFF8E7');
    expect(sketch).toMatch(/width="18" height="18" color="#111111"/);
    expect(sketch).toContain('width="9" height="9"');
    expect(sketch).toContain('>BACKEND<');
    expect(sketch).not.toContain('filter=');

    // classic: white, rounded grey cards with a soft shadow, tiles in the type's colour with white glyphs, no handles.
    expect(background(classic)).toBe('#ffffff');
    expect(classic).not.toContain('#FFF8E7');
    expect(classic).toContain('<filter id="proschi-arch-shadow"');
    expect(classic).toMatch(/rx="8" fill="#ffffff" stroke="#d1d5db" stroke-width="2" filter="url\(#proschi-arch-shadow\)"/);
    expect(classic).toContain(`width="36" height="36" rx="4" fill="${typeColor('service')}"`);
    expect(classic.match(/width="20" height="20" color="#ffffff"/g)).toHaveLength(4);
    expect(classic).not.toContain('width="9" height="9"');
    expect(classic).toContain('stroke="#3b82f6" stroke-width="2" stroke-dasharray="7 5"');
    expect(classic).toContain('>Backend<');
    expect(classic).toContain('stroke="#b1b1b7" stroke-width="1.5"');
    expect(classic).not.toContain('JetBrains Mono');
  });

  it('renders the sequence diagrams in both themes', () => {
    const sketch = renderSequenceSvg(diagram, useCase, useCase.scenarios[0]);
    const classic = renderSequenceSvg(diagram, useCase, useCase.scenarios[0], '', CLASSIC);
    for (const svg of [sketch, classic]) {
      expect(XMLValidator.validate(svg)).toBe(true);
      expect(svg).toContain('POST /orders');
    }
    // sketch: ink requests, pink outlined step numbers.
    expect(background(sketch)).toBe('#FFF8E7');
    expect(sketch).toContain('fill="#FF5DA2" stroke="#111111" stroke-width="1.5"');
    expect(sketch).toMatch(/<line [^>]*stroke="#111111" stroke-width="2"/);
    // classic: blue requests and step numbers with white digits, grey dashed lifelines, type-coloured tiles.
    expect(background(classic)).toBe('#ffffff');
    expect(classic).toContain('<circle cx="');
    expect(classic).toMatch(/r="8" fill="#3b82f6"\/>/);
    expect(classic).toMatch(/font-weight="700" fill="#ffffff" text-anchor="middle">1</);
    expect(classic).toMatch(/<line [^>]*stroke="#3b82f6" stroke-width="1.5"/);
    expect(classic).toContain('stroke="#d1d5db" stroke-width="1.5" stroke-dasharray="5 4"');
    expect(classic).toContain(`rx="4" fill="${typeColor('database')}"`);
    expect(classic).not.toContain('#FF5DA2');
  });

  it('styles the HTML export with the theme', async () => {
    const dir = project();
    const classic = await renderIn(dir, ['--format', 'html', '--theme', 'classic']);
    expect(classic.code).toBe(0);
    const html = classic.read('main.html');
    expect(html).toContain('--card: #ffffff');
    expect(html).not.toContain('#FFF8E7');
    const sketch = await renderIn(dir, ['--format', 'html']);
    expect(sketch.read('main.html')).toContain('--card: #fff8e7');
  });

  it('uses sketch without a flag or proschi.json', async () => {
    const r = await renderIn(project());
    expect(r.code).toBe(0);
    expect(background(r.read('architecture.svg'))).toBe('#FFF8E7');
  });

  it('selects the theme with --theme', async () => {
    const dir = project();
    const r = await renderIn(dir, ['--theme', 'classic']);
    expect(r.code).toBe(0);
    expect(background(r.read('architecture.svg'))).toBe('#ffffff');
    expect(background(r.read('place-order--main.svg'))).toBe('#ffffff');
    const eq = await renderIn(dir, ['--theme=classic']);
    expect(background(eq.read('architecture.svg'))).toBe('#ffffff');
  });

  it('selects the theme with "theme" in the nearest proschi.json', async () => {
    const dir = project({ theme: 'classic' });
    const r = await renderIn(dir);
    expect(r.code).toBe(0);
    expect(background(r.read('architecture.svg'))).toBe('#ffffff');
    expect(background(r.read('place-order--main.svg'))).toBe('#ffffff');

    // A file in a subfolder finds the proschi.json above it.
    mkdirSync(join(dir, 'sub'));
    writeFileSync(join(dir, 'sub', 'main.proschi'), SOURCE);
    const nested = await renderIn(join(dir, 'sub'));
    expect(nested.code).toBe(0);
    expect(background(nested.read('architecture.svg'))).toBe('#ffffff');
  });

  it('lets --theme override proschi.json', async () => {
    const r = await renderIn(project({ theme: 'classic', openapi: {} }), ['--theme', 'sketch']);
    expect(r.code).toBe(0);
    expect(background(r.read('architecture.svg'))).toBe('#FFF8E7');
  });

  it('refuses an unknown theme, listing the valid ones', async () => {
    const flag = await renderIn(project(), ['--theme', 'neon']);
    expect(flag.code).toBe(2);
    expect(flag.err).toBe("Unknown theme 'neon'; use sketch, classic");

    const missing = await renderIn(project(), ['--theme']);
    expect(missing.code).toBe(2);
    expect(missing.err).toContain('use sketch, classic');

    const dir = project({ theme: 'neon' });
    const config = await renderIn(dir);
    expect(config.code).toBe(2);
    expect(config.err).toBe(`Unknown theme 'neon' in ${join(dir, 'proschi.json')}; use sketch, classic`);

    // A valid flag still wins over a bad name in the config.
    expect((await renderIn(dir, ['--theme', 'classic'])).code).toBe(0);

    const wrongType = await renderIn(project({ theme: 3 }));
    expect(wrongType.code).toBe(2);
    expect(wrongType.err).toContain('"theme" must be a theme name');
  });

  it('gives each inline SVG its own ids in classic too', async () => {
    const { architecture, scenarios } = await renderSvgs(diagram, true, { theme: CLASSIC });
    const ids = [architecture, ...scenarios.map((s) => s.svg)].flatMap((svg) => [...svg.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]));
    expect(new Set(ids).size).toBe(ids.length);
  });
});
