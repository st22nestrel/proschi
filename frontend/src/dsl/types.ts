import type { ComponentType, TechName } from '../types/canvas';

// Use case steps, as the parser produces them and the player animates them.
export type ExecutionType = 'SYNC_REQUEST_RESPONSE' | 'ASYNC_FIRE_AND_FORGET' | 'ASYNC_REQUEST_RESPONSE';
export type Protocol = 'REST' | 'GRPC' | 'SOAP' | 'GRAPHQL' | 'MESSAGING' | 'OTHER';

export interface FlowStep {
  id?: string;
  stepOrder: number;
  stepName: string;
  fromServiceId: string;
  toServiceId: string;
  protocol: Protocol;
  httpMethod: string;
  endpoint: string;
  requestFormat: 'JSON' | 'XML' | 'FREE_TEXT';
  requestBody?: string;
  responseFormat: 'JSON' | 'XML' | 'FREE_TEXT';
  responseBody?: string;
  statusCode?: number;
  description?: string;
  executionType: ExecutionType;
  parallelGroup?: number;
  isParallel: boolean;
  isConditional: boolean;
  conditionExpression?: string;
  /** The call never got an answer (connection refused, timeout); written `a -x b`. */
  failed?: boolean;
  /**
   * The `-->` that answers this step is written after other steps, so the player
   * plays it then (after `after` steps; in `par` group `group`), not with the request.
   */
  deferredResponse?: { after: number; group?: number };
  /**
   * The `section "…" { }` blocks the step is written in, outermost first. Only
   * labels for the reader: they never change what the step does or its number.
   */
  sections?: StepSection[];
  /** The sections of the `-->` that answered the step, when they differ from `sections`. */
  responseSections?: StepSection[];
}

/** 1-based source position of a construct, used for diagnostics and editor links. */
export interface SourceLoc {
  line: number;
  col: number;
  length: number;
  /** Path of the imported file the construct is in; left out for the root document. */
  file?: string;
}

export type Severity = 'error' | 'warning';

export interface Diagnostic extends SourceLoc {
  severity: Severity;
  message: string;
}

/** A use case step with where it is written: the request line, and the `-->` line that answered it. */
export type DiagramStep = FlowStep & {
  loc: SourceLoc;
  responseLoc?: SourceLoc;
  /** `x200 …` at the start of a label: the step happens this many times per request (fan-out). Absent means 1. */
  multiplier?: number;
  /** `~2MB …` at the start of a label: payload size in bytes, for transfer time and egress cost. */
  sizeBytes?: number;
  /** Read or write, from the HTTP method or the label's verb (docs/design/hld-and-practice.md §7.2). */
  access?: 'read' | 'write';
  /** `-> orders.api`: the entry point of the target system (`toServiceId` is the system). */
  toPort?: string;
  /** `orders.api -> …`: the entry point of the sending system. */
  fromPort?: string;
};

/** A `section "Name" { … }` block of a use case; `loc` (its name) tells two sections of the same name apart. */
export interface StepSection {
  name: string;
  loc: SourceLoc;
}

/**
 * `system` is a team's design as one box (docs/design/team-systems-and-imports.md);
 * an expanded system is drawn as a `group` with `system` set.
 */
export type DiagramNodeKind = 'component' | 'group' | 'text' | 'system';

/** Where edges flow in the auto layout: `direction down|right|up|left`. */
export type LayoutDirection = 'down' | 'right' | 'up' | 'left';

/** A layout layer: 0, 1, 2, … from the top (in the flow's direction), or the first or last one. */
export type Rank = number | 'first' | 'last';

/** Top-level layout hints; see docs/STYLING.md, "Steering the layout". */
export interface LayoutHints {
  /** `direction right`: the flow of the whole diagram (default down). */
  direction?: LayoutDirection;
  /** `layout ordered`: edges follow declaration order, so what is declared first sits higher. */
  ordered?: boolean;
}

export interface DiagramNode {
  id: string;
  kind: DiagramNodeKind;
  name: string;
  type: ComponentType;
  /** A catalog tech stack, or the text of an unknown one (then `inferredKind` is set). */
  techStack: TechName;
  /**
   * Set only when the tech is not in the catalog: the kind the simulation
   * gives the node, guessed from words in the tech's name (`service` when
   * nothing matches). The parser warns about such a node.
   */
  inferredKind?: Kind;
  ownerTeam?: string;
  description?: string;
  /** Id of the enclosing `group`, if any. */
  parent?: string;
  /** Explicit `pos x,y`; nodes without one are placed by auto-layout. */
  position?: { x: number; y: number };
  /** Created because an edge or step referenced an undeclared id. */
  implicit?: boolean;
  /** `x3`: number of replicas; absent means 1. See docs/design/hld-and-practice.md §1.3. */
  replicas?: number;
  /** `color teal` / `color #3b82f6`, as written. */
  color?: string;
  /** `.owned`: the legend entry the node or group is styled by. */
  tag?: string;
  /** `critical`: drawn with a warning badge. */
  critical?: boolean;
  /** `rank 2` / `rank first` / `rank last`: the layer the auto layout puts it in, among the nodes and groups that share its parent. */
  rank?: Rank;
  /** `direction right` inside a group: where edges flow among its members. Groups only. */
  direction?: LayoutDirection;
  /** Fill and border from `color` and `tag` (explicit color first); absent when neither is set. */
  style?: ElementStyle;
  /**
   * Set by `viewDiagram` (dsl/view.ts): on the frame of an expanded system,
   * the system's id; on a node inside one, the id of the system it belongs to.
   */
  system?: string;
  loc: SourceLoc;
}

/** How a line is drawn: a node's or group's border, an edge's stroke. */
export type Dash = 'dashed' | 'dotted';

/** A resolved style: the base color as a hex value (see dsl/palette.ts) and the dash. */
export interface ElementStyle {
  color?: string;
  dash?: Dash;
}

/** One line of `legend { … }`: a named style that `.id` applies. */
export interface LegendEntry {
  id: string;
  label: string;
  /** The color as written, a palette name or `#hex`. */
  colorName?: string;
  /** The resolved base color as a hex value. */
  color?: string;
  dash?: Dash;
  loc: SourceLoc;
}

export interface DiagramEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  /** `a -> b .planned`: the legend entry the edge is styled by. */
  tag?: string;
  /** Stroke color and dash from the tag. */
  style?: ElementStyle;
  /** `orders.api -> …`: the entry point of the source system (`source` is the system). */
  sourcePort?: string;
  /** `… -> orders.api`: the entry point of the target system (`target` is the system). */
  targetPort?: string;
  loc: SourceLoc;
}

/**
 * One path through a use case. A use case without `alt` blocks has a single
 * scenario; each combination of `alt` branches is a scenario of its own.
 */
export interface DiagramScenario {
  /** Slug of the branch names, or `main` when the use case has no branches. */
  id: string;
  /** Branch names joined with ' › ', or the use case name when there are none. */
  name: string;
  /** `error` when the entry request is answered with a 4xx/5xx or fails. */
  outcome: 'success' | 'error';
  /** `when "…"` conditions of the branches on the path, joined with ' · '; absent when none has one. */
  condition?: string;
  steps: DiagramStep[];
  /** The innermost `alt` name of the scenario, or the use case name when it has no branches. */
  loc: SourceLoc;
}

export interface DiagramUseCase {
  id: string;
  name: string;
  description?: string;
  entryServiceId?: string;
  /** `METHOD /path` of the first step, if it is an HTTP call; used to group use cases. */
  endpoint?: string;
  /**
   * Key for grouping use cases that hit the same endpoint: `endpoint` with
   * concrete ids folded into a `{param}` template (see paths.ts).
   */
  endpointGroup?: string;
  /** The steps of the first scenario. */
  steps: DiagramStep[];
  scenarios: DiagramScenario[];
  loc: SourceLoc;
}

export interface Diagram {
  title?: string;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  useCases: DiagramUseCase[];
  // HLD and practice additions (docs/design/hld-and-practice.md §1). Absent means none.
  /** Second string of `title`: the system summary. */
  summary?: string;
  traffic?: TrafficEntry[];
  requirements?: Requirement[];
  capacity?: CapacityOverride[];
  entities?: Entity[];
  decisions?: Decision[];
  tests?: FlowTest[];
  /** The `legend` block's entries, in order; absent when there is no legend. */
  legend?: LegendEntry[];
  /** `direction` and `layout ordered` at the top level; absent when neither is used. */
  layout?: LayoutHints;
  /** `system` blocks, each a node of kind `system` too; absent when there are none. */
  systems?: DiagramSystem[];
}

/** `expose api "Orders API" -> "Place order"`: an entry point of a system. */
export interface SystemEntry {
  id: string;
  name: string;
  /** The team use case it enters, as written; absent when the team file has a single use case or there is no team file. */
  useCase?: string;
  /** Id of that use case in the team design, once resolved. */
  useCaseId?: string;
  loc: SourceLoc;
}

/** `capacity { 2k rps p99 150ms availability 99.95% }` inside a system without `from`. */
export interface SystemStub {
  rps?: number;
  /** `p99 150ms`: the promised p99. */
  p99Ms?: number;
  /** `latency 40ms`: the mean latency. */
  latencyMs?: number;
  /** 0..100 */
  availability?: number;
  loc: SourceLoc;
}

/**
 * A `system` block: a team's design behind a contract
 * (docs/design/team-systems-and-imports.md). Its node is the `nodes` entry
 * with the same id and kind `system`.
 */
export interface DiagramSystem {
  id: string;
  /** `from "path"` as written. */
  from?: string;
  /** Path the resolver returned for `from`. */
  resolved?: string;
  /** The team design, parsed in its own scope (ids are not namespaced here). */
  diagram?: Diagram;
  entries: SystemEntry[];
  /** The stub contract; left out when a `from` design is loaded (the file wins). */
  stub?: SystemStub;
  loc: SourceLoc;
}

/** Simulation class of a node (docs/design/hld-and-practice.md §2.1). */
export type Kind =
  | 'client'
  | 'edge'
  | 'cdn'
  | 'loadbalancer'
  | 'gateway'
  | 'dns'
  | 'service'
  | 'function'
  | 'cache'
  | 'database'
  | 'search'
  | 'analytics'
  | 'queue'
  | 'broker'
  | 'storage'
  | 'external'
  | 'other';

/**
 * A quantity after unit normalisation: rates in requests per second, durations
 * in milliseconds, bandwidth in megabytes per second (§7.3), egress prices in
 * USD per gigabyte (§7.3).
 */
export interface Quantity {
  value: number;
  unit: 'rps' | 'ms' | '%' | 'usd/month' | 'MBps' | 'usd/GB';
}

/** A node id, an exact tech stack, or every node of a kind (`any cache`). */
export type Selector =
  | { node: string }
  | { tech: string }
  | { kind: Kind }
  /** `any strong store` / `any eventual store` (§7.4). */
  | { consistency: 'strong' | 'eventual' }
  /** `X or Y` (§7.1). */
  | { anyOf: Selector[] };

/** `"Redirect" 100k rps mix "Cache hit" 90%, "Cache miss" 10%`; shares are fractions 0..1. */
export interface TrafficEntry {
  useCase: string;
  rps: number;
  mix?: { scenario: string; share: number }[];
  loc: SourceLoc;
}

export type Percentile = 50 | 90 | 95 | 99 | 99.9;

/** One line of `requirements { … }`; percentages are 0..100. */
export type Requirement =
  | { kind: 'latency'; percentile: Percentile; useCase?: string; scenario?: string; maxMs: number; loc: SourceLoc }
  | { kind: 'availability'; useCase?: string; minPercent: number; loc: SourceLoc }
  | { kind: 'durable'; useCase: string; loc: SourceLoc }
  | { kind: 'survive'; target: Selector | 'any'; loc: SourceLoc }
  | { kind: 'cost'; maxUsdPerMonth: number; loc: SourceLoc };

/** One line of `capacity { … }`: per-replica overrides of the default profile. */
export interface CapacityOverride {
  node: string;
  rps?: number;
  latencyMs?: number;
  /** 0..100 */
  availability?: number;
  costUsd?: number;
  durable?: boolean;
  /** Separate read and write capacity per replica (§7.2); `rps` sets both. */
  readRps?: number;
  writeRps?: number;
  /** Write capacity scales with shards, not replicas, for single-primary stores (§7.2). */
  shards?: number;
  consistency?: 'strong' | 'eventual';
  /** Network bandwidth per replica in megabytes per second (§7.3). */
  bandwidthMBps?: number;
  /** Internet egress price in USD per GB (§7.3). */
  egressUsdPerGb?: number;
  /** `timeout <duration>`: what a failed call (`-x`) to this node costs; 1 000 ms by default. */
  timeoutMs?: number;
  /** `size S|M|L`: an instance size that scales the tech's default capacity and cost (sim/profiles.ts `SIZES`). */
  size?: InstanceSize;
  loc: SourceLoc;
}

export type InstanceSize = 'S' | 'M' | 'L';

export interface EntityField {
  name: string;
  type: string;
  /** key, index, unique, optional */
  flags: string[];
}

export interface Entity {
  name: string;
  /** Node id of the store it lives in. */
  store?: string;
  description?: string;
  fields: EntityField[];
  loc: SourceLoc;
}

export interface Decision {
  title: string;
  because?: string;
  rejected: { option: string; reason: string }[];
  loc: SourceLoc;
}

/** One assertion line inside `test "…" { … }` (docs/design/hld-and-practice.md §1.9). */
export type Assertion =
  | { kind: 'calls'; useCase: string; scenario?: string; target: Selector; quantifier: 'some' | 'every' | 'never'; loc: SourceLoc }
  | { kind: 'before'; useCase: string; scenario?: string; first: Selector; then: Selector; loc: SourceLoc }
  | { kind: 'writesBeforeResponding'; useCase: string; scenario?: string; target: Selector; loc: SourceLoc }
  | { kind: 'responds'; useCase: string; scenario?: string; status: string; loc: SourceLoc }
  | { kind: 'hasScenario'; useCase: string; scenario: string; loc: SourceLoc }
  | { kind: 'handlesFailure'; useCase: string; target: Selector; loc: SourceLoc }
  | { kind: 'noPath'; from: Selector; to: Selector; loc: SourceLoc }
  | { kind: 'replicas'; target: Selector; min: number; loc: SourceLoc }
  // §7.1 additions
  /** `U [scenario S] never waits for X`: no synchronous call to X before U's entry response. */
  | { kind: 'neverWaits'; useCase: string; scenario?: string; target: Selector; loc: SourceLoc }
  /** `U [scenario S] calls Y after X`: in every scenario calling both, the last call to Y follows the first call to X. */
  | { kind: 'after'; useCase: string; scenario?: string; target: Selector; after: Selector; loc: SourceLoc }
  /** `[in U] X calls Y` / `[in U] X never calls Y`: steps sent by X (not just reached). */
  | { kind: 'senderCalls'; useCase?: string; from: Selector; to: Selector; quantifier: 'some' | 'never'; loc: SourceLoc }
  /** `U starts at X`: U's entry request is sent by a node matching X. */
  | { kind: 'startsAt'; useCase: string; target: Selector; loc: SourceLoc };

export interface FlowTest {
  name: string;
  assertions: Assertion[];
  loc: SourceLoc;
}

/** One `import "path"` statement, in the root document or in an imported file. */
export interface DiagramImport {
  /** The path as written. */
  path: string;
  /** Path the resolver returned, or undefined when the file could not be loaded. */
  resolved?: string;
  loc: SourceLoc;
}

/** Where a top-level section block of the root document starts and ends (1-based lines, the `}` line included). */
export interface BlockSpan {
  kind: 'traffic' | 'requirements' | 'capacity' | 'entity' | 'decision' | 'test' | 'legend';
  start: number;
  end: number;
}

export interface ParseResult {
  diagram: Diagram;
  diagnostics: Diagnostic[];
  /** Section blocks of the root document, so edits can add lines to them; left out when there are none. */
  blocks?: BlockSpan[];
  /** Every import statement that was read; left out when the document has none. */
  imports?: DiagramImport[];
}

/** A file an import resolved to. */
export interface ResolvedImport {
  /** Identifies the file: shown in messages, used for `file` and to resolve its own imports. */
  path: string;
  source: string;
}

/** Finds the file `importPath` refers to, relative to the importing file (undefined for an unnamed root). */
export type ImportResolver = (importPath: string, fromPath: string | undefined) => ResolvedImport | undefined;

export interface ParseOptions {
  /** Path of the root document, so its imports resolve relative to it and import cycles back to it are found. */
  path?: string;
  /** Loads imported files and the team files of `system … { from "…" }`; without it, they only produce a warning. */
  resolve?: ImportResolver;
}
