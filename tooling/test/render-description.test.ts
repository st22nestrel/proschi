import { describe as suite, expect, it } from 'vitest';
import { parse } from '../src/proschi';
import { renderPreviewHtml, renderSvgs } from '../src/render';
import { describe, descriptionHtml, sentences } from '../src/render/description';

const AUTHZ =
  "Quarkus refuses before any SQL: a public caller in handleUserByBroker, or a role that may not change an owner id it sends (verifyBrokerage/Office/BrokerPermission, No permission (role)). Nothing is written. Requests: Own ids (control) (public); Other broker of own office (broker, public); Other franchise office (brokerage-*, franchise-admin; office). Known defects: the 'alone' cases should be refused, since nothing checks them (FINDINGS.md). Error labels show semantic status; transport returns HTTP 200.";

suite('use case descriptions', () => {
  it('splits sentences at full stops, not inside brackets or file names', () => {
    expect(sentences(AUTHZ)).toEqual([
      'Quarkus refuses before any SQL: a public caller in handleUserByBroker, or a role that may not change an owner id it sends (verifyBrokerage/Office/BrokerPermission, No permission (role)).',
      'Nothing is written.',
      'Requests: Own ids (control) (public); Other broker of own office (broker, public); Other franchise office (brokerage-*, franchise-admin; office).',
      "Known defects: the 'alone' cases should be refused, since nothing checks them (FINDINGS.md).",
      'Error labels show semantic status; transport returns HTTP 200.',
    ]);
  });

  it('turns `Label: name (detail); …` into a table and keeps the rest as prose', () => {
    const blocks = describe(AUTHZ);
    expect(blocks.map((b) => b.kind)).toEqual(['text', 'table', 'text']);
    expect(blocks[1]).toEqual({
      kind: 'table',
      label: 'Requests',
      rows: [
        { name: 'Own ids (control)', detail: 'public' },
        { name: 'Other broker of own office', detail: 'broker, public' },
        { name: 'Other franchise office', detail: 'brokerage-*, franchise-admin; office' },
      ],
    });
  });

  it('keeps a single-item list as a table', () => {
    expect(describe('Requests: No token (any testAccount).')).toEqual([{ kind: 'table', label: 'Requests', rows: [{ name: 'No token', detail: 'any testAccount' }] }]);
  });

  it('leaves plain prose alone', () => {
    expect(describe('Every field of the modal. Then it syncs.')).toEqual([{ kind: 'text', sentences: ['Every field of the modal.', 'Then it syncs.'] }]);
  });

  it('marks rows that name a scenario and escapes everything', () => {
    const html = descriptionHtml('Requests: <b>x</b> (<i>y</i>); Own ids (public).', new Map([['Own ids', 'uc--own-ids']]));
    expect(html).toContain('<tr data-slug="uc--own-ids"><td>Own ids</td><td>public</td></tr>');
    expect(html).toContain('<td>&lt;b&gt;x&lt;/b&gt;</td><td>&lt;i&gt;y&lt;/i&gt;</td>');
  });

  it('puts the description, folded, above its use case on the preview page', async () => {
    const { diagram } = parse(`a "A" [Actor]
b "B" [REST API]
usecase "Get" "Calls b. Requests: One (x); Two (y)." {
  alt "One" {
    a -> b : one
  }
  alt "Two" {
    a -> b : two
  }
}
usecase "Plain" {
  a -> b : plain
}
`);
    const html = renderPreviewHtml(diagram, await renderSvgs(diagram, true));
    expect(html).toContain('<div class="usecase"><details class="description"><summary>Description</summary><p>Calls b.</p><table>');
    expect(html).toContain('<tr data-slug="get--one"><td>One</td><td>x</td></tr>');
    // The second use case has no description and starts hidden.
    expect(html).toContain('<div class="usecase" hidden><figure class="scenario" data-slug="plain--');
  });
});
