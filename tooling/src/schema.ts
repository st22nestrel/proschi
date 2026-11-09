import type { ComponentType } from '../../frontend/src/types/canvas';
import type { Assertion, ExecutionType, FlowStep, Percentile, Protocol, Requirement } from '../../frontend/src/dsl/types';
import { KINDS } from '../../frontend/src/dsl/kinds';
import { componentCatalog } from './proschi';

/**
 * JSON Schema for the output of `proschi parse`. It is generated (npm run
 * build writes schema/proschi-diagram.schema.json) so the tech stack list
 * comes straight from the catalog; schema.test.ts fails if the committed file
 * is stale or if the parser emits a field the schema does not describe.
 */

// Exhaustive records: adding a value to one of these unions without listing it here is a type error.
const PROTOCOLS: Record<Protocol, true> = { REST: true, GRPC: true, SOAP: true, GRAPHQL: true, MESSAGING: true, OTHER: true };
const EXECUTION: Record<ExecutionType, true> = { SYNC_REQUEST_RESPONSE: true, ASYNC_FIRE_AND_FORGET: true, ASYNC_REQUEST_RESPONSE: true };
const FORMATS: Record<FlowStep['requestFormat'], true> = { JSON: true, XML: true, FREE_TEXT: true };
const PERCENTILES: Record<Percentile, true> = { 50: true, 90: true, 95: true, 99: true, 99.9: true };

const loc = { $ref: '#/$defs/loc' };
const str = { type: 'string' };
const int = { type: 'integer' };
const bool = { type: 'boolean' };
const num = { type: 'number' };
const percent = { type: 'number', minimum: 0, maximum: 100 };
const selector = { $ref: '#/$defs/selector' };
const array = (ref: string, description?: string) => ({ type: 'array', items: { $ref: `#/$defs/${ref}` }, ...(description ? { description } : {}) });
const file = { type: 'string', description: 'The imported file this is in; left out for the parsed file itself.' };
const object = (properties: Record<string, unknown>, required: string[], description?: string) => ({
  type: 'object',
  ...(description ? { description } : {}),
  properties,
  required,
  additionalProperties: false,
});

export function diagramSchema() {
  const componentTypes = [...new Set(componentCatalog.map((c) => c.type))] as ComponentType[];
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://gvart.github.io/proschi/schema/proschi-diagram.schema.json',
    title: 'Proschi parse result',
    description: 'Output of `proschi parse <file>`: the diagram a Proschi document describes, plus parser diagnostics.',
    ...object(
      {
        diagram: { $ref: '#/$defs/diagram' },
        diagnostics: { type: 'array', items: { $ref: '#/$defs/diagnostic' } },
        imports: { type: 'array', items: { $ref: '#/$defs/import' }, description: 'Every `import` statement read, in any file; left out when there are none.' },
        blocks: array('block', 'Where each top-level section block of the root document starts and ends, so tools can add lines to it; left out when there are none.'),
      },
      ['diagram', 'diagnostics'],
    ),
    $defs: {
      block: object(
        {
          kind: { enum: ['traffic', 'requirements', 'capacity', 'entity', 'decision', 'test', 'legend'] },
          start: { type: 'integer', minimum: 1, description: "1-based line of the block's opening line." },
          end: { type: 'integer', minimum: 1, description: "1-based line of its closing `}`." },
        },
        ['kind', 'start', 'end'],
      ),
      loc: object(
        { line: { type: 'integer', minimum: 1 }, col: { type: 'integer', minimum: 1 }, length: { type: 'integer', minimum: 0 }, file },
        ['line', 'col', 'length'],
        '1-based source position.',
      ),
      diagnostic: object(
        {
          severity: { enum: ['error', 'warning'] },
          message: str,
          line: { type: 'integer', minimum: 1 },
          col: { type: 'integer', minimum: 1 },
          length: { type: 'integer', minimum: 0 },
          file,
        },
        ['severity', 'message', 'line', 'col', 'length'],
      ),
      import: object(
        { path: { ...str, description: 'The path as written.' }, resolved: { ...str, description: 'The file it resolved to; left out when it could not be found.' }, loc },
        ['path', 'loc'],
      ),
      diagram: object(
        {
          title: str,
          nodes: { type: 'array', items: { $ref: '#/$defs/node' } },
          edges: { type: 'array', items: { $ref: '#/$defs/edge' } },
          useCases: { type: 'array', items: { $ref: '#/$defs/useCase' } },
          // High-level design sections; each is left out when the document has none.
          summary: { ...str, description: 'Second string of `title`: the system summary.' },
          traffic: array('traffic', '`traffic { … }` lines, one per use case.'),
          requirements: array('requirement', '`requirements { … }` lines.'),
          capacity: array('capacity', '`capacity { … }` lines: per-replica overrides of the default profiles.'),
          entities: array('entity', '`entity` blocks: the data model.'),
          decisions: array('decision', '`decision` statements.'),
          tests: array('test', '`test` blocks of flow assertions.'),
          legend: array('legendEntry', 'Entries of the `legend` block, in order.'),
          layout: object(
            {
              direction: { enum: ['down', 'right', 'up', 'left'], description: '`direction right`: where edges flow in the whole diagram.' },
              ordered: { ...bool, description: '`layout ordered`: edges follow declaration order.' },
            },
            [],
            'Top-level layout hints; left out when the document uses none.',
          ),
        },
        ['nodes', 'edges', 'useCases'],
      ),
      node: object(
        {
          id: str,
          kind: { enum: ['component', 'group', 'text'] },
          name: str,
          type: { enum: componentTypes },
          techStack: {
            type: 'string',
            description: 'A tech stack from the component catalog (see `examples`), or the text of an unknown one, in which case `inferredKind` is set.',
            examples: componentCatalog.map((c) => c.techStack),
          },
          inferredKind: { enum: [...KINDS], description: 'Only for a tech the catalog does not know: the kind the simulation gives the node, from the words in its name.' },
          ownerTeam: str,
          description: str,
          parent: { ...str, description: 'Id of the enclosing group.' },
          position: object({ x: { type: 'number' }, y: { type: 'number' } }, ['x', 'y'], 'Explicit `pos x,y`.'),
          implicit: { ...bool, description: 'Created because a connection or step referenced an undeclared id.' },
          replicas: { type: 'integer', minimum: 1, description: '`x3`: number of replicas; absent means 1.' },
          color: { ...str, description: '`color teal` or `color #3b82f6`, as written.' },
          tag: { ...str, description: '`.owned`: the legend entry the node or group is styled by.' },
          critical: { ...bool, description: '`critical`: drawn with a warning badge.' },
          rank: {
            oneOf: [{ type: 'integer', minimum: 0 }, { enum: ['first', 'last'] }],
            description: '`rank 2`, `rank first`, `rank last`: the layout layer among the nodes and groups that share its parent.',
          },
          direction: { enum: ['down', 'right', 'up', 'left'], description: '`direction right` inside a group: where edges flow among its members.' },
          style: { $ref: '#/$defs/style' },
          loc,
        },
        ['id', 'kind', 'name', 'type', 'techStack', 'loc'],
      ),
      style: object(
        { color: { ...str, description: 'Base color as #rrggbb.' }, dash: { enum: ['dashed', 'dotted'] } },
        [],
        'Resolved fill and border (or stroke) from `color` and the tag; an explicit color wins.',
      ),
      legendEntry: object(
        {
          id: str,
          label: str,
          colorName: { ...str, description: 'The color as written: a palette name or #hex.' },
          color: { ...str, description: 'Base color as #rrggbb.' },
          dash: { enum: ['dashed', 'dotted'] },
          loc,
        },
        ['id', 'label', 'loc'],
      ),
      edge: object(
        { id: str, source: str, target: str, label: str, tag: { ...str, description: '`a -> b .planned`: the legend entry the edge is styled by.' }, style: { $ref: '#/$defs/style' }, loc },
        ['id', 'source', 'target', 'loc'],
      ),
      useCase: object(
        {
          id: str,
          name: str,
          description: str,
          entryServiceId: str,
          endpoint: { ...str, description: '`METHOD /path` of the first step, if it is an HTTP call.' },
          endpointGroup: { ...str, description: 'The endpoint with concrete ids folded into a `{param}` path template; use cases that share it hit the same endpoint.' },
          steps: { type: 'array', items: { $ref: '#/$defs/step' }, description: 'Steps of the first scenario.' },
          scenarios: { type: 'array', items: { $ref: '#/$defs/scenario' }, minItems: 1 },
          loc,
        },
        ['id', 'name', 'steps', 'scenarios', 'loc'],
      ),
      scenario: object(
        {
          id: str,
          name: str,
          outcome: { enum: ['success', 'error'] },
          condition: { ...str, description: "`when \"…\"` conditions of the branches on the scenario's path, joined with ' · '." },
          steps: { type: 'array', items: { $ref: '#/$defs/step' } },
          loc,
        },
        ['id', 'name', 'outcome', 'steps', 'loc'],
      ),
      step: object(
        {
          id: str,
          stepOrder: int,
          stepName: str,
          fromServiceId: str,
          toServiceId: str,
          protocol: { enum: Object.keys(PROTOCOLS) },
          httpMethod: str,
          endpoint: str,
          requestFormat: { enum: Object.keys(FORMATS) },
          requestBody: str,
          responseFormat: { enum: Object.keys(FORMATS) },
          responseBody: str,
          statusCode: int,
          description: str,
          executionType: { enum: Object.keys(EXECUTION) },
          parallelGroup: int,
          isParallel: bool,
          isConditional: bool,
          conditionExpression: str,
          failed: { ...bool, description: 'Written `a -x b`: the call never got an answer.' },
          loc: { ...loc, description: 'The request line.' },
          responseLoc: { ...loc, description: 'The `-->` line that answered the request.' },
          deferredResponse: object(
            { after: { type: 'integer', minimum: 1, description: 'The `-->` is written after this many steps of the scenario.' }, group: { ...int, description: 'The `par` group the `-->` is written in.' } },
            ['after'],
            'Set when the `-->` that answers the request is written after other steps: the player plays the answer there, not with the request.',
          ),
          multiplier: { type: 'integer', minimum: 1, description: '`x200` at the start of the label: the step happens this many times per request (fan-out). Absent means 1.' },
          sizeBytes: { type: 'integer', minimum: 1, description: '`~2MB` at the start of the label: payload size in bytes (decimal units).' },
          access: { enum: ['read', 'write'], description: 'From the HTTP method, or the first word of the label (INSERT, SET, PUBLISH, … write); every request step has one.' },
          sections: {
            type: 'array',
            items: { $ref: '#/$defs/stepSection' },
            description: 'The `section "…" { }` blocks the step is written in, outermost first. Labels only: they never change the step or its number.',
          },
          responseSections: {
            type: 'array',
            items: { $ref: '#/$defs/stepSection' },
            description: 'The sections of the `-->` that answered the step, when they differ from `sections` (empty: written outside any section).',
          },
        },
        ['stepOrder', 'stepName', 'fromServiceId', 'toServiceId', 'protocol', 'httpMethod', 'endpoint', 'requestFormat', 'responseFormat', 'executionType', 'isParallel', 'isConditional', 'access', 'loc'],
      ),
      stepSection: object(
        { name: str, loc: { ...loc, description: 'The section name; tells two sections of the same name apart.' } },
        ['name', 'loc'],
        'A `section "Name" { … }` block of a use case.',
      ),
      selector: {
        description: 'A node id, an exact tech stack, every node of a kind (`any cache`), every data store of a consistency (`any strong store`), or a union (`X or Y`).',
        oneOf: [
          object({ node: str }, ['node']),
          object({ tech: str }, ['tech']),
          object({ kind: { enum: [...KINDS] } }, ['kind']),
          object({ consistency: { enum: ['strong', 'eventual'] } }, ['consistency']),
          object({ anyOf: { type: 'array', items: selector, minItems: 2 } }, ['anyOf']),
        ],
      },
      traffic: object(
        {
          useCase: str,
          rps: { ...num, minimum: 0, description: 'Requests per second.' },
          mix: {
            type: 'array',
            description: 'Shares of the use case traffic per scenario, as fractions that add up to 1. Without a mix, all traffic goes to the first scenario.',
            items: object({ scenario: { ...str, description: 'Full scenario name, e.g. `A › B`.' }, share: { ...num, minimum: 0, maximum: 1 } }, ['scenario', 'share']),
          },
          loc,
        },
        ['useCase', 'rps', 'loc'],
      ),
      requirement: {
        // Keyed by kind, so a new kind of requirement without a schema is a type error.
        oneOf: Object.values({
          latency: object(
            {
              kind: { const: 'latency' },
              percentile: { enum: Object.keys(PERCENTILES).map(Number) },
              useCase: { ...str, description: 'Left out: every use case with traffic.' },
              scenario: { ...str, description: '`scenario "S"`: the latency of one scenario of the use case.' },
              maxMs: num,
              loc,
            },
            ['kind', 'percentile', 'maxMs', 'loc'],
          ),
          availability: object({ kind: { const: 'availability' }, useCase: str, minPercent: percent, loc }, ['kind', 'minPercent', 'loc']),
          durable: object({ kind: { const: 'durable' }, useCase: str, loc }, ['kind', 'useCase', 'loc']),
          survive: object({ kind: { const: 'survive' }, target: { oneOf: [{ const: 'any' }, selector] }, loc }, ['kind', 'target', 'loc']),
          cost: object({ kind: { const: 'cost' }, maxUsdPerMonth: num, loc }, ['kind', 'maxUsdPerMonth', 'loc']),
        } satisfies Record<Requirement['kind'], unknown>),
      },
      capacity: object(
        {
          node: str,
          rps: { ...num, description: 'Requests per second per replica.' },
          latencyMs: num,
          availability: percent,
          costUsd: { ...num, description: 'Monthly cost per replica in USD.' },
          durable: { ...bool, description: '`durable` (true) or `volatile` (false).' },
          readRps: { ...num, description: '`reads`: read requests per second per replica.' },
          writeRps: { ...num, description: '`writes`: write requests per second per replica.' },
          shards: { type: 'integer', minimum: 1, description: 'Write capacity of single-primary stores scales with shards.' },
          size: { enum: ['S', 'M', 'L'], description: "Instance size: scales the tech's default capacity (×1, ×2, ×4) and cost (×1, ×1.8, ×3.5)." },
          consistency: { enum: ['strong', 'eventual'] },
          bandwidthMBps: { ...num, exclusiveMinimum: 0, description: '`bandwidth`: megabytes per second per replica.' },
          egressUsdPerGb: { ...num, minimum: 0, description: '`egress`: price of data the node sends to clients and third parties (internet egress), in USD per GB.' },
          timeoutMs: { ...num, minimum: 0, description: '`timeout`: what a failed call (`-x`) to the node costs, in milliseconds.' },
          loc,
        },
        ['node', 'loc'],
      ),
      entity: object(
        {
          name: str,
          store: { ...str, description: 'Id of the node the entity lives in.' },
          description: str,
          fields: { type: 'array', items: object({ name: str, type: str, flags: { type: 'array', items: { enum: ['key', 'index', 'unique', 'optional'] } } }, ['name', 'type', 'flags']) },
          loc,
        },
        ['name', 'fields', 'loc'],
      ),
      decision: object(
        { title: str, because: str, rejected: { type: 'array', items: object({ option: str, reason: str }, ['option', 'reason']) }, loc },
        ['title', 'rejected', 'loc'],
      ),
      test: object({ name: str, assertions: array('assertion'), loc }, ['name', 'assertions', 'loc']),
      assertion: {
        description: 'One assertion line of a test.',
        oneOf: Object.values({
          calls: object({ kind: { const: 'calls' }, useCase: str, scenario: str, target: selector, quantifier: { enum: ['some', 'every', 'never'] }, loc }, ['kind', 'useCase', 'target', 'quantifier', 'loc']),
          before: object({ kind: { const: 'before' }, useCase: str, scenario: str, first: selector, then: selector, loc }, ['kind', 'useCase', 'first', 'then', 'loc']),
          writesBeforeResponding: object({ kind: { const: 'writesBeforeResponding' }, useCase: str, scenario: str, target: selector, loc }, ['kind', 'useCase', 'target', 'loc']),
          responds: object({ kind: { const: 'responds' }, useCase: str, scenario: str, status: { type: 'string', pattern: '^[1-5](\\d\\d|xx)$' }, loc }, ['kind', 'useCase', 'status', 'loc']),
          hasScenario: object({ kind: { const: 'hasScenario' }, useCase: str, scenario: str, loc }, ['kind', 'useCase', 'scenario', 'loc']),
          handlesFailure: object({ kind: { const: 'handlesFailure' }, useCase: str, target: selector, loc }, ['kind', 'useCase', 'target', 'loc']),
          noPath: object({ kind: { const: 'noPath' }, from: selector, to: selector, loc }, ['kind', 'from', 'to', 'loc']),
          replicas: object({ kind: { const: 'replicas' }, target: selector, min: { type: 'integer', minimum: 1 }, loc }, ['kind', 'target', 'min', 'loc']),
          neverWaits: object({ kind: { const: 'neverWaits' }, useCase: str, scenario: str, target: selector, loc }, ['kind', 'useCase', 'target', 'loc']),
          after: object({ kind: { const: 'after' }, useCase: str, scenario: str, target: selector, after: selector, loc }, ['kind', 'useCase', 'target', 'after', 'loc']),
          senderCalls: object({ kind: { const: 'senderCalls' }, useCase: str, from: selector, to: selector, quantifier: { enum: ['some', 'never'] }, loc }, ['kind', 'from', 'to', 'quantifier', 'loc']),
          startsAt: object({ kind: { const: 'startsAt' }, useCase: str, target: selector, loc }, ['kind', 'useCase', 'target', 'loc']),
        } satisfies Record<Assertion['kind'], unknown>),
      },
    },
  };
}
