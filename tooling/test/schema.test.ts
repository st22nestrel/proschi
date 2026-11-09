import { readFileSync } from 'node:fs';
import { Ajv2020 } from 'ajv/dist/2020';
import { describe, expect, it } from 'vitest';
import { diagramSchema } from '../src/schema';
import { examples, parse } from '../src/proschi';

const committed = JSON.parse(readFileSync(new URL('../schema/proschi-diagram.schema.json', import.meta.url), 'utf8'));
const validate = new Ajv2020({ allErrors: true, strict: true }).compile(committed);

// The document the landing page's live demo ends with: the static poster (frontend/index.html, #demo-source),
// which frontend/src/landing/landing.test.ts checks against src/components/Demo/demoScript.ts.
const landingHero = (() => {
  const html = readFileSync(new URL('../../frontend/index.html', import.meta.url), 'utf8');
  const code = html.match(/id="demo-source"[^>]*><code>([\s\S]*?)<\/code>/)![1];
  return code.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
})();

describe('JSON Schema', () => {
  it('is up to date (run npm run build after changing the parser or catalog)', () => {
    expect(committed).toEqual(diagramSchema());
  });

  it.each([...examples.map((e) => [e.id, e.source]), ['landing hero', landingHero]])('describes the parse result of %s', (_id, source) => {
    const result = parse(source);
    // Round-trip through JSON, as `proschi parse` prints it.
    expect(validate(JSON.parse(JSON.stringify(result))), JSON.stringify(validate.errors, null, 2)).toBe(true);
  });

  it('describes documents with problems, failed calls, conditions and positions too', () => {
    const source = 'g [Network Boundary]\ngroup vpc pos 10,20 {\n  a [Nope] pos -5,3\n}\nusecase "U" {\n  a -x b : GET /x/42\n  alt "A" when "b is down" {\n    b --> a : 200\n  }\n}\n%%%';
    const result = JSON.parse(JSON.stringify(parse(source)));
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.diagram.useCases[0]).toMatchObject({ endpointGroup: 'GET /x/{id}', scenarios: [{ condition: 'b is down' }] });
    expect(validate(result), JSON.stringify(validate.errors, null, 2)).toBe(true);
  });

  it('describes use case sections', () => {
    const source = 'usecase "U" {\n  section "Outer" {\n    section "Inner" {\n      a -> b : GET /x\n    }\n    b --> a : 200\n  }\n}';
    const result = JSON.parse(JSON.stringify(parse(source)));
    expect(result.diagram.useCases[0].steps[0]).toMatchObject({ sections: [{ name: 'Outer' }, { name: 'Inner' }], responseSections: [{ name: 'Outer' }] });
    expect(validate(result), JSON.stringify(validate.errors, null, 2)).toBe(true);
  });

  it('describes every requirement, assertion and selector', () => {
    const source = [
      'title "T" "Summary"',
      'api [REST API] x2',
      'db [PostgreSQL]',
      'usecase "U" {',
      '  api -> db : x',
      '  api -> db : x20 ~2MB INSERT row',
      '}',
      'traffic {',
      '  "U" 10 rps mix "U" 50%',
      '}',
      'requirements {',
      '  p999 "U" < 1s',
      '  p99 "U" scenario "U" < 100ms',
      '  availability >= 99%',
      '  durable "U"',
      '  survive any node failure',
      '  survive failure of [Redis]',
      '  cost <= 10 usd/month',
      '}',
      'capacity {',
      '  db 1k rps latency 2ms availability 99.9% cost 5 usd/month volatile',
      '  api reads 2k rps writes 1k rps shards 2 consistency strong bandwidth 1 GB/s egress 0.09 usd/GB',
      '}',
      'entity E in db "d" {',
      '  id uuid key unique',
      '}',
      'decision "D" {',
      '  because "b"',
      '  rejected "o" "r"',
      '}',
      'test "All" {',
      '  "U" calls any database',
      '  "U" scenario "U" every scenario calls db',
      '  "U" calls api before [PostgreSQL]',
      '  "U" writes db before responding',
      '  "U" responds 2xx',
      '  "U" has scenario "X"',
      '  "U" handles failure of db',
      '  no path from api to any cache',
      '  any service has replicas >= 2',
      '  "U" never waits for any queue or any cache',
      '  "U" scenario "U" calls db after api',
      '  in "U" api calls any strong store',
      '  api never calls any eventual store',
      '  "U" starts at api',
      '}',
    ].join('\n');
    const result = JSON.parse(JSON.stringify(parse(source)));
    expect(result.diagram.tests[0].assertions).toHaveLength(14);
    expect(validate(result), JSON.stringify(validate.errors, null, 2)).toBe(true);
  });

  it('rejects fields it does not know', () => {
    const result = JSON.parse(JSON.stringify(parse('a -> b')));
    result.diagram.nodes[0].colour = 'red';
    expect(validate(result)).toBe(false);
  });
});
