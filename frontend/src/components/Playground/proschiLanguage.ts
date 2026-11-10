import { StreamLanguage, type StreamParser } from '@codemirror/language';
import { snippetCompletion, type Completion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import type { EditorView } from '@codemirror/view';
import type { Text } from '@codemirror/state';
import type { Diagnostic as CmDiagnostic } from '@codemirror/lint';
import { componentCatalog } from '../../catalog/componentCatalog';
import { COLOR_NAMES } from '../../dsl/palette';
import type { Diagnostic } from '../../dsl';

interface LexState {
  inLabel: boolean;
  /** Open { / [ in a payload, so multi-line JSON stays highlighted as a label. */
  depth: number;
  /** Inside a traffic, requirements, capacity, entity, decision or test block, whose own words are keywords. */
  inSection: boolean;
  /** Inside the legend block, where palette names and dashes are words of their own. */
  inLegend?: boolean;
}

const KEYWORDS = /^(title|import|group|usecase|par|alt|section(?=\s+["\w])|pos|color|critical)\b/;
/** The palette of `color <name>` (dsl/palette.ts). */
const COLOR_NAME = new RegExp(`^(?:${COLOR_NAMES.join('|')})\\b`);
const HEX_COLOR = /^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![\w])/;
const LEGEND_HEADER = /^\s*legend\s*\{\s*(?:#.*)?$/;
const HTTP_METHOD = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/;
/** `direction right`, `layout ordered`: layout hints, statements of their own (any other use of the words is a node id). */
const LAYOUT_HINT = /^\s*(?:direction\s+(?:down|right|up|left)|layout\s+ordered)\s*(?:#.*)?$/;
/** `when` is a keyword only right after an alt name: `alt "Name" when "condition" {`. */
const AFTER_ALT_NAME = /^\s*(\}\s*)?alt\s+("(?:[^"\\]|\\.)*"|\w+)\s+$/;

const STRING = '"(?:[^"\\\\]|\\\\.)*"';
/** A line that opens a section block, in the shapes the parser accepts. */
export const SECTION_HEADER = new RegExp(
  `^\\s*(?:(?:traffic|requirements|capacity)\\s*\\{|entity\\s+[A-Za-z_]\\w*\\b.*\\{|(?:decision|test)\\s+${STRING}.*\\{)\\s*(?:#.*)?$`,
);
/** `decision "…" because "…"`: a section statement without a block. */
export const ONE_LINE_DECISION = new RegExp(`^\\s*decision\\s+${STRING}\\s+because\\b`);
/** Words with a meaning inside section blocks (docs/HLD.md). */
const SECTION_WORDS =
  /^(traffic|requirements|capacity|entity|decision|test|mix|durable|volatile|survive|because|rejected|calls|before|after|never|every|waits|for|starts|at|or|responds|writes|reads|responding|handles|failure|path|replicas|any|strong|eventual|store|in|scenario|latency|availability|cost|shards|consistency|bandwidth|egress|timeout|no|from|to|has|of|node|key|index|unique|optional|p50|p90|p95|p99|p999)\b/;
/** A number with an optional fraction and unit, attached or one space away: 120, 2.5, 50ms, 100k rps, 99.9 %. */
const QUANTITY = /^-?\d+(?:\.\d+)?(?:[A-Za-z]+(?:\/[A-Za-z]+)?|%)?(?: (?:rps|rpm|rpd|ms|s|usd\/month|usd\/GB|MB\/s|GB\/s)\b| %)?/;
/** `x200` (fan-out) and `~2MB` (payload size) at the start of a step label (§7.3). */
const LABEL_PREFIX = /^(?:x\d+|~\d+(?:\.\d+)?[KMGT]?B)(?=\s|$)/;
/** Everything after ':' so far is label prefixes, so another one may follow. */
const BEFORE_LABEL_PREFIX = /^[^:]*:\s*(?:(?:x\d+|~\d+(?:\.\d+)?[KMGT]?B)\s+)*$/;

/** Tokenizer behind the highlighting; exported for tests. */
export const proschiStreamParser: StreamParser<LexState> = {
  name: 'proschi',
  startState: () => ({ inLabel: false, depth: 0, inSection: false }),
  token(stream, state) {
    if (stream.sol() && state.depth <= 0) {
      state.inLabel = false;
      state.depth = 0;
      if (/^\s*\}/.test(stream.string)) state.inSection = state.inLegend = false;
      else if (!state.inSection && SECTION_HEADER.test(stream.string)) state.inSection = true;
      else if (!state.inSection && LEGEND_HEADER.test(stream.string)) state.inSection = state.inLegend = true;
    }
    if (stream.eatSpace()) return null;
    // Section words count on header lines and inside the block; the one-line decision has its own.
    const sectionLine = state.inSection || ONE_LINE_DECISION.test(stream.string);

    const afterColor = !state.inLabel && /\bcolor\s+$/.test(stream.string.slice(0, stream.pos));
    // `color #3b82f6`: right after `color` a # is a hex color, not a comment.
    if (afterColor && stream.match(HEX_COLOR)) return 'atom';

    const afterSpace = stream.pos === 0 || /\s/.test(stream.string[stream.pos - 1]);
    if (stream.peek() === '#' && afterSpace && state.depth <= 0) {
      stream.skipToEnd();
      return 'comment';
    }

    if (state.inLabel) {
      if (state.depth <= 0) {
        if (BEFORE_LABEL_PREFIX.test(stream.string.slice(0, stream.pos)) && stream.match(LABEL_PREFIX)) return 'number';
        if (stream.match(HTTP_METHOD)) return 'keyword';
        if (stream.match(/^\/\S*/)) return 'link';
        if (stream.match(/^\d{3}\b/)) return 'number';
        if (stream.match(/^(json|xml|text)\b/)) return 'typeName';
      }
      const ch = stream.next();
      if (ch === '{' || ch === '[') state.depth++;
      else if (ch === '}' || ch === ']') state.depth--;
      return 'string';
    }

    if (stream.match(/^"(?:[^"\\]|\\.)*"?/)) return 'string';
    if (stream.match(/^\[[^\]]*\]?/)) return 'typeName';
    if (stream.match(/^@[\w-]*/)) return 'attributeName';
    if (stream.match(/^(->>|-->|->|-x(?!\w))/)) return 'operator';
    if (stream.match(QUANTITY)) return 'number';
    if (stream.match(/^[<>]=?/)) return 'operator';
    if ((afterColor || (state.inLegend && stream.string.slice(0, stream.pos).trim())) && stream.match(COLOR_NAME)) return 'atom';
    if (state.inLegend && stream.match(/^(legend|dashed|dotted|color)\b/)) return 'keyword';
    if (!state.inLegend && sectionLine && stream.match(SECTION_WORDS)) return 'keyword';
    // `.planned`: a legend tag on a node, group or connection.
    if (stream.match(/^\.[A-Za-z_]\w*/)) return 'attributeName';
    // `x3` after a node id is its replica count.
    if (!sectionLine && stream.string.slice(0, stream.pos).trim() && stream.match(/^x\d+\b/)) return 'number';
    if (stream.match(KEYWORDS)) return 'keyword';
    if (!state.inSection && LAYOUT_HINT.test(stream.string)) {
      if (stream.match(/^(direction|layout)\b/)) return 'keyword';
      if (stream.match(/^(down|right|up|left|ordered)\b/)) return 'atom';
    }
    // `rank 2`, `rank first`: a node or group part.
    const before = stream.string.slice(0, stream.pos);
    if (!sectionLine && before.trim() && stream.match(/^rank(?=\s+(?:\d+|first|last)\b)/)) return 'keyword';
    if (/\brank\s+$/.test(before) && stream.match(/^(first|last)\b/)) return 'atom';
    if (AFTER_ALT_NAME.test(stream.string.slice(0, stream.pos)) && stream.match(/^when\b/)) return 'keyword';
    if (stream.match(/^[A-Za-z_]\w*/)) return 'variableName';
    if (stream.eat(':')) {
      state.inLabel = true;
      return 'punctuation';
    }
    if (stream.match(/^[{}]/)) return 'brace';
    if (stream.eat(',')) return 'punctuation';
    stream.next();
    return null;
  },
  languageData: { commentTokens: { line: '#' } },
};

/** Syntax highlighting for Proschi documents. */
export const proschiLanguage = StreamLanguage.define(proschiStreamParser);

/** Inserts `tech` and closes the bracket unless it already is. */
const applyTech = (tech: string) => (view: EditorView, _completion: Completion, from: number, to: number) => {
  const closed = view.state.sliceDoc(to, to + 1) === ']';
  const insert = closed ? tech : `${tech}]`;
  view.dispatch({ changes: { from, to, insert }, selection: { anchor: from + insert.length + (closed ? 1 : 0) } });
};

/** Every catalog tech, and each alias (`S3`, `Postgres`) inserting the tech it stands for. */
const techOptions: Completion[] = componentCatalog.flatMap((c) => [
  { label: c.techStack, type: 'type', detail: c.category, apply: applyTech(c.techStack) },
  ...('aliases' in c ? c.aliases : []).map((alias: string) => ({ label: alias, type: 'type', detail: `→ ${c.techStack}`, boost: -1, apply: applyTech(c.techStack) })),
]);

const keywordOptions: Completion[] = [
  { label: 'title', type: 'keyword', apply: 'title "', detail: 'document title' },
  { label: 'import', type: 'keyword', apply: 'import "', detail: 'import "file.proschi"' },
  { label: 'group', type: 'keyword', detail: 'group id "Name" { … }' },
  { label: 'usecase', type: 'keyword', apply: 'usecase "', detail: 'usecase "Name" { … }' },
  { label: 'par', type: 'keyword', apply: 'par {', detail: 'parallel steps' },
  { label: 'alt', type: 'keyword', apply: 'alt "', detail: 'alt "Scenario" { … }' },
  { label: 'section', type: 'keyword', apply: 'section "', detail: 'section "Name" { steps }' },
  snippetCompletion('legend {\n\t${tag} "${What it means}" ${blue}\n}', { label: 'legend', type: 'keyword', detail: 'styles that .tag applies' }),
  // Layout hints (docs/STYLING.md, "Steering the layout").
  snippetCompletion('direction ${right}', { label: 'direction', type: 'keyword', detail: 'down, right, up or left' }),
  { label: 'layout ordered', type: 'keyword', detail: 'edges follow declaration order' },
  // The high-level design sections, top level only.
  snippetCompletion('traffic {\n\t"${Use case}" ${100 rps}\n}', { label: 'traffic', type: 'keyword', detail: 'requests per use case' }),
  snippetCompletion('requirements {\n\tp99 < ${200ms}\n}', { label: 'requirements', type: 'keyword', detail: 'latency, availability, durability, cost' }),
  snippetCompletion('capacity {\n\t${node} ${1k rps}\n}', { label: 'capacity', type: 'keyword', detail: 'per-replica overrides' }),
  snippetCompletion('entity ${Name} in ${store} {\n\t${id} ${uuid} key\n}', { label: 'entity', type: 'keyword', detail: 'entity Name in store { fields }' }),
  snippetCompletion('decision "${Title}" {\n\tbecause "${reason}"\n}', { label: 'decision', type: 'keyword', detail: 'a trade-off and its reasons' }),
  snippetCompletion('test "${Name}" {\n\t${}\n}', { label: 'test', type: 'keyword', detail: 'flow assertions' }),
];

/** Assertion forms, offered at the start of a line inside a test block. */
const assertionOptions: Completion[] = [
  ['"${Use case}" calls ${node}', '"Use case" calls', 'some scenario calls it'],
  ['"${Use case}" never calls ${node}', '"Use case" never calls', 'no scenario calls it'],
  ['"${Use case}" every scenario calls ${node}', '"Use case" every scenario calls', 'every scenario calls it'],
  ['"${Use case}" calls ${node} before ${other}', '"Use case" calls … before …', 'first call before first call'],
  ['"${Use case}" calls ${node} after ${other}', '"Use case" calls … after …', 'last call after first call'],
  ['"${Use case}" never waits for ${node}', '"Use case" never waits for', 'no synchronous call before responding'],
  ['"${Use case}" writes ${node} before responding', '"Use case" writes … before responding', 'durable before the answer'],
  ['"${Use case}" responds ${status}', '"Use case" responds', 'status of the entry response'],
  ['"${Use case}" starts at ${node}', '"Use case" starts at', 'who sends the entry request'],
  ['"${Use case}" has scenario "${Scenario}"', '"Use case" has scenario', 'the scenario exists'],
  ['"${Use case}" handles failure of ${node}', '"Use case" handles failure of', 'a scenario survives it failing'],
  ['${node} calls ${other}', 'node calls node', 'some step is sent from one to the other'],
  ['${node} never calls ${other}', 'node never calls node', 'no step is sent from one to the other'],
  ['in "${Use case}" ${node} calls ${other}', 'in "Use case" node calls node', 'sent within one use case'],
  ['no path from ${node} to ${other}', 'no path from … to …', 'no chain of connections'],
  ['${node} has replicas >= ${min}', 'node has replicas >=', 'minimum replica count'],
].map(([template, label, detail]) => snippetCompletion(template, { label, type: 'keyword', detail }));

/** True when line `number` (1-based) is inside a `test "…" {` block. */
function inTestBlock(doc: Text, number: number): boolean {
  for (let n = number - 1; n >= 1; n--) {
    const text = doc.line(n).text;
    if (/^\s*\}/.test(text)) return false;
    if (/\{\s*(?:#.*)?$/.test(text)) return /^\s*test\s+"/.test(text);
  }
  return false;
}

/** A tech the editor offers inside [ ], when a page narrows the catalog (the Arcade offers only what the player may place). */
export interface TechChoice {
  tech: string;
  /** Shown next to it, e.g. the game's name for the component. */
  detail?: string;
}

/** Completes tech stacks inside [ ] and node ids / keywords elsewhere; `getTechs` narrows the techs offered when it returns a list. */
export function proschiCompletions(getNodeIds: () => string[], getTechs?: () => readonly TechChoice[] | undefined) {
  return (ctx: CompletionContext): CompletionResult | null => {
    const line = ctx.state.doc.lineAt(ctx.pos);
    const before = line.text.slice(0, ctx.pos - line.from);

    const tech = before.match(/\[([^\]]*)$/);
    if (tech) {
      const only = getTechs?.();
      const options = only ? only.map((t) => ({ label: t.tech, type: 'type', detail: t.detail, apply: applyTech(t.tech) })) : techOptions;
      return { from: ctx.pos - tech[1].length, options, validFor: /^[\w ./-]*$/ };
    }

    // Labels after ':' are free text.
    if (/^[^"#]*:/.test(before)) return null;

    const word = ctx.matchBefore(/[A-Za-z_]\w*/);
    if (!word && !ctx.explicit) return null;
    const from = word?.from ?? ctx.pos;
    const atLineStart = before.slice(0, from - line.from).trim() === '';
    // `when` is only valid right after an alt name: alt "Not found" when "…" {
    if (/^\s*(\}\s*)?alt\s+"[^"]*"\s+$/.test(before.slice(0, from - line.from))) {
      return { from, options: [{ label: 'when', type: 'keyword', apply: 'when "', detail: 'condition of this scenario' }], validFor: /^\w*$/ };
    }

    const ids: Completion[] = getNodeIds().map((id) => ({ label: id, type: 'variable' }));
    if (atLineStart && inTestBlock(ctx.state.doc, line.number)) return { from, options: [...assertionOptions, ...ids], validFor: /^\w*$/ };
    return { from, options: atLineStart ? [...keywordOptions, ...ids] : ids, validFor: /^\w*$/ };
  };
}

/** Maps parser diagnostics (1-based line/col) onto document offsets. */
export function toCmDiagnostics(diagnostics: Diagnostic[], doc: Text): CmDiagnostic[] {
  return diagnostics
    .filter((d) => d.line <= doc.lines)
    .map((d) => {
      const line = doc.line(d.line);
      const from = Math.min(line.from + d.col - 1, line.to);
      const to = Math.min(from + Math.max(d.length, 1), line.to);
      return { from, to: Math.max(to, from), severity: d.severity, message: d.message };
    });
}
