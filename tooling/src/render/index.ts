/**
 * `proschi render`: a document as static files. `svg` writes the architecture
 * and one sequence diagram per scenario, `md` one Markdown file with Mermaid
 * blocks (GitHub renders them), `html` one self-contained page with the SVGs.
 * `hld-md` and `hld-html` write the high-level design document instead.
 */
import { EXPORT_CSP, toMermaidArchitecture, toMermaidSequence, type Diagram, type DiagramScenario, type DiagramUseCase } from '../proschi';
import { renderArchitectureSvg, type ArchitectureOptions } from './architecture';
import { renderSequenceSvg, scenarioTitle } from './sequence';
import { renderHldHtml, renderHldMarkdown } from './hld';
import { esc } from './svg';
import { SKETCH, type RenderTheme } from './theme';

export { renderArchitectureSvg } from './architecture';
export { renderSequenceSvg, scenarioTitle } from './sequence';
export { DEFAULT_THEME, THEME_NAMES, getTheme, isThemeName, type RenderTheme, type ThemeName } from './theme';

export const FORMATS = ['svg', 'md', 'html', 'hld-md', 'hld-html'] as const;
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

/** The files `proschi render` writes for `format`; `baseName` names the single md/html file. */
export async function renderFiles(diagram: Diagram, format: RenderFormat, baseName: string, options: ArchitectureOptions = {}): Promise<RenderedFile[]> {
  if (format === 'md') return [{ name: `${baseName}.md`, content: renderMarkdown(diagram) }];
  if (format === 'html') return [{ name: `${baseName}.html`, content: renderHtml(diagram, await renderSvgs(diagram, true, options), options.theme) }];
  if (format === 'hld-md') return [{ name: `${baseName}.hld.md`, content: renderHldMarkdown(diagram) }];
  if (format === 'hld-html') return [{ name: `${baseName}.hld.html`, content: renderHldHtml(diagram, await renderSvgs(diagram, true, options)) }];
  const { architecture, scenarios } = await renderSvgs(diagram, false, options);
  return [{ name: 'architecture.svg', content: `${architecture}\n` }, ...scenarios.map((s) => ({ name: `${s.slug}.svg`, content: `${s.svg}\n` }))];
}
