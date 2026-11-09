/**
 * A tiny, display-only highlighter for Proschi snippets on the landing page.
 * It does not try to be the real lexer (that lives in ../dsl/lexer.ts and pulls
 * in the component catalog); it only needs to make short examples readable.
 */

export type TokenClass = 'keyword' | 'string' | 'tech' | 'team' | 'arrow' | 'comment' | 'status' | 'number';

export interface Segment {
  text: string;
  cls?: TokenClass;
}

const TOKEN =
  /("(?:[^"\\]|\\.)*")|(\[[A-Za-z][^\]"]*\])|(@[A-Za-z_][\w-]*)|(-->|->>|->|-x(?!\w))|((?:^\s*|\}\s*)(?:title|import|group|usecase|par|alt|section(?=\s+["\w]))\b)|((?:^|\s)#.*$)|(\b[1-5]\d\d\b)|((?<=\balt\s+"(?:[^"\\]|\\.)*"\s+)when\b)|((?<=^[^:"]*:\s*(?:(?:x\d+|~\d+(?:\.\d+)?[KMGT]?B)\s+)*)(?:x\d+|~\d+(?:\.\d+)?[KMGT]?B)(?=\s|$))/g;

/** The last group is a `x200` / `~2MB` label prefix (§7.3). */
const CLASSES: TokenClass[] = ['string', 'tech', 'team', 'arrow', 'keyword', 'comment', 'status', 'keyword', 'number'];

/**
 * Lines of the high-level design blocks (traffic, requirements, capacity,
 * entity, decision, test): their own words are keywords and quantities are
 * numbers.
 */
const SECTION_TOKEN =
  /("(?:[^"\\]|\\.)*")|(\[[A-Za-z][^\]"]*\])|((?:^|\s)#.*$)|(\b\d+(?:\.\d+)?(?:[A-Za-z]+(?:\/[A-Za-z]+)?|%)?(?: (?:rps|rpm|rpd|ms|s|usd\/month|usd\/GB|MB\/s|GB\/s)\b| %)?)|(\b(?:traffic|requirements|capacity|entity|decision|test|mix|durable|volatile|survive|because|rejected|calls|before|after|never|every|waits|for|starts|at|or|responds|writes|reads|responding|handles|failure|path|replicas|any|strong|eventual|store|in|scenario|latency|availability|cost|shards|consistency|bandwidth|egress|timeout|no|from|to|has|of|node|key|index|unique|optional|p50|p90|p95|p99|p999)\b|[<>]=?)/g;

const SECTION_CLASSES: TokenClass[] = ['string', 'tech', 'comment', 'number', 'keyword'];

/** A line that opens a section block, or the one-line `decision "…" because "…"`. */
const SECTION_HEADER =
  /^\s*(?:(?:traffic|requirements|capacity)\s*\{|entity\s+[A-Za-z_]\w*\b.*\{|(?:decision|test)\s+"(?:[^"\\]|\\.)*".*\{|decision\s+"(?:[^"\\]|\\.)*"\s+because\b)/;

/** Highlights one line; `inSection` for a line inside a section block. */
export function highlightLine(line: string, inSection = false): Segment[] {
  const section = inSection || SECTION_HEADER.test(line);
  const out: Segment[] = [];
  let last = 0;
  for (const m of line.matchAll(section ? SECTION_TOKEN : TOKEN)) {
    const index = m.index ?? 0;
    const group = m.slice(1).findIndex((g) => g !== undefined);
    if (index > last) out.push({ text: line.slice(last, index) });
    out.push({ text: m[0], cls: (section ? SECTION_CLASSES : CLASSES)[group] });
    last = index + m[0].length;
  }
  if (last < line.length) out.push({ text: line.slice(last) });
  return out;
}

/** Highlights a whole snippet, following section blocks from line to line. */
export function highlightLines(lines: string[]): Segment[][] {
  let inSection = false;
  return lines.map((line) => {
    if (/^\s*\}/.test(line)) inSection = false;
    const segments = highlightLine(line, inSection);
    if (!inSection && SECTION_HEADER.test(line) && /\{\s*(?:#.*)?$/.test(line)) inSection = true;
    return segments;
  });
}

/** Replaces the text of a `<pre><code>` with one highlighted block per line. */
export function highlightElement(code: HTMLElement): string[] {
  const source = code.textContent ?? '';
  const lines = source.split('\n');
  const frag = document.createDocumentFragment();
  for (const segments of highlightLines(lines)) {
    const row = document.createElement('span');
    row.className = 'line';
    for (const seg of segments) {
      if (!seg.cls) {
        row.append(seg.text);
        continue;
      }
      const span = document.createElement('span');
      span.className = `tok-${seg.cls}`;
      span.textContent = seg.text;
      row.append(span);
    }
    frag.append(row);
  }
  code.replaceChildren(frag);
  return lines;
}
