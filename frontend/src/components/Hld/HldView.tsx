import { Fragment, useMemo, type ReactNode } from 'react';
import type { Edge, Node } from 'reactflow';
import { AlertTriangle, CheckCircle2, Download, MinusCircle, XCircle } from 'lucide-react';
import type { Diagram } from '../../dsl';
import { buildSequence, findScenario, sectionHeadings, sequenceMessages } from '../../dsl/sequence';
import {
  HOT_UTILIZATION,
  LOAD_HEADINGS,
  accessText,
  egressText,
  replicasText,
  totalCostText,
  buildHld,
  hld,
  defaultEngine,
  formatMs,
  formatPercent,
  formatRps,
  formatUsd,
  overviewFacts,
  responseText,
  toHtml,
  toMarkdown,
  type CheckStatus,
  type Analysis,
  type Engine,
  type HldDocument,
  type HldSection,
  type Risk,
  type TestResult,
} from '../../hld';
import { downloadText, fileNameFor } from '../Playground/exportDiagram';
import DiagramCanvas from '../Diagram/DiagramCanvas';

/**
 * The generated high-level design of the current document, as React
 * components (docs/design/hld-and-practice.md §4), with downloads as Markdown
 * (Mermaid diagrams) and as a self-contained HTML page.
 */

interface HldViewProps {
  diagram: Diagram;
  /** The laid-out canvas, shown in the overview. */
  nodes: Node[];
  edges: Edge[];
  /** Simulation results the host already has; without them the engine runs here. */
  analysis?: Analysis;
  results?: TestResult[];
  engine?: Engine;
  /** Opens the editor's Results tab, where every check has its detail; the document then only sums them up on top. */
  onOpenResults?: () => void;
}

export default function HldView({ diagram, nodes, edges, analysis, results, engine = defaultEngine, onOpenResults }: HldViewProps) {
  const doc = useMemo(() => (analysis ? hld(diagram, analysis, results) : buildHld(diagram, engine)), [diagram, analysis, results, engine]);
  const hasChecks = doc.sections.some((s) => s.kind === 'requirements' && (s.nonFunctional.length > 0 || s.flowTests.length > 0));

  return (
    <div className="h-full overflow-y-auto bg-paper">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 px-4 py-2 bg-surface/95 backdrop-blur-sm border-b border-ink/15">
        <nav aria-label="HLD sections" className="flex-1 min-w-0 flex gap-3 overflow-x-auto text-sm whitespace-nowrap">
          {doc.sections.map((s) => (
            <a key={s.kind} href={`#hld-${s.kind}`} className="text-ink/75 hover:text-pop-blue">
              {s.title}
            </a>
          ))}
        </nav>
        <button
          onClick={() => downloadText(toMarkdown(doc), fileNameFor(diagram.title, 'hld.md'))}
          className="inline-flex items-center gap-1.5 text-sm px-2.5 py-1.5 rounded-md border border-ink/30 text-ink/85 hover:bg-ink/5"
        >
          <Download size={14} />
          Markdown
        </button>
        <button
          onClick={() => downloadText(toHtml(doc), fileNameFor(diagram.title, 'hld.html'))}
          className="inline-flex items-center gap-1.5 text-sm px-2.5 py-1.5 rounded-md border border-ink/30 text-ink/85 hover:bg-ink/5"
        >
          <Download size={14} />
          HTML
        </button>
      </div>

      <article className="max-w-4xl mx-auto px-4 py-6 text-sm text-ink">
        <h1 className="text-2xl font-semibold text-ink">{doc.title}</h1>
        <p className="text-muted">High-level design</p>
        {hasChecks && !doc.checked && (
          <p className="mt-3 rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-amber-800 dark:text-amber-200">
            The simulation is not available yet, so requirements and tests are listed but not checked.
          </p>
        )}
        {onOpenResults && results && results.length > 0 && <ChecksSummary results={results} onOpen={onOpenResults} />}
        {doc.sections.length === 0 && <p className="mt-6 text-muted">Add components and use cases to generate a design document.</p>}
        {doc.sections.map((s) => (
          <section key={s.kind} id={`hld-${s.kind}`} className="mt-8 scroll-mt-14">
            <h2 className="mb-3 border-b border-ink/15 pb-1 text-lg font-semibold text-ink">{s.title}</h2>
            <SectionBody doc={doc} section={s} nodes={nodes} edges={edges} />
          </section>
        ))}
      </article>
    </div>
  );
}

/** One line on top: how many checks pass, and the way to their detail in Results. */
function ChecksSummary({ results, onOpen }: { results: TestResult[]; onOpen: () => void }) {
  const failed = results.filter((r) => !r.passed).length;
  return (
    <p data-testid="hld-checks" className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-ink/15 bg-surface px-3 py-2">
      {failed ? <XCircle size={16} className="text-red-600 dark:text-red-400" aria-hidden="true" /> : <CheckCircle2 size={16} className="text-green-600 dark:text-green-400" aria-hidden="true" />}
      <span className={failed ? 'text-red-700 dark:text-red-300' : 'text-green-700 dark:text-green-300'}>
        {failed ? `${failed} of ${results.length} checks failing` : `All ${results.length} checks passing`}
      </span>
      <button type="button" onClick={onOpen} className="text-pop-blue hover:underline">
        See Results
      </button>
    </p>
  );
}

function SectionBody({ doc, section: s, nodes, edges }: { doc: HldDocument; section: HldSection; nodes: Node[]; edges: Edge[] }) {
  switch (s.kind) {
    case 'overview':
      return (
        <>
          {s.summary && <p className="mb-2 text-base">{s.summary}</p>}
          <p className="text-muted">
            {overviewFacts(s)}
          </p>
          {nodes.length > 0 && (
            <div className="mt-3 h-72 rounded-lg border border-ink/15 bg-surface overflow-hidden">
              <DiagramCanvas nodes={nodes} edges={edges} compact />
            </div>
          )}
        </>
      );
    case 'requirements':
      return (
        <>
          {s.functional.length > 0 && (
            <>
              <H3>Functional</H3>
              <ul className="list-disc pl-5 space-y-1">
                {s.functional.map((f) => (
                  <li key={f.useCaseId}>
                    <strong>{f.name}</strong>
                    {f.description && <span className="text-ink/75"> — {f.description}</span>}
                    {(f.scenarios.length > 1 || f.scenarios[0]?.condition) && (
                      <ul className="list-[circle] pl-5 text-ink/75">
                        {f.scenarios.map((sc) => (
                          <li key={sc.id}>
                            {sc.name}
                            {sc.outcome === 'error' && <span className="text-red-600 dark:text-red-400"> (error)</span>}
                            {sc.condition && <span className="text-muted"> — when {sc.condition}</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
          {s.nonFunctional.length > 0 && (
            <>
              <H3>Non-functional</H3>
              <Table head={['Requirement', 'Status', 'Measured']} rows={s.nonFunctional.map((r) => [r.label, <Status key="s" status={r.status} />, <Measured key="m" text={r.measured} hint={r.hint} />])} />
            </>
          )}
          {s.flowTests.length > 0 && (
            <>
              <H3>Flow tests</H3>
              <Table
                head={['Test', 'Status', 'Asserts', 'Result']}
                rows={s.flowTests.map((t) => [
                  t.name,
                  <Status key="s" status={t.status} />,
                  <div key="a" className="space-y-0.5">
                    {t.assertions.map((a, i) => (
                      <code key={i} className="block text-xs">
                        {a}
                      </code>
                    ))}
                  </div>,
                  <Measured key="m" text={t.measured} hint={t.hint} />,
                ])}
              />
            </>
          )}
        </>
      );
    case 'capacity':
      return (
        <>
          {s.traffic.length > 0 && (
            <>
              <H3>Traffic</H3>
              <Table head={['Use case', 'Rate', 'Mix']} rows={s.traffic.map((t) => [t.useCase, formatRps(t.rps), t.mix.map((m) => `${m.scenario} ${formatPercent(m.share)}`).join(', ')])} />
            </>
          )}
          {s.load.length > 0 && (
            <>
              <H3>Load per component</H3>
              <Table
                head={LOAD_HEADINGS}
                rows={s.load.map((n) => [
                  n.name,
                  accessText(n, 'read'),
                  accessText(n, 'write'),
                  <Utilization key="u" value={n.utilization} saturated={n.saturated} />,
                  replicasText(n),
                  egressText(n),
                  formatUsd(n.costUsd),
                ])}
              />
            </>
          )}
          {s.totalCostUsd !== undefined && (
            <p className="mt-2">
              <strong>Total cost:</strong> {totalCostText(s.totalCostUsd, s.totalEgressUsd)}
            </p>
          )}
        </>
      );
    case 'components':
      return (
        <Table
          head={['Component', 'Tech', 'Kind', 'Team', 'Replicas', 'Responsibility', 'Stores']}
          rows={s.components.map((c) => [
            <span key="n">
              <strong>{c.name}</strong> <code className="text-xs text-muted">{c.id}</code>
              {c.group && <span className="block text-xs text-muted">in {c.group}</span>}
            </span>,
            c.tech,
            c.kind,
            c.team,
            c.replicas,
            c.responsibility,
            c.entities.join(', '),
          ])}
        />
      );
    case 'dataModel':
      return (
        <div className="space-y-4">
          {s.entities.map((e) => (
            <div key={e.name}>
              <H3>
                {e.name}
                {e.storeName && <span className="font-normal text-muted"> in {e.storeName}</span>}
              </H3>
              {e.description && <p className="mb-1 text-ink/75">{e.description}</p>}
              <Table head={['Field', 'Type', 'Flags']} rows={e.fields.map((f) => [<code key="f">{f.name}</code>, f.type, f.flags.join(', ')])} />
            </div>
          ))}
        </div>
      );
    case 'apis':
      return (
        <div className="space-y-5">
          {s.endpoints.map((ep) => (
            <div key={ep.endpoint}>
              <H3>
                <code>{ep.endpoint}</code>
                {ep.service && <span className="ml-2 text-xs font-normal text-muted">served by {ep.service}</span>}
              </H3>
              {ep.operations.map((op) => (
                <div key={op.useCaseId} className="mb-3">
                  <p className="font-medium">
                    {op.useCase}
                    {op.endpoint !== ep.endpoint && <code className="ml-2 text-xs font-normal text-muted">{op.endpoint}</code>}
                  </p>
                  {op.request && <pre className="my-1 overflow-x-auto rounded-md border border-ink/15 bg-surface p-2 text-xs">{op.request}</pre>}
                  <Table
                    head={['Scenario', 'Response']}
                    rows={op.responses.map((r) => [
                      <span key="s" className={r.outcome === 'error' ? 'text-red-700 dark:text-red-300' : undefined}>
                        {r.scenario}
                      </span>,
                      <code key="r" className="text-xs">
                        {responseText(r)}
                      </code>,
                    ])}
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      );
    case 'scenarios':
      return (
        <div className="space-y-5">
          {s.useCases.map((u) => (
            <div key={u.useCaseId}>
              <H3>{u.name}</H3>
              <p className="text-muted">{[u.endpoint, u.rps !== undefined ? formatRps(u.rps) : '', u.description].filter(Boolean).join(' · ')}</p>
              {u.scenarios.map((sc) => (
                <div key={sc.id} className="mt-2 rounded-lg border border-ink/15 bg-surface p-3">
                  <p className="font-medium">
                    <span aria-hidden="true" className={`mr-1.5 inline-block h-2 w-2 rounded-full ${sc.outcome === 'error' ? 'bg-red-500' : 'bg-green-500'}`} />
                    {sc.name}
                    {sc.outcome === 'error' && <span className="text-red-600 dark:text-red-400"> (error)</span>}
                  </p>
                  <p className="text-xs text-muted">
                    {[
                      sc.condition ? `When ${sc.condition}` : '',
                      sc.share !== undefined ? `${formatPercent(sc.share)} of traffic` : '',
                      sc.latency ? `p50 ${formatMs(sc.latency.p50)} · p99 ${formatMs(sc.latency.p99)}` : '',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  {sc.steps > 0 && <SequenceList doc={doc} useCaseId={u.useCaseId} scenarioId={sc.id} />}
                </div>
              ))}
            </div>
          ))}
        </div>
      );
    case 'decisions':
      return (
        <div className="space-y-4">
          {s.decisions.map((d) => (
            <div key={d.title} className="rounded-lg border border-ink/15 bg-surface p-3">
              <p className="font-semibold">{d.title}</p>
              {d.because && (
                <p className="mt-1">
                  <span className="font-medium">Because</span> {d.because}
                </p>
              )}
              {d.rejected.length > 0 && (
                <ul className="mt-1 list-disc pl-5 text-ink/75">
                  {d.rejected.map((r) => (
                    <li key={r.option}>
                      <span className="line-through decoration-gray-400">{r.option}</span> — {r.reason}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      );
    case 'risks':
      return (
        <ul className="space-y-2">
          {s.risks.map((r, i) => (
            <li key={i} className="flex gap-2">
              <RiskIcon severity={r.severity} />
              <span>
                <strong>{r.title}</strong>
                {r.detail && <span className="text-ink/75"> — {r.detail}</span>}
                {r.hint && <span className="block text-xs text-muted">Fix: {r.hint}</span>}
              </span>
            </li>
          ))}
        </ul>
      );
  }
}

function H3({ children }: { children: ReactNode }) {
  return <h3 className="mt-4 mb-1.5 font-semibold text-ink">{children}</h3>;
}

function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse bg-surface text-left text-[13px]">
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h} className="border border-ink/15 bg-paper px-2 py-1 font-medium text-ink/75">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((c, j) => (
                <td key={j} className="border border-ink/15 px-2 py-1 align-top">
                  {c === undefined || c === '' ? <span className="text-ink/30">—</span> : c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Status({ status }: { status: CheckStatus }) {
  if (status === 'pass')
    return (
      <span className="inline-flex items-center gap-1 text-green-700 dark:text-green-300">
        <CheckCircle2 size={14} /> pass
      </span>
    );
  if (status === 'fail')
    return (
      <span className="inline-flex items-center gap-1 text-red-700 dark:text-red-300">
        <XCircle size={14} /> fail
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-muted">
      <MinusCircle size={14} /> not checked
    </span>
  );
}

function Measured({ text, hint }: { text?: string; hint?: string }) {
  if (!text) return undefined;
  return (
    <span>
      {text}
      {hint && <span className="block text-xs text-muted">Fix: {hint}</span>}
    </span>
  );
}

function Utilization({ value, saturated }: { value: number; saturated: boolean }) {
  const color = saturated ? 'bg-red-500' : value > HOT_UTILIZATION ? 'bg-amber-500' : 'bg-green-500';
  return (
    <span className="inline-flex items-center gap-2">
      <span className="h-1.5 w-16 rounded-full bg-ink/5 overflow-hidden">
        <span className={`block h-full ${color}`} style={{ width: `${Math.min(value, 1) * 100}%` }} />
      </span>
      <span className={saturated ? 'text-red-700 dark:text-red-300' : undefined}>{formatPercent(value)}</span>
    </span>
  );
}

function RiskIcon({ severity }: { severity: Risk['severity'] }) {
  const color = severity === 'high' ? 'text-red-600 dark:text-red-400' : severity === 'medium' ? 'text-amber-600 dark:text-amber-400' : 'text-muted';
  return <AlertTriangle size={16} className={`mt-0.5 shrink-0 ${color}`} aria-label={`${severity} risk`} />;
}

/** The scenario's messages in order, like the sequence diagram reads. */
function SequenceList({ doc, useCaseId, scenarioId }: { doc: HldDocument; useCaseId: string; scenarioId: string }) {
  const found = findScenario(doc.diagram, useCaseId, scenarioId);
  if (!found) return null;
  const sequence = buildSequence(found.useCase, found.scenario, doc.diagram.nodes);
  const name = (id: string) => sequence.participants.find((p) => p.id === id)?.name ?? id;
  const messages = sequenceMessages(sequence.items);
  const headings = sectionHeadings(messages);
  return (
    <ol className="mt-2 space-y-0.5 text-xs">
      {messages.map((m, i) => (
        <Fragment key={i}>
          {headings[i] && <li className="pt-1 pl-6 font-semibold text-muted">{headings[i]}</li>}
          <li className={`flex gap-2 ${m.error ? 'text-red-700 dark:text-red-300' : 'text-ink/85'} ${m.kind === 'response' ? 'pl-4 text-muted' : ''}`}>
            <span className="w-4 shrink-0 text-right tabular-nums text-muted">{m.kind === 'request' ? m.number : ''}</span>
            <span>
              {name(m.from)} {m.kind === 'response' ? '⇠' : m.failed ? '✗→' : m.async ? '⇢' : '→'} {name(m.to)}
              {m.label && <code className="ml-1.5 text-muted">{m.label}</code>}
            </span>
          </li>
        </Fragment>
      ))}
    </ol>
  );
}
