/**
 * `proschi render`: a document as static files. `svg` writes the architecture
 * and one sequence diagram per scenario, `md` one Markdown file with Mermaid
 * blocks (GitHub renders them), `html` one self-contained page with the SVGs,
 * `preview-html` one page like the VS Code preview (a foldable architecture
 * and a scenario picker). `hld-md` and `hld-html` write the high-level design
 * document instead.
 */
import { createHash } from 'node:crypto';
import { EXPORT_CSP, toMermaidArchitecture, toMermaidSequence, type Diagram, type DiagramScenario, type DiagramUseCase } from '../proschi';
import { renderArchitectureSvg, type ArchitectureOptions } from './architecture';
import { renderSequenceSvg, scenarioTitle } from './sequence';
import { renderHldHtml, renderHldMarkdown } from './hld';
import { descriptionHtml } from './description';
import { esc } from './svg';
import { SKETCH, type RenderTheme } from './theme';

export { renderArchitectureSvg } from './architecture';
export { renderSequenceSvg, scenarioTitle } from './sequence';
export { DEFAULT_THEME, THEME_NAMES, getTheme, isThemeName, type RenderTheme, type ThemeName } from './theme';

export const FORMATS = ['svg', 'md', 'html', 'preview-html', 'hld-md', 'hld-html'] as const;
export type RenderFormat = (typeof FORMATS)[number];

export interface RenderedFile {
  name: string;
  content: string;
}

export interface RenderedScenario {
  useCase: DiagramUseCase;
  scenario: DiagramScenario;
  title: string;
  /** `<usecase>--<scenario>`, also used as the HTML anchor. */
  slug: string;
  svg: string;
}

export interface RenderedDiagram {
  architecture: string;
  scenarios: RenderedScenario[];
}

export function scenarioSlug(useCase: DiagramUseCase, scenario: DiagramScenario): string {
  return `${useCase.id}--${scenario.id}`;
}

/**
 * Every SVG of a diagram. With `inline`, ids inside each SVG get a unique
 * prefix so several can share one HTML page. `options.theme` (default sketch)
 * styles the architecture and every sequence diagram.
 */
export async function renderSvgs(diagram: Diagram, inline = false, options: ArchitectureOptions = {}): Promise<RenderedDiagram> {
  const architecture = await renderArchitectureSvg(diagram, options);
  let n = 0;
  const scenarios = diagram.useCases.flatMap((useCase) =>
    useCase.scenarios.map((scenario) => ({
      useCase,
      scenario,
      title: scenarioTitle(useCase, scenario),
      slug: scenarioSlug(useCase, scenario),
      svg: renderSequenceSvg(diagram, useCase, scenario, inline ? `s${++n}-` : '', options.theme),
    })),
  );
  return { architecture, scenarios };
}

export function renderMarkdown(diagram: Diagram): string {
  const fence = (code: string) => ['```mermaid', code.trimEnd(), '```', ''];
  const out = [`# ${diagram.title ?? 'Architecture'}`, '', '## Architecture', '', ...fence(toMermaidArchitecture(diagram))];
  if (diagram.useCases.length) out.push('## Use cases', '');
  for (const useCase of diagram.useCases) {
    out.push(`### ${useCase.name}`, '');
    const about = [useCase.endpoint && `\`${useCase.endpoint}\``, useCase.description].filter(Boolean).join(' · ');
    if (about) out.push(about, '');
    for (const scenario of useCase.scenarios) {
      if (useCase.scenarios.length > 1) out.push(`#### ${scenario.name}${scenario.outcome === 'error' ? ' (error)' : ''}`, '');
      out.push(...fence(toMermaidSequence(diagram, useCase.id, scenario.id)));
    }
  }
  return out.join('\n');
}

const pageStyle = (th: RenderTheme) => `
:root { color-scheme: light dark; ${th.page.light} }
@media (prefers-color-scheme: dark) { :root { ${th.page.dark} } }
* { box-sizing: border-box; }
body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: var(--bg); color: var(--fg); }
header { padding: 20px 24px 8px; }
h1 { margin: 0; font-size: 22px; }
main { display: flex; gap: 24px; padding: 8px 24px 24px; align-items: flex-start; }
nav { position: sticky; top: 16px; flex: 0 0 240px; font-size: 14px; }
nav ul { list-style: none; margin: 0; padding: 0; }
nav ul ul { padding-left: 14px; }
nav li { margin: 4px 0; }
nav a { color: var(--link); text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 3px; }
nav a:hover { text-decoration-thickness: 2px; }
nav .error, h2 .error { color: var(--error); }
.content { flex: 1; min-width: 0; }
section { margin-bottom: 24px; }
h2 { font-size: 16px; margin: 0 0 8px; }
.about { color: var(--muted); font-size: 13px; margin: -4px 0 8px; }
figure { margin: 0; overflow-x: auto; ${th.page.figure} }
figure svg { display: block; max-width: none; }
@media (max-width: 760px) { main { flex-direction: column; } nav { position: static; flex: none; } }
`;

export function renderHtml(diagram: Diagram, rendered: RenderedDiagram, theme: RenderTheme = SKETCH): string {
  const title = diagram.title ?? 'Architecture';
  const nav: string[] = ['<li><a href="#architecture">Architecture</a></li>'];
  const sections: string[] = [`<section id="architecture"><h2>Architecture</h2><figure>${rendered.architecture}</figure></section>`];
  for (const useCase of diagram.useCases) {
    const items = rendered.scenarios.filter((s) => s.useCase === useCase);
    const link = (s: RenderedScenario, label: string) =>
      `<a href="#${esc(s.slug)}"${s.scenario.outcome === 'error' ? ' class="error"' : ''}>${esc(label)}</a>`;
    if (items.length === 1) nav.push(`<li>${link(items[0], useCase.name)}</li>`);
    else nav.push(`<li>${esc(useCase.name)}<ul>${items.map((s) => `<li>${link(s, s.scenario.name)}</li>`).join('')}</ul></li>`);
    for (const s of items) {
      const about = [useCase.endpoint, useCase.description].filter(Boolean).join(' · ');
      sections.push(
        `<section id="${esc(s.slug)}"><h2>${esc(s.title)}${s.scenario.outcome === 'error' ? ' <span class="error">(error)</span>' : ''}</h2>` +
          `${about ? `<p class="about">${esc(about)}</p>` : ''}<figure>${s.svg}</figure></section>`,
      );
    }
  }
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    // No scripts and nothing remote: content from the document can never run, even if escaping missed something.
    `<meta http-equiv="Content-Security-Policy" content="${EXPORT_CSP}">`,
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${esc(title)}</title>`,
    `<style>${pageStyle(theme)}</style>`,
    '</head>',
    '<body>',
    `<header><h1>${esc(title)}</h1></header>`,
    `<main><nav><ul>${nav.join('')}</ul></nav><div class="content">`,
    ...sections,
    '</div></main>',
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

const previewStyle = (th: RenderTheme) => `${pageStyle(th)}
.content { max-width: none; }
details { margin-bottom: 24px; }
summary { cursor: pointer; font-size: 16px; font-weight: 600; margin-bottom: 8px; }
details.description { margin-bottom: 12px; font-size: 14px; line-height: 1.5; }
details.description summary { font-size: 14px; color: var(--muted); }
details.description p { margin: 0 0 8px; max-width: 900px; }
details.description table { border-collapse: collapse; margin: 0 0 12px; }
details.description th, details.description td { text-align: left; vertical-align: top; padding: 4px 12px 4px 0; border-bottom: 1px solid color-mix(in srgb, var(--muted) 30%, transparent); }
details.description th { font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); }
details.description td:first-child { white-space: nowrap; font-weight: 600; }
details.description tr.current td { color: var(--link); }
details.description tr.current td:first-child::before { content: '▸ '; }
.picker { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 8px; font-size: 14px; }
.picker select { font: inherit; padding: 2px 4px; max-width: 100%; }
.picker .count { color: var(--muted); font-size: 13px; }
[hidden] { display: none !important; }
`;

// Shows the picked scenario, kept in the URL hash so a link (or a reload) opens it.
const PREVIEW_SCRIPT = `
const select = document.getElementById('scenario');
if (select) {
  const figures = document.querySelectorAll('.scenario');
  const useCases = document.querySelectorAll('.usecase');
  const rows = document.querySelectorAll('.description tr[data-slug]');
  const show = (slug) => {
    figures.forEach((el) => { el.hidden = el.dataset.slug !== slug; });
    useCases.forEach((el) => { el.hidden = !el.querySelector('.scenario:not([hidden])'); });
    rows.forEach((el) => { el.classList.toggle('current', el.dataset.slug === slug); });
  };
  // Every description folds and unfolds together, so switching scenarios keeps it as you left it.
  const descriptions = document.querySelectorAll('details.description');
  descriptions.forEach((d) => d.addEventListener('toggle', () => {
    descriptions.forEach((other) => { if (other.open !== d.open) other.open = d.open; });
  }));
  const fromHash = () => {
    const slug = decodeURIComponent(location.hash.slice(1));
    if (Array.from(select.options).some((o) => o.value === slug)) select.value = slug;
    show(select.value);
  };
  select.addEventListener('change', () => {
    history.replaceState(null, '', '#' + encodeURIComponent(select.value));
    show(select.value);
  });
  window.addEventListener('hashchange', fromHash);
  fromHash();
}
`;

const cspHash = (code: string) => `'sha256-${createHash('sha256').update(code).digest('base64')}'`;

/**
 * The page like the VS Code preview: the architecture in a `<details>` (open,
 * fold it to save room) and one scenario at a time, picked from a list. Above
 * the scenario, its use case's description, folded, with lists such as
 * `Requests: a (x); b (y)` as tables (see description.ts). Its
 * CSP allows only its own style and script, by hash, so nothing from the
 * document can run; without scripts the first scenario still shows.
 */
export function renderPreviewHtml(diagram: Diagram, rendered: RenderedDiagram, theme: RenderTheme = SKETCH): string {
  const title = diagram.title ?? 'Architecture';
  const style = previewStyle(theme);
  const csp = [`default-src 'none'`, `img-src data:`, `style-src ${cspHash(style)}`, `script-src ${cspHash(PREVIEW_SCRIPT)}`, `base-uri 'none'`, `form-action 'none'`].join('; ');
  const body = [`<details open><summary>Architecture</summary><figure>${rendered.architecture}</figure></details>`];
  if (rendered.scenarios.length) {
    const groups = diagram.useCases
      .map((uc) => {
        const options = rendered.scenarios
          .filter((s) => s.useCase === uc)
          .map((s) => `<option value="${esc(s.slug)}">${esc(uc.scenarios.length > 1 ? s.scenario.name : uc.name)}${s.scenario.outcome === 'error' ? ' (error)' : ''}</option>`)
          .join('');
        return `<optgroup label="${esc(uc.name)}">${options}</optgroup>`;
      })
      .join('');
    const count = `${rendered.scenarios.length} scenario${rendered.scenarios.length === 1 ? '' : 's'}`;
    body.push(
      `<section><label class="picker">Scenario <select id="scenario">${groups}</select><span class="count">${count}</span></label>`,
      ...diagram.useCases.map((uc) => {
        const items = rendered.scenarios.filter((s) => s.useCase === uc);
        if (!items.length) return '';
        const first = items[0] === rendered.scenarios[0];
        const slugs = new Map(items.map((s) => [s.scenario.name, s.slug]));
        const description = uc.description
          ? `<details class="description"><summary>Description</summary>${descriptionHtml(uc.description, slugs)}</details>`
          : '';
        const figures = items.map((s) => `<figure class="scenario" data-slug="${esc(s.slug)}"${s === rendered.scenarios[0] ? '' : ' hidden'}>${s.svg}</figure>`).join('');
        return `<div class="usecase"${first ? '' : ' hidden'}>${description}${figures}</div>`;
      }),
      '</section>',
    );
  } else {
    body.push('<p class="about">No use cases: add a <code>usecase</code> to see its sequence diagrams here.</p>');
  }
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
    `<header><h1>${esc(title)}</h1></header>`,
    '<main><div class="content">',
    ...body,
    '</div></main>',
    `<script>${PREVIEW_SCRIPT}</script>`,
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

/** The files `proschi render` writes for `format`; `baseName` names the single md/html file. */
export async function renderFiles(diagram: Diagram, format: RenderFormat, baseName: string, options: ArchitectureOptions = {}): Promise<RenderedFile[]> {
  if (format === 'md') return [{ name: `${baseName}.md`, content: renderMarkdown(diagram) }];
  if (format === 'html') return [{ name: `${baseName}.html`, content: renderHtml(diagram, await renderSvgs(diagram, true, options), options.theme) }];
  if (format === 'preview-html') return [{ name: `${baseName}.preview.html`, content: renderPreviewHtml(diagram, await renderSvgs(diagram, true, options), options.theme) }];
  if (format === 'hld-md') return [{ name: `${baseName}.hld.md`, content: renderHldMarkdown(diagram) }];
  if (format === 'hld-html') return [{ name: `${baseName}.hld.html`, content: renderHldHtml(diagram, await renderSvgs(diagram, true, options)) }];
  const { architecture, scenarios } = await renderSvgs(diagram, false, options);
  return [{ name: 'architecture.svg', content: `${architecture}\n` }, ...scenarios.map((s) => ({ name: `${s.slug}.svg`, content: `${s.svg}\n` }))];
}
