import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import oniguruma from 'vscode-oniguruma';
import vsctm from 'vscode-textmate';
import { examples } from '../src/proschi';

// The same engine VS Code (and IntelliJ's TextMate support, via its own port) runs.
const require = createRequire(import.meta.url);
await oniguruma.loadWASM(readFileSync(require.resolve('vscode-oniguruma/release/onig.wasm')).buffer);
const registry = new vsctm.Registry({
  onigLib: Promise.resolve({ createOnigScanner: (p: string[]) => new oniguruma.OnigScanner(p), createOnigString: (s: string) => new oniguruma.OnigString(s) }),
  loadGrammar: async () => vsctm.parseRawGrammar(readFileSync(new URL('../grammar/proschi.tmLanguage.json', import.meta.url), 'utf8'), 'proschi.tmLanguage.json'),
});
const grammar = (await registry.loadGrammar('source.proschi'))!;

/** [text, innermost scope] for every token, across lines, keeping rule state like an editor does. */
function tokenize(source: string): [string, string][][] {
  let state = vsctm.INITIAL;
  return source.split('\n').map((line) => {
    const r = grammar.tokenizeLine(line, state);
    state = r.ruleStack;
    return r.tokens
      .map((t) => [line.slice(t.startIndex, t.endIndex), t.scopes[t.scopes.length - 1]] as [string, string])
      .filter(([text]) => text.trim() !== '');
  });
}

const scopeOf = (lines: [string, string][][], text: string) =>
  lines.flat().find(([t]) => t.trim() === text)?.[1];

describe('TextMate grammar', () => {
  it('scopes declarations', () => {
    const [line] = tokenize('  api "Order API" [REST API] @orders pos 10,-20 # note');
    expect(line).toEqual([
      ['api', 'variable.other.node.proschi'],
      ['"', 'punctuation.definition.string.begin.proschi'],
      ['Order API', 'string.quoted.double.proschi'],
      ['"', 'punctuation.definition.string.end.proschi'],
      ['[REST API]', 'entity.name.type.tech.proschi'],
      ['@orders', 'entity.other.attribute-name.team.proschi'],
      ['pos', 'keyword.other.pos.proschi'],
      ['10', 'constant.numeric.proschi'],
      [',', 'punctuation.separator.comma.proschi'],
      ['-20', 'constant.numeric.proschi'],
      ['# note', 'comment.line.number-sign.proschi'],
    ]);
  });

  it('scopes keywords, including `} alt` on one line', () => {
    const lines = tokenize('usecase "U" {\n  par {\n  }\n  alt "A" {\n  } alt "B" {\n  }\n}');
    expect(lines[0][0]).toEqual(['usecase', 'keyword.control.proschi']);
    expect(lines[1][0]).toEqual(['par', 'keyword.control.proschi']);
    expect(lines[4].slice(0, 2)).toEqual([
      ['}', 'punctuation.section.block.end.proschi'],
      ['alt', 'keyword.control.proschi'],
    ]);
  });

  it('scopes section as a keyword only before its name', () => {
    const lines = tokenize('usecase "U" {\n  section "Auth" {\n    section -> api : GET /x\n  }\n}');
    expect(lines[1][0]).toEqual(['section', 'keyword.control.proschi']);
    expect(lines[2][0][1]).not.toBe('keyword.control.proschi');
  });

  it('scopes imports and their path', () => {
    const [line] = tokenize('import "infra/shared.proschi" # the platform');
    expect(line).toEqual([
      ['import', 'keyword.control.import.proschi'],
      ['"', 'punctuation.definition.string.begin.proschi'],
      ['infra/shared.proschi', 'string.quoted.double.path.proschi'],
      ['"', 'punctuation.definition.string.end.proschi'],
      ['# the platform', 'comment.line.number-sign.proschi'],
    ]);
    expect(scopeOf(tokenize('importer -> db'), 'importer')).toBe('variable.other.node.proschi');
  });

  it('scopes when only between an alt name and its condition', () => {
    const [line] = tokenize('  } alt "Missing" when "no such order" {');
    expect(line).toEqual([
      ['}', 'punctuation.section.block.end.proschi'],
      ['alt', 'keyword.control.proschi'],
      ['"', 'punctuation.definition.string.begin.proschi'],
      ['Missing', 'string.quoted.double.proschi'],
      ['"', 'punctuation.definition.string.end.proschi'],
      ['when', 'keyword.control.proschi'],
      ['"', 'punctuation.definition.string.begin.proschi'],
      ['no such order', 'string.quoted.double.proschi'],
      ['"', 'punctuation.definition.string.end.proschi'],
      ['{', 'punctuation.section.block.proschi'],
    ]);
    expect(scopeOf(tokenize('alt Missing when "x" {'), 'when')).toBe('keyword.control.proschi');
    expect(scopeOf(tokenize('when -> api'), 'when')).toBe('variable.other.node.proschi');
    expect(scopeOf(tokenize('alt when {'), 'when')).toBe('variable.other.node.proschi');
  });

  it('scopes arrows, without reading -x out of an id', () => {
    for (const arrow of ['->', '->>', '-->', '-x']) {
      expect(scopeOf(tokenize(`a ${arrow} b`), arrow), arrow).toBe('keyword.operator.arrow.proschi');
    }
    expect(scopeOf(tokenize('a -> xray'), 'xray')).toBe('variable.other.node.proschi');
  });

  it('scopes step labels: method, endpoint, status, format', () => {
    const lines = tokenize('gw -> api : POST /orders json {"sku": "A1"}\napi --> gw : 201 {"id": 1}');
    expect(scopeOf(lines, 'POST')).toBe('keyword.other.http-method.proschi');
    expect(scopeOf(lines, '/orders')).toBe('string.unquoted.endpoint.proschi');
    expect(scopeOf(lines, 'json')).toBe('storage.type.format.proschi');
    expect(scopeOf(lines, '201')).toBe('constant.numeric.status.proschi');
    expect(scopeOf(lines, 'sku')).toBe('string.quoted.double.json.proschi');
    expect(scopeOf(lines, '1')).toBe('constant.numeric.json.proschi');
  });

  it('keeps a multi-line JSON payload inside the label', () => {
    const lines = tokenize('a -> b : POST /x json {\n  "items": [{ "id": 1 }],\n  "ok": true\n}\nc -> d');
    expect(scopeOf(lines, 'items')).toBe('string.quoted.double.json.proschi');
    expect(scopeOf(lines, 'true')).toBe('constant.language.json.proschi');
    // Back to statements once the brackets balance.
    expect(lines[4]).toEqual([
      ['c', 'variable.other.node.proschi'],
      ['->', 'keyword.operator.arrow.proschi'],
      ['d', 'variable.other.node.proschi'],
    ]);
  });

  it('keeps # in strings and payloads, and ends a label at a comment', () => {
    const lines = tokenize('a "#1" : x {"tag": "#2"} # done');
    expect(lines[0].filter(([, s]) => s.startsWith('comment'))).toEqual([['# done', 'comment.line.number-sign.proschi']]);
    expect(scopeOf(lines, '#1')).toBe('string.quoted.double.proschi');
    expect(scopeOf(lines, '#2')).toBe('string.quoted.double.json.proschi');
  });

  it('scopes section blocks: header keywords, section words, quantities and operators', () => {
    const lines = tokenize(
      [
        'traffic {',
        '  "Redirect" 100k rps mix "Cache hit" 90%, "Cache miss" 10%',
        '}',
        'requirements {',
        '  p99 "Redirect" < 50ms # tail',
        '  survive failure of any cache',
        '  cost <= 3000 usd/month',
        '}',
        'mix -> any',
      ].join('\n'),
    );
    expect(lines[0]).toEqual([
      ['traffic', 'keyword.control.proschi'],
      ['{', 'punctuation.section.block.begin.proschi'],
    ]);
    expect(lines[1].filter(([, s]) => !s.startsWith('punctuation.definition.string'))).toEqual([
      ['Redirect', 'string.quoted.double.proschi'],
      ['100k rps', 'constant.numeric.proschi'],
      ['mix', 'keyword.other.proschi'],
      ['Cache hit', 'string.quoted.double.proschi'],
      ['90%', 'constant.numeric.proschi'],
      [',', 'punctuation.separator.comma.proschi'],
      ['Cache miss', 'string.quoted.double.proschi'],
      ['10%', 'constant.numeric.proschi'],
    ]);
    expect(lines[2]).toEqual([['}', 'punctuation.section.block.end.proschi']]);
    expect(scopeOf([lines[4]], 'p99')).toBe('keyword.other.proschi');
    expect(scopeOf([lines[4]], '<')).toBe('keyword.operator.comparison.proschi');
    expect(scopeOf([lines[4]], '50ms')).toBe('constant.numeric.proschi');
    expect(scopeOf([lines[4]], '# tail')).toBe('comment.line.number-sign.proschi');
    expect(lines[5].map(([, s]) => s)).toEqual(['keyword.other.proschi', 'keyword.other.proschi', 'keyword.other.proschi', 'keyword.other.proschi', 'variable.other.node.proschi']);
    expect(scopeOf([lines[6]], '3000 usd/month')).toBe('constant.numeric.proschi');
    // After the block the words are ids again.
    expect(lines[8]).toEqual([
      ['mix', 'variable.other.node.proschi'],
      ['->', 'keyword.operator.arrow.proschi'],
      ['any', 'variable.other.node.proschi'],
    ]);
  });

  it('scopes entity, decision and test blocks and the one-line decision', () => {
    const lines = tokenize(
      'entity Url in db "Codes" {\n  code string key\n}\ndecision "Base62" because "short"\ntest "T" {\n  "Redirect" never calls any database\n  api has replicas >= 2\n}\nnext [Redis]',
    );
    expect(lines[0].slice(0, 4)).toEqual([
      ['entity', 'keyword.control.proschi'],
      ['Url', 'variable.other.node.proschi'],
      ['in', 'keyword.other.proschi'],
      ['db', 'variable.other.node.proschi'],
    ]);
    expect(scopeOf([lines[1]], 'key')).toBe('keyword.other.proschi');
    expect(lines[3].filter(([, s]) => s.startsWith('keyword'))).toEqual([
      ['decision', 'keyword.control.proschi'],
      ['because', 'keyword.other.proschi'],
    ]);
    expect(lines[5].filter(([, s]) => s.startsWith('keyword')).map(([t]) => t)).toEqual(['never', 'calls', 'any']);
    expect(scopeOf([lines[6]], '>=')).toBe('keyword.operator.comparison.proschi');
    expect(scopeOf([lines[6]], '2')).toBe('constant.numeric.proschi');
    expect(lines[8]).toEqual([
      ['next', 'variable.other.node.proschi'],
      ['[Redis]', 'entity.name.type.tech.proschi'],
    ]);
  });

  it('scopes color, critical, tags and the legend block', () => {
    const [node] = tokenize('api "API" [Go] color teal critical .owned');
    expect(node.slice(-4)).toEqual([
      ['color', 'keyword.other.color.proschi'],
      ['teal', 'constant.other.color.proschi'],
      ['critical', 'keyword.other.critical.proschi'],
      ['.owned', 'entity.other.attribute-name.tag.proschi'],
    ]);
    const [hex] = tokenize('db color #3b82f6 # note');
    expect(hex.slice(1)).toEqual([
      ['color', 'keyword.other.color.proschi'],
      ['#3b82f6', 'constant.other.color.proschi'],
      ['# note', 'comment.line.number-sign.proschi'],
    ]);
    expect(scopeOf(tokenize('a -> b .planned : x'), '.planned')).toBe('entity.other.attribute-name.tag.proschi');
    expect(scopeOf(tokenize('group g "G" .owned color blue {'), '.owned')).toBe('entity.other.attribute-name.tag.proschi');
    const lines = tokenize('legend {\n  planned "Planned" blue dashed\n  old "Old" color #fff\n}\ncritical [Go]');
    expect(lines[0][0]).toEqual(['legend', 'keyword.control.proschi']);
    expect(lines[1]).toEqual([
      ['planned', 'variable.other.node.proschi'],
      ['"', 'punctuation.definition.string.begin.proschi'],
      ['Planned', 'string.quoted.double.proschi'],
      ['"', 'punctuation.definition.string.end.proschi'],
      ['blue', 'constant.other.color.proschi'],
      ['dashed', 'keyword.other.proschi'],
    ]);
    expect(scopeOf(lines, '#fff')).toBe('constant.other.color.proschi');
    expect(lines[4][0]).toEqual(['critical', 'variable.other.node.proschi']);
  });

  it('scopes the layout hints, and keeps nodes named like them', () => {
    const lines = tokenize('direction right\nlayout ordered # tidy\ngroup g {\n  direction down\n}\napi [Go] rank 2\ndb rank first\ndirection [Go]\nlayout -> rank');
    expect(lines[0]).toEqual([
      ['direction', 'keyword.control.proschi'],
      ['right', 'constant.language.direction.proschi'],
    ]);
    expect(lines[1].slice(0, 2)).toEqual([
      ['layout', 'keyword.control.proschi'],
      ['ordered', 'constant.language.layout.proschi'],
    ]);
    expect(scopeOf([lines[3]], 'direction')).toBe('keyword.control.proschi');
    expect(lines[5].slice(-2)).toEqual([
      ['rank', 'keyword.other.rank.proschi'],
      ['2', 'constant.numeric.rank.proschi'],
    ]);
    expect(scopeOf([lines[6]], 'first')).toBe('constant.numeric.rank.proschi');
    expect(lines[7][0]).toEqual(['direction', 'variable.other.node.proschi']);
    expect(lines[8][0]).toEqual(['layout', 'variable.other.node.proschi']);
  });

  it('keeps nodes named like section keywords, and scopes replicas', () => {
    expect(tokenize('test "Runner" [REST API]')[0][0]).toEqual(['test', 'variable.other.node.proschi']);
    expect(scopeOf(tokenize('api "API" [REST API] @links x3'), 'x3')).toBe('constant.numeric.replicas.proschi');
    expect(tokenize('  x3 [Redis]')[0][0]).toEqual(['x3', 'variable.other.node.proschi']);
  });

  it('scopes the v2 words, units and label prefixes', () => {
    const lines = tokenize(
      [
        'test "T" {',
        '  "U" never waits for any queue or any eventual store',
        '  in "U" api calls db after cache',
        '  "U" starts at any strong store',
        '}',
        'capacity {',
        '  db reads 30k rps writes 8k rps shards 4 consistency strong bandwidth 500 MB/s egress 0.05 usd/GB',
        '}',
      ].join('\n'),
    );
    const keywords = (i: number) => lines[i].filter(([, s]) => s === 'keyword.other.proschi').map(([t]) => t);
    expect(keywords(1)).toEqual(['never', 'waits', 'for', 'any', 'or', 'any', 'eventual', 'store']);
    expect(keywords(2)).toEqual(['in', 'calls', 'after']);
    expect(keywords(3)).toEqual(['starts', 'at', 'any', 'strong', 'store']);
    expect(keywords(6)).toEqual(['reads', 'writes', 'shards', 'consistency', 'strong', 'bandwidth', 'egress']);
    expect(scopeOf([lines[6]], '500 MB/s')).toBe('constant.numeric.proschi');
    expect(scopeOf([lines[6]], '0.05 usd/GB')).toBe('constant.numeric.proschi');

    const [step] = tokenize('  worker -> feeds : x200 ~2MB LPUSH feed');
    expect(scopeOf([step], 'x200')).toBe('constant.numeric.label-prefix.proschi');
    expect(scopeOf([step], '~2MB')).toBe('constant.numeric.label-prefix.proschi');
    const [plain] = tokenize('  a -> b : xml x200 payload');
    expect(scopeOf([plain], 'x200')).not.toBe('constant.numeric.label-prefix.proschi');
  });

  it('scopes system blocks: from, expose and the capacity stub', () => {
    const lines = tokenize(
      [
        'system orders "Order Processing" @Orders {',
        '  from "teams/orders.proschi"',
        '  expose api "Orders API" -> "Place order"',
        '  capacity { 2k rps p99 150ms availability 99.95% }',
        '  capacity {',
        '    500 rps',
        '  }',
        '}',
        'web -> orders.api : place order',
        'from "x"',
      ].join('\n'),
    );
    expect(lines[0].slice(0, 2)).toEqual([
      ['system', 'keyword.control.proschi'],
      ['orders', 'variable.other.node.proschi'],
    ]);
    expect(scopeOf(lines, '@Orders')).toBe('entity.other.attribute-name.team.proschi');
    expect(lines[1].slice(0, 2)).toEqual([
      ['from', 'keyword.control.import.proschi'],
      ['"', 'punctuation.definition.string.begin.proschi'],
    ]);
    expect(scopeOf(lines, 'teams/orders.proschi')).toBe('string.quoted.double.path.proschi');
    expect(lines[2].slice(0, 2)).toEqual([
      ['expose', 'keyword.control.proschi'],
      ['api', 'variable.other.node.proschi'],
    ]);
    expect(scopeOf(lines, '->')).toBe('keyword.operator.arrow.proschi');
    expect(lines[3][0]).toEqual(['capacity', 'keyword.control.proschi']);
    expect(scopeOf([lines[3]], 'p99')).toBe('keyword.other.proschi');
    expect(scopeOf([lines[3]], '150ms')).toBe('constant.numeric.proschi');
    expect(lines[7]).toEqual([['}', 'punctuation.section.block.end.proschi']]);
    // Outside a system block, from is an ordinary node id.
    expect(lines[9][0]).toEqual(['from', 'variable.other.node.proschi']);
  });

  it.each(examples.map((e) => [e.id, e.source]))('tokenizes the %s example without leaving a block open', (_id, source) => {
    let state = vsctm.INITIAL;
    for (const line of source.split('\n')) state = grammar.tokenizeLine(line, state).ruleStack;
    // Depth 1 is the root rule: no string, label or payload left open.
    expect(state.depth).toBe(1);
  });
});
