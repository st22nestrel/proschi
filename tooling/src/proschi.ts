/**
 * The one place the tooling reaches into the editor's source. The parser in
 * frontend/src/dsl is the definition of the language; everything here is a
 * thin adapter around it, so the CLI, the language server and the web editor
 * can never disagree about what is valid.
 */
export { DID_YOU_MEAN, parse } from '../../frontend/src/dsl/parser';
export { addConnection } from '../../frontend/src/dsl/edit';
export { format } from '../../frontend/src/dsl/format';
export { examples } from '../../frontend/src/dsl/examples';
export { componentCatalog } from '../../frontend/src/catalog/componentCatalog';
export type {
  Diagnostic,
  Diagram,
  DiagramImport,
  DiagramNode,
  DiagramStep,
  DiagramUseCase,
  ImportResolver,
  ParseOptions,
  ParseResult,
  SourceLoc,
} from '../../frontend/src/dsl/types';
export type { DiagramScenario } from '../../frontend/src/dsl/types';
export { DIFF_SECTIONS, diffDiagrams, requirementKey, summarizeDiff, type DiagramDiff, type DiffSection, type FieldChange } from '../../frontend/src/dsl/diff';
export { toMermaidArchitecture, toMermaidSequence } from '../../frontend/src/dsl/mermaid';
export { buildSequence, sectionedItems, type SequenceMessage } from '../../frontend/src/dsl/sequence';
export { EXPORT_CSP, buildHld, toHtml as hldToHtml, toMarkdown as hldToMarkdown, type HldDocument, type HldFigures } from '../../frontend/src/hld';
// `analyze` is the editor's simulation; tooling's own analysis.ts has an `analyze` for documents.
export {
  analyze as simulate,
  runTests,
  formatAvailability,
  formatMs,
  formatPercent,
  formatRps,
  formatUsd,
  HOT,
  type Analysis as SimAnalysis,
  type NodeAnalysis,
  type TestResult,
} from '../../frontend/src/sim';

/** Keywords that start a statement, with a one-line hint for completion lists. */
export const KEYWORDS: { label: string; detail: string; snippet: string }[] = [
  { label: 'title', detail: 'Document title', snippet: 'title "$1"' },
  { label: 'import', detail: 'import "file.proschi" (top level)', snippet: 'import "${1:file.proschi}"' },
  { label: 'group', detail: 'group id "Name" [Style] { … }', snippet: 'group ${1:id} "${2:Name}" {\n\t$0\n}' },
  { label: 'usecase', detail: 'usecase "Name" { steps }', snippet: 'usecase "${1:Name}" {\n\t$0\n}' },
  { label: 'par', detail: 'Steps that run in parallel', snippet: 'par {\n\t$0\n}' },
  { label: 'alt', detail: 'One scenario of a use case', snippet: 'alt "${1:Scenario}" {\n\t$0\n}' },
  { label: 'section', detail: 'Names a run of steps in a use case, drawn as a frame', snippet: 'section "${1:Name}" {\n\t$0\n}' },
  { label: 'legend', detail: 'Styles that .tag applies: owned "Owned by us" green', snippet: 'legend {\n\t${1:tag} "${2:What it means}" ${3:blue}$0\n}' },
  // Layout hints (docs/STYLING.md, "Steering the layout").
  { label: 'direction', detail: 'Where edges flow: down, right, up or left (top level or in a group)', snippet: 'direction ${1|down,right,up,left|}' },
  { label: 'layout ordered', detail: 'Lay edges out by declaration order (top level)', snippet: 'layout ordered' },
  // High-level design sections (top level).
  { label: 'traffic', detail: 'Requests per use case: "Use case" 100 rps', snippet: 'traffic {\n\t"${1:Use case}" ${2:100 rps}$0\n}' },
  { label: 'requirements', detail: 'Latency, availability, durability, resilience, cost', snippet: 'requirements {\n\tp99 < ${1:200ms}$0\n}' },
  { label: 'capacity', detail: 'Per-replica overrides: node 1k rps latency 5ms', snippet: 'capacity {\n\t${1:node} ${2:1k rps}$0\n}' },
  { label: 'entity', detail: 'entity Name in store { fields }', snippet: 'entity ${1:Name} in ${2:store} {\n\t${3:id} ${4:uuid} key$0\n}' },
  { label: 'decision', detail: 'A design decision with its reasons', snippet: 'decision "${1:Title}" {\n\tbecause "${2:reason}"$0\n}' },
  { label: 'test', detail: 'Flow assertions: "Use case" calls any cache', snippet: 'test "${1:Name}" {\n\t$0\n}' },
];

/** Assertion forms offered at the start of a line inside a `test` block (docs/TESTS.md, "Tests"). */
export const ASSERTIONS: { label: string; detail: string; snippet: string }[] = [
  { label: '"Use case" calls', detail: 'Some scenario calls the node', snippet: '"${1:Use case}" calls ${2:node}' },
  { label: '"Use case" never calls', detail: 'No scenario calls the node', snippet: '"${1:Use case}" never calls ${2:node}' },
  { label: '"Use case" every scenario calls', detail: 'Every scenario calls the node', snippet: '"${1:Use case}" every scenario calls ${2:node}' },
  { label: '"Use case" calls … before …', detail: 'The first call to one node comes before the first call to another', snippet: '"${1:Use case}" calls ${2:node} before ${3:node}' },
  { label: '"Use case" calls … after …', detail: 'The last call to one node comes after the first call to another', snippet: '"${1:Use case}" calls ${2:node} after ${3:node}' },
  { label: '"Use case" never waits for', detail: 'No synchronous call to the node before the response', snippet: '"${1:Use case}" never waits for ${2:node}' },
  { label: '"Use case" writes … before responding', detail: 'A write to the node happens before the response', snippet: '"${1:Use case}" writes ${2:node} before responding' },
  { label: '"Use case" responds', detail: 'Status code or class of the entry response', snippet: '"${1:Use case}" responds ${2:2xx}' },
  { label: '"Use case" starts at', detail: 'The entry request is sent by the node', snippet: '"${1:Use case}" starts at ${2:node}' },
  { label: '"Use case" has scenario', detail: 'The use case has a scenario of this name', snippet: '"${1:Use case}" has scenario "${2:Scenario}"' },
  { label: '"Use case" handles failure of', detail: 'A scenario fails the node and still answers', snippet: '"${1:Use case}" handles failure of ${2:node}' },
  { label: 'node calls node', detail: 'Some step is sent by one node to the other', snippet: '${1:node} calls ${2:node}' },
  { label: 'node never calls node', detail: 'No step is sent by one node to the other', snippet: '${1:node} never calls ${2:node}' },
  { label: 'in "Use case" node calls node', detail: 'A step of the use case is sent by one node to the other', snippet: 'in "${1:Use case}" ${2:node} calls ${3:node}' },
  { label: 'no path from … to …', detail: 'No chain of connections links the nodes', snippet: 'no path from ${1:node} to ${2:node}' },
  { label: 'node has replicas >=', detail: 'Minimum replica count', snippet: '${1:node} has replicas >= ${2:2}' },
];
