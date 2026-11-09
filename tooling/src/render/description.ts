/**
 * A use case's description as readable HTML for the `preview-html` page.
 * Descriptions are free text; this only finds structure that is clearly
 * there. The text is split into sentences, and a sentence of the form
 * `Label: name (details); name (details); …` becomes a table with a row per
 * item (a row whose name is one of the use case's scenarios carries its
 * slug, so the page can mark the picked one). Everything else stays prose.
 * All text is escaped.
 */
import { esc } from './svg';

export type DescriptionBlock = { kind: 'text'; sentences: string[] } | { kind: 'table'; label: string; rows: { name: string; detail: string }[] };

const OPEN = '([{';
const CLOSE = ')]}';

/** Splits `text` at the indexes where `at` says so, outside brackets; the split character is dropped unless `keep`. */
function splitTopLevel(text: string, at: (i: number) => boolean, keep: boolean): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (OPEN.includes(c)) depth++;
    else if (CLOSE.includes(c)) depth = Math.max(0, depth - 1);
    else if (depth === 0 && at(i)) {
      parts.push(text.slice(start, keep ? i + 1 : i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts.map((p) => p.trim()).filter(Boolean);
}

/** Sentences end at a full stop followed by space and a capital letter or digit (so `FINDINGS.md` and `e.g. x` stay whole). */
export function sentences(text: string): string[] {
  return splitTopLevel(text, (i) => text[i] === '.' && /^\s+[A-Z0-9]/.test(text.slice(i + 1, i + 3)), true);
}

/** `name (detail)`, the detail being the last top-level bracket group; undefined when the item has no such group. */
function nameAndDetail(item: string): { name: string; detail: string } | undefined {
  if (!item.endsWith(')')) return undefined;
  let depth = 0;
  for (let i = item.length - 1; i >= 0; i--) {
    if (item[i] === ')') depth++;
    else if (item[i] === '(' && --depth === 0) {
      const name = item.slice(0, i).trim();
      const detail = item.slice(i + 1, -1).trim();
      // A name is short and has no comma; anything longer is prose that happens to end in brackets.
      return name && detail && name.length <= 60 && !name.includes(',') ? { name, detail } : undefined;
    }
  }
  return undefined;
}

function asTable(sentence: string): DescriptionBlock | undefined {
  const m = /^([A-Z][\w' -]{0,40}?):\s+([\s\S]+?)\.?$/.exec(sentence);
  if (!m) return undefined;
  const rows = splitTopLevel(m[2], (i) => m[2][i] === ';', false).map(nameAndDetail);
  if (!rows.length || rows.some((r) => !r)) return undefined;
  return { kind: 'table', label: m[1], rows: rows as { name: string; detail: string }[] };
}

/** The description as blocks: runs of prose, and tables. */
export function describe(text: string): DescriptionBlock[] {
  const blocks: DescriptionBlock[] = [];
  for (const sentence of sentences(text)) {
    const table = asTable(sentence);
    const last = blocks[blocks.length - 1];
    if (table) blocks.push(table);
    else if (last?.kind === 'text') last.sentences.push(sentence);
    else blocks.push({ kind: 'text', sentences: [sentence] });
  }
  return blocks;
}

/** The description as HTML; `scenarioSlugs` maps a scenario name to its slug, for the rows that name one. */
export function descriptionHtml(text: string, scenarioSlugs: ReadonlyMap<string, string> = new Map()): string {
  return describe(text)
    .map((block) => {
      if (block.kind === 'text') return `<p>${esc(block.sentences.join(' '))}</p>`;
      const rows = block.rows
        .map((r) => {
          const slug = scenarioSlugs.get(r.name);
          return `<tr${slug ? ` data-slug="${esc(slug)}"` : ''}><td>${esc(r.name)}</td><td>${esc(r.detail)}</td></tr>`;
        })
        .join('');
      return `<table><thead><tr><th>${esc(block.label)}</th><th>Notes</th></tr></thead><tbody>${rows}</tbody></table>`;
    })
    .join('');
}
