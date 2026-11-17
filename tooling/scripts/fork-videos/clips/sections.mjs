// Use case `section` blocks: the source next to the sequence SVG that
// `proschi render` draws from it, one titled frame per section (and par).
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launchBrowser } from '../lib/browser.mjs';
import { proschi, sleep } from '../lib/env.mjs';

export const title = 'Language: use case sections, drawn as frames in sequence diagrams';
export const needs = ['google-chrome'];

/** Which scenarios to show, in order: the use case's name and the scenario's file slug. */
const SHOTS = [
  { useCase: 'Create order', slug: 'create-order--created', note: 'Sections label runs of steps; they can sit inside an alt branch, next to a par' },
  { useCase: 'Get order', slug: 'get-order--cache-miss', note: 'A section can wrap alt branches: every scenario of the use case draws its frame' },
  { useCase: 'Cancel order', slug: 'cancel-order--cancelled', note: 'Several sections in one branch, each its own frame' },
];

/** The `usecase "<name>" … { … }` block of `source`, by counting braces outside strings. */
export function useCaseBlock(source, name) {
  const start = source.search(new RegExp(`^usecase\\s+"${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, 'm'));
  if (start < 0) return undefined;
  let depth = 0;
  let inString = false;
  for (let i = start; i < source.length; i++) {
    const c = source[i];
    if (inString) {
      if (c === '\\') i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === '#') i = source.indexOf('\n', i) - 1;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  return source.slice(start);
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Source lines as HTML: keywords and strings coloured, lines inside a section or par tinted. */
function sourceHtml(block) {
  const stack = [];
  return block
    .split('\n')
    .map((line) => {
      // A line that starts with } closes a block; one that ends with { opens one (a keyword's, or a request body's).
      if (/^\s*}/.test(line)) stack.pop();
      if (/{\s*$/.test(line)) stack.push(/^\s*(?:}\s*)?(section|par|alt|usecase)\b/.exec(line)?.[1] ?? 'body');
      const kinds = new Set(stack);
      const cls = kinds.has('section') ? (kinds.has('par') ? 'in-section in-par' : 'in-section') : kinds.has('par') ? 'in-par' : '';
      const html = esc(line)
        .replace(/("(?:[^"\\]|\\.)*")/g, '<span class="str">$1</span>')
        .replace(/^(\s*(?:}\s*)?)(usecase|section|par|alt)\b/, '$1<span class="kw kw-$2">$2</span>');
      return `<div class="line ${cls}">${html || ' '}</div>`;
    })
    .join('');
}

function pageHtml({ source, svg, useCase, slug }) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(slug)}</title><style>
  html,body{margin:0;height:100%;background:#f4f1ea;color:#1d1d1f;font:14px/1.4 system-ui,sans-serif}
  .wrap{display:grid;grid-template-columns:minmax(0,36fr) minmax(0,64fr);height:100vh}
  .src{overflow:auto;background:#1e1e24;color:#e6e6e6;padding:14px 0;font:11px/1.5 'DejaVu Sans Mono',ui-monospace,monospace}
  .src h2{font:600 12px system-ui;color:#9aa0aa;margin:0 16px 10px;text-transform:uppercase;letter-spacing:.06em}
  .line{white-space:pre;padding:0 16px;border-left:4px solid transparent}
  .in-section{background:rgba(255,200,60,.10);border-left-color:#f5c542}
  .in-par{background:rgba(120,170,255,.13)}
  .in-section.in-par{border-left-color:#7aa7ff}
  .kw{color:#c792ea;font-weight:bold}.kw-section{color:#ffd166;background:rgba(255,209,102,.18);border-radius:3px;padding:0 2px}.kw-par{color:#8fb8ff}
  .str{color:#a5d6a7}
  .out{overflow:auto;padding:18px}
  .out h2{font:600 12px system-ui;color:#6b6b6b;margin:0 0 10px;text-transform:uppercase;letter-spacing:.06em}
  .out svg{display:block;width:100%;height:auto;background:#fff;border:1px solid #ddd;transition:width 1.4s ease}
  </style></head><body><div class="wrap">
  <div class="src"><h2>${esc(useCase)} · source</h2>${sourceHtml(source)}</div>
  <div class="out"><h2>proschi render → ${esc(slug)}.svg</h2>${svg}</div>
  </div></body></html>`;
}

/** Scrolls `selector` all the way along `axis` ('left' or 'top') over `ms`. */
function pan(page, selector, axis, ms) {
  return page.evaluate(
    ([selector, axis, ms]) =>
      new Promise((resolve) => {
        const el = document.querySelector(selector);
        const max = axis === 'left' ? el.scrollWidth - el.clientWidth : el.scrollHeight - el.clientHeight;
        if (max <= 0) return resolve();
        const prop = axis === 'left' ? 'scrollLeft' : 'scrollTop';
        const t0 = performance.now();
        const tick = (now) => {
          const t = Math.min(1, (now - t0) / ms);
          el[prop] = max * (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
          if (t < 1) requestAnimationFrame(tick);
          else resolve();
        };
        requestAnimationFrame(tick);
      }),
    [selector, axis, ms],
  );
}

export async function record({ screen, rec, diagram, work }) {
  const source = readFileSync(diagram, 'utf8');
  proschi('render', '--out', work, diagram);
  const pages = SHOTS.map((shot) => {
    const block = useCaseBlock(source, shot.useCase);
    if (!block) throw new Error(`No usecase "${shot.useCase}" in ${diagram}`);
    const file = join(work, `${shot.slug}.html`);
    writeFileSync(file, pageHtml({ source: block, svg: readFileSync(join(work, `${shot.slug}.svg`), 'utf8'), ...shot }));
    return { ...shot, url: pathToFileURL(file).href };
  });

  const { browser, page } = await launchBrowser(screen);
  try {
    await page.goto(pages[0].url);
    await sleep(800);
    rec.start();
    rec.caption("`section \"Name\" { … }` in a use case → a titled frame in its sequence diagram");
    await sleep(4000);
    for (const [i, p] of pages.entries()) {
      if (i) await page.goto(p.url);
      rec.caption(p.note);
      await sleep(4000);
      // Zoom into the diagram and pan across its frames, while the source scrolls to its later sections.
      // To the SVG's own size (1:1), when that is wider than the column.
      await page.evaluate(() => {
        const svg = document.querySelector('.out svg');
        svg.style.width = `${svg.clientWidth}px`;
        void svg.offsetWidth;
        svg.style.width = `${Math.max(svg.clientWidth, Number(svg.getAttribute('width')) || 0)}px`;
      });
      await sleep(1600);
      await Promise.all([pan(page, '.out', 'left', 6000), pan(page, '.src', 'top', 6000)]);
      await sleep(1200);
      await page.evaluate(() => {
        const out = document.querySelector('.out');
        out.scrollTo({ left: 0, behavior: 'smooth' });
        out.querySelector('svg').style.width = `${out.clientWidth - 36}px`;
      });
      await sleep(2000);
    }
    await rec.stop();
  } finally {
    await browser.close();
  }
}
