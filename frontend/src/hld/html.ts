import { buildSequence, findScenario, sectionHeadings, sequenceMessages } from '../dsl/sequence';
import {
  LOAD_HEADINGS,
  accessText,
  egressText,
  replicasText,
  totalCostText,
  formatMs,
  formatPercent,
  formatRps,
  formatUsd,
  overviewFacts,
  responseText,
  type CheckStatus,
  type HldDocument,
  type HldSection,
} from './hld';

/**
 * The HLD as one self-contained HTML page: no scripts, no external files.
 * `proschi render --format hld-html` passes the architecture and sequence
 * SVGs as `figures`; the browser download has none and lists each scenario's
 * messages instead.
 */

export interface HldFigures {
  architecture?: string;
  /** Sequence SVG per `<usecase id>--<scenario id>`. */
  scenarios?: Record<string, string>;
}

export function escapeHtml(text: string | number): string {
  return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** Content-Security-Policy of exported HTML pages: inline styles and data: images only. */
export const EXPORT_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'";

const e = escapeHtml;
const STATUS: Record<CheckStatus, string> = { pass: '<span class="pass">✓ pass</span>', fail: '<span class="fail">✗ fail</span>', unchecked: '<span class="muted">not checked</span>' };

const PAGE_STYLE = `
:root { color-scheme: light dark; --bg: #f8fafc; --fg: #1f2937; --muted: #6b7280; --card: #ffffff; --border: #e5e7eb; --link: #2563eb; --pass: #15803d; --fail: #dc2626; --warn: #b45309; }
@media (prefers-color-scheme: dark) { :root { --bg: #0f172a; --fg: #e5e7eb; --muted: #94a3b8; --card: #1e293b; --border: #334155; --link: #93c5fd; --pass: #4ade80; --fail: #f87171; --warn: #fbbf24; } }
* { box-sizing: border-box; }
body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: var(--bg); color: var(--fg); line-height: 1.5; }
main { max-width: 1040px; margin: 0 auto; padding: 24px 16px 48px; }
h1 { margin: 0 0 4px; font-size: 26px; }
h2 { font-size: 19px; margin: 32px 0 8px; padding-bottom: 4px; border-bottom: 1px solid var(--border); }
h3 { font-size: 15px; margin: 20px 0 6px; }
h4 { font-size: 14px; margin: 14px 0 4px; }
p { margin: 6px 0; }
nav { font-size: 14px; margin: 12px 0 0; }
nav a { color: var(--link); text-decoration: none; margin-right: 12px; }
.muted, .about { color: var(--muted); }
.pass { color: var(--pass); } .fail { color: var(--fail); } .warn { color: var(--warn); }
.table { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; font-size: 13px; background: var(--card); }
th, td { border: 1px solid var(--border); padding: 4px 8px; text-align: left; vertical-align: top; }
th { font-weight: 600; }
code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; }
pre { background: var(--card); border: 1px solid var(--border); border-radius: 6px; padding: 8px; overflow-x: auto; }
figure { margin: 8px 0; overflow-x: auto; background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 8px; }
figure svg { display: block; max-width: none; }
ol.messages { font-size: 13px; padding-left: 24px; }
ol.messages .error { color: var(--fail); }
ol.messages .section { font-weight: 600; color: var(--muted); margin-top: 4px; }
ul.risks { padding-left: 20px; }
`;

function table(head: string[], rows: string[][]): string {
  return `<div class="table"><table><thead><tr>${head.map((h) => `<th>${e(h)}</th>`).join('')}</tr></thead><tbody>${rows
    .map((r) => `<tr>${r.map((c) => `<td>${c || '—'}</td>`).join('')}</tr>`)
    .join('')}</tbody></table></div>`;
}

/** A scenario's messages as an ordered list, for when there is no sequence SVG. */
function messageList(doc: HldDocument, useCaseId: string, scenarioId: string): string {
  const found = findScenario(doc.diagram, useCaseId, scenarioId);
  if (!found) return '';
  const sequence = buildSequence(found.useCase, found.scenario, doc.diagram.nodes);
  const name = (id: string) => sequence.participants.find((p) => p.id === id)?.name ?? id;
  const messages = sequenceMessages(sequence.items);
  const headings = sectionHeadings(messages);
  return `<ol class="messages">${messages
    .map((m, i) => {
      const arrow = m.kind === 'response' ? '⇠' : m.failed ? '✗→' : m.async ? '⇢' : '→';
      const heading = headings[i] ? `<div class="section">${e(headings[i])}</div>` : '';
      return `<li${m.error ? ' class="error"' : ''}>${heading}${e(name(m.from))} ${arrow} ${e(name(m.to))}${m.label ? `: <code>${e(m.label)}</code>` : ''}</li>`;
    })
    .join('')}</ol>`;
}

function renderSection(doc: HldDocument, s: HldSection, figures: HldFigures): string {
  const out: string[] = [`<section id="${s.kind}"><h2>${e(s.title)}</h2>`];
  switch (s.kind) {
    case 'overview': {
      if (s.summary) out.push(`<p>${e(s.summary)}</p>`);
      out.push(`<p class="about">${e(overviewFacts(s))}</p>`);
      if (figures.architecture) out.push(`<figure>${figures.architecture}</figure>`);
      break;
    }
    case 'requirements':
      if (s.functional.length) {
        out.push('<h3>Functional</h3><ul>');
        for (const f of s.functional) {
          const scenarios =
            f.scenarios.length > 1 || f.scenarios[0]?.condition
              ? `<ul>${f.scenarios.map((sc) => `<li>${e(sc.name)}${sc.outcome === 'error' ? ' <span class="fail">(error)</span>' : ''}${sc.condition ? ` <span class="muted">— when ${e(sc.condition)}</span>` : ''}</li>`).join('')}</ul>`
              : '';
          out.push(`<li><strong>${e(f.name)}</strong>${f.description ? ` — ${e(f.description)}` : ''}${scenarios}</li>`);
        }
        out.push('</ul>');
      }
      if (s.nonFunctional.length) {
        out.push('<h3>Non-functional</h3>', table(['Requirement', 'Status', 'Measured'], s.nonFunctional.map((r) => [e(r.label), STATUS[r.status], e(r.measured ?? '')])));
      }
      if (s.flowTests.length) {
        out.push(
          '<h3>Flow tests</h3>',
          table(['Test', 'Status', 'Asserts', 'Result'], s.flowTests.map((t) => [e(t.name), STATUS[t.status], t.assertions.map((a) => `<code>${e(a)}</code>`).join('<br>'), e(t.measured ?? '')])),
        );
      }
      break;
    case 'capacity':
      if (s.traffic.length) {
        out.push('<h3>Traffic</h3>', table(['Use case', 'Rate', 'Mix'], s.traffic.map((t) => [e(t.useCase), e(formatRps(t.rps)), e(t.mix.map((m) => `${m.scenario} ${formatPercent(m.share)}`).join(', '))])));
      }
      if (s.load.length) {
        out.push(
          '<h3>Load per component</h3>',
          table(
            LOAD_HEADINGS,
            s.load.map((n) => [
              e(n.name),
              e(accessText(n, 'read')),
              e(accessText(n, 'write')),
              `<span class="${n.saturated ? 'fail' : n.utilization > 0.7 ? 'warn' : ''}">${e(formatPercent(n.utilization))}${n.saturated ? ' saturated' : ''}</span>`,
              e(replicasText(n)),
              e(egressText(n)),
              e(formatUsd(n.costUsd)),
            ]),
          ),
        );
      }
      if (s.totalCostUsd !== undefined) out.push(`<p><strong>Total cost:</strong> ${e(totalCostText(s.totalCostUsd, s.totalEgressUsd))}</p>`);
      break;
    case 'components':
      out.push(
        table(
          ['Component', 'Tech', 'Kind', 'Team', 'Replicas', 'Responsibility', 'Stores'],
          s.components.map((c) => [`<strong>${e(c.name)}</strong> <code>${e(c.id)}</code>`, e(c.tech ?? ''), e(c.kind), e(c.team ?? ''), e(c.replicas), e(c.responsibility ?? ''), e(c.entities.join(', '))]),
        ),
      );
      break;
    case 'dataModel':
      for (const en of s.entities) {
        out.push(`<h3>${e(en.name)}${en.storeName ? ` <span class="muted">in ${e(en.storeName)}</span>` : ''}</h3>`);
        if (en.description) out.push(`<p>${e(en.description)}</p>`);
        out.push(table(['Field', 'Type', 'Flags'], en.fields.map((f) => [`<code>${e(f.name)}</code>`, e(f.type), e(f.flags.join(', '))])));
      }
      break;
    case 'apis':
      for (const ep of s.endpoints) {
        out.push(`<h3><code>${e(ep.endpoint)}</code></h3>`);
        if (ep.service) out.push(`<p class="about">Served by ${e(ep.service)}</p>`);
        for (const op of ep.operations) {
          out.push(`<h4>${e(op.useCase)}${op.endpoint !== ep.endpoint ? ` <code>${e(op.endpoint)}</code>` : ''}</h4>`);
          if (op.request) out.push(`<pre>${e(op.request)}</pre>`);
          out.push(table(['Scenario', 'Response'], op.responses.map((r) => [`${e(r.scenario)}${r.outcome === 'error' ? ' <span class="fail">(error)</span>' : ''}`, `<code>${e(responseText(r))}</code>`])));
        }
      }
      break;
    case 'scenarios':
      for (const u of s.useCases) {
        out.push(`<h3>${e(u.name)}</h3>`);
        const about = [u.endpoint, u.rps !== undefined ? formatRps(u.rps) : '', u.description].filter(Boolean).join(' · ');
        if (about) out.push(`<p class="about">${e(about)}</p>`);
        for (const sc of u.scenarios) {
          const slug = `${u.useCaseId}--${sc.id}`;
          if (u.scenarios.length > 1) out.push(`<h4 id="${e(slug)}">${e(sc.name)}${sc.outcome === 'error' ? ' <span class="fail">(error)</span>' : ''}</h4>`);
          const facts = [
            sc.condition ? `When ${sc.condition}` : '',
            sc.share !== undefined ? `${formatPercent(sc.share)} of traffic` : '',
            sc.latency ? `p50 ${formatMs(sc.latency.p50)}, p99 ${formatMs(sc.latency.p99)}` : '',
          ].filter(Boolean);
          if (facts.length) out.push(`<p class="about">${e(facts.join(' · '))}</p>`);
          const svg = figures.scenarios?.[slug];
          if (svg) out.push(`<figure>${svg}</figure>`);
          else if (sc.steps) out.push(messageList(doc, u.useCaseId, sc.id));
        }
      }
      break;
    case 'decisions':
      for (const d of s.decisions) {
        out.push(`<h3>${e(d.title)}</h3>`);
        if (d.because) out.push(`<p><strong>Because</strong> ${e(d.because)}</p>`);
        if (d.rejected.length) out.push(`<p>Rejected:</p><ul>${d.rejected.map((r) => `<li><strong>${e(r.option)}</strong> — ${e(r.reason)}</li>`).join('')}</ul>`);
      }
      break;
    case 'risks':
      out.push(
        `<ul class="risks">${s.risks
          .map((r) => {
            const cls = r.severity === 'high' ? 'fail' : r.severity === 'medium' ? 'warn' : 'muted';
            return `<li><strong class="${cls}">${e(r.title)}</strong>${r.detail ? ` — ${e(r.detail)}` : ''}${r.hint ? ` <em>Fix: ${e(r.hint)}</em>` : ''}</li>`;
          })
          .join('')}</ul>`,
      );
      break;
  }
  out.push('</section>');
  return out.join('\n');
}

export function toHtml(doc: HldDocument, figures: HldFigures = {}): string {
  const nav = doc.sections.map((s) => `<a href="#${s.kind}">${e(s.title)}</a>`).join('');
  const unchecked =
    !doc.checked && doc.sections.some((s) => s.kind === 'requirements' && (s.nonFunctional.length || s.flowTests.length))
      ? '<p class="muted">Requirements and tests were not checked: the simulation did not run.</p>'
      : '';
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    // No scripts and nothing remote: content from the document can never run, even if escaping missed something.
    `<meta http-equiv="Content-Security-Policy" content="${EXPORT_CSP}">`,
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${e(doc.title)} — High-level design</title>`,
    `<style>${PAGE_STYLE}</style>`,
    '</head>',
    '<body>',
    '<main>',
    `<header><h1>${e(doc.title)}</h1><p class="about">High-level design</p>${unchecked}<nav>${nav}</nav></header>`,
    ...doc.sections.map((s) => renderSection(doc, s, figures)),
    '</main>',
    '</body>',
    '</html>',
    '',
  ].join('\n');
}
