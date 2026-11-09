import { describe, expect, it } from 'vitest';
import { EXPORT_CSP, parse } from '../src/proschi';
import { createHash } from 'node:crypto';
import { renderHtml, renderPreviewHtml, renderSvgs } from '../src/render';
import { renderHldHtml } from '../src/render/hld';
import { renderPreviewContent } from '../src/render/preview';

/** Names, labels and payloads come from the document; none of them may become markup. */
const HOSTILE = `title "<script>alert(1)</script>"
evil "<tspan onload=alert(1)>x</tspan>" [REST API] @t "<img src=x onerror=alert(2)>"
<tspan "x" [REST API]
db "<tspan>DB" [PostgreSQL]
evil -> db : <svg onload=alert(3)>
usecase "<b>Use</b>" {
  evil -> db : GET /x?<script>
  db --> evil : 200 <tspan font-weight="700">injected</tspan>
}
`;

describe('rendering hostile documents', () => {
  it('escapes every name and label in the SVGs, including ones starting with <tspan', async () => {
    const { diagram } = parse(HOSTILE);
    const { architecture, scenarios } = await renderSvgs(diagram);
    for (const svg of [architecture, ...scenarios.map((s) => s.svg)]) {
      expect(svg).not.toMatch(/<(script|img|b)\b/i);
      expect(svg).not.toMatch(/<svg onload/i);
      expect(svg).not.toMatch(/<tspan (onload|font-weight="700">injected)/);
      expect(svg).not.toContain('<tspan>DB');
    }
    expect(architecture).toContain('&lt;tspan');
  });

  it('gives the HTML pages a CSP that blocks scripts', async () => {
    const { diagram } = parse(HOSTILE);
    const rendered = await renderSvgs(diagram, true);
    for (const html of [renderHtml(diagram, rendered), renderHldHtml(diagram, rendered)]) {
      expect(html).toContain(`<meta http-equiv="Content-Security-Policy" content="${EXPORT_CSP}">`);
      expect(html).not.toMatch(/<script/i);
      expect(html).not.toMatch(/<img/i);
    }
    expect(EXPORT_CSP).toContain("default-src 'none'");
    expect(EXPORT_CSP).not.toContain('script-src');
  });

  it('allows only the preview page\'s own script and style, by hash', async () => {
    const { diagram } = parse(HOSTILE);
    const html = renderPreviewHtml(diagram, await renderSvgs(diagram, true));
    const csp = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/)?.[1] ?? '';
    expect(csp).toContain("default-src 'none'");
    expect(csp).not.toMatch(/unsafe-inline|unsafe-eval|nonce-/);
    const hash = (code: string) => `'sha256-${createHash('sha256').update(code).digest('base64')}'`;
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    expect(scripts).toHaveLength(1);
    expect(csp).toContain(`script-src ${hash(scripts[0])}`);
    const style = html.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '';
    expect(csp).toContain(`style-src ${hash(style)}`);
    // The document's names never become markup, scripts or images.
    const outside = html.replace(/<script>[\s\S]*?<\/script>/, '');
    expect(outside).not.toMatch(/<(script|img|b)\b/i);
    expect(outside).toContain('&lt;b&gt;Use&lt;/b&gt;');
  });

  it('escapes the preview panel, including error messages', async () => {
    const ok = await renderPreviewContent(HOSTILE);
    expect(ok.html).not.toMatch(/<(script|img|b)\b/i);
    const broken = await renderPreviewContent('a "<img src=x onerror=alert(1)>\n');
    expect(broken.html).not.toMatch(/<img/i);
  });
});
