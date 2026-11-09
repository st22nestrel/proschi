import type { Diagram, DiagramNode, DiagramScenario, DiagramStep, DiagramUseCase, StepSection } from './types';

/**
 * A scenario as a sequence diagram: the parser folds each `-->` into its
 * request (status code and response body), so this puts the responses back
 * where they happened. Shared by the Mermaid export and the SVG renderer.
 */

export interface SequenceMessage {
  kind: 'request' | 'response';
  from: string;
  to: string;
  /** 1-based number of the request (a response carries its request's number). */
  number: number;
  label: string;
  /** `->>` (fire and forget or async request/response). */
  async: boolean;
  /** `-x`: the call never got an answer. */
  failed: boolean;
  /** A failed call, or a response with a 4xx/5xx status. */
  error: boolean;
  status?: number;
  /** The `section` blocks the request (or the `-->` of a response) is written in, outermost first. */
  sections: StepSection[];
  step: DiagramStep;
}

export type SequenceItem = { kind: 'message'; message: SequenceMessage } | { kind: 'par'; branches: SequenceMessage[][] };

export interface Participant {
  id: string;
  name: string;
  tech?: string;
}

export interface Sequence {
  useCase: DiagramUseCase;
  scenario: DiagramScenario;
  participants: Participant[];
  items: SequenceItem[];
  /** The `when` conditions of the scenario's branches, if any. */
  condition?: string;
}

const PAYLOAD_LIMIT = 40;

/** Collapses whitespace and cuts `text` to `max` characters, ending with an ellipsis. */
export function shorten(text: string, max = PAYLOAD_LIMIT): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

/** `POST /orders {"sku": …}`, `INSERT order`; the parser's `a → b` placeholder becomes empty. */
export function requestLabel(step: DiagramStep): string {
  const name = !step.httpMethod && step.stepName === `${step.fromServiceId} → ${step.toServiceId}` ? '' : step.stepName;
  return [name, step.description, step.requestBody && shorten(step.requestBody)].filter(Boolean).join(' ');
}

/** `201 {"id": 1}`, or empty when the response has neither a status nor a body. */
export function responseLabel(step: DiagramStep): string {
  return [step.statusCode, step.responseBody && shorten(step.responseBody)].filter((p) => p !== undefined && p !== '').join(' ');
}

/** Answered with `-->`, even one without a status or body. */
function hasResponse(step: DiagramStep): boolean {
  return !step.failed && (!!step.responseLoc || step.statusCode !== undefined || !!step.responseBody);
}

function request(step: DiagramStep): SequenceMessage {
  return {
    kind: 'request',
    from: step.fromServiceId,
    to: step.toServiceId,
    number: step.stepOrder + 1,
    label: requestLabel(step),
    async: step.executionType !== 'SYNC_REQUEST_RESPONSE',
    failed: !!step.failed,
    error: !!step.failed,
    sections: step.sections ?? [],
    step,
  };
}

function response(step: DiagramStep): SequenceMessage {
  return {
    kind: 'response',
    from: step.toServiceId,
    to: step.fromServiceId,
    number: step.stepOrder + 1,
    label: responseLabel(step),
    async: false,
    failed: false,
    error: (step.statusCode ?? 0) >= 400,
    status: step.statusCode,
    sections: step.responseSections ?? step.sections ?? [],
    step,
  };
}

/**
 * Orders the messages of one scenario. Answered requests are kept on a call
 * stack; a step sent by someone other than the innermost callee answers the
 * calls above it first, and whatever is still open is answered at the end.
 * Inside `par`, each branch's response follows its request directly.
 */
export function buildSequence(useCase: DiagramUseCase, scenario: DiagramScenario, nodes: DiagramNode[] = []): Sequence {
  const items: SequenceItem[] = [];
  const stack: DiagramStep[] = [];
  const emit = (message: SequenceMessage) => items.push({ kind: 'message', message });
  const unwindFor = (from: string) => {
    const depth = stack.map((s) => s.toServiceId).lastIndexOf(from);
    while (stack.length > depth + 1) emit(response(stack.pop()!));
  };

  const steps = scenario.steps;
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (step.parallelGroup === undefined) {
      unwindFor(step.fromServiceId);
      emit(request(step));
      if (hasResponse(step)) stack.push(step);
      continue;
    }
    const group: DiagramStep[] = [];
    while (i < steps.length && steps[i].parallelGroup === step.parallelGroup) group.push(steps[i++]);
    i--;
    unwindFor(step.fromServiceId);
    items.push({ kind: 'par', branches: group.map((s) => (hasResponse(s) ? [request(s), response(s)] : [request(s)])) });
  }
  while (stack.length) emit(response(stack.pop()!));

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const participants: Participant[] = [];
  const seen = new Set<string>();
  const add = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    const node = byId.get(id);
    participants.push({ id, name: node?.name ?? id, tech: node && !node.implicit ? node.techStack : undefined });
  };
  for (const step of steps) {
    add(step.fromServiceId);
    add(step.toServiceId);
  }

  return { useCase, scenario, participants, items, condition: scenario.condition || undefined };
}

/** Finds a use case and scenario (the first one by default), or undefined. */
export function findScenario(diagram: Diagram, useCaseId: string, scenarioId?: string): { useCase: DiagramUseCase; scenario: DiagramScenario } | undefined {
  const useCase = diagram.useCases.find((u) => u.id === useCaseId);
  const scenario = scenarioId ? useCase?.scenarios.find((s) => s.id === scenarioId) : useCase?.scenarios[0];
  return useCase && scenario ? { useCase, scenario } : undefined;
}

/** Every message in display order, flattening `par` branches. */
export function sequenceMessages(items: SequenceItem[]): SequenceMessage[] {
  return items.flatMap((item) => (item.kind === 'message' ? [item.message] : item.branches.flat()));
}

/** A sequence item, or where a `section` frame opens or closes around items; `depth` counts the frames around it (0 outside any). */
export type SectionedItem =
  | { kind: 'item'; item: SequenceItem; depth: number }
  | { kind: 'open'; section: StepSection; depth: number }
  | { kind: 'close'; section: StepSection; depth: number };

/** The same `section` block: compared by where its name is written, so copies of a parsed diagram compare equal. */
export function sameSection(a: StepSection, b: StepSection): boolean {
  return a.name === b.name && a.loc.line === b.loc.line && a.loc.col === b.loc.col && a.loc.file === b.loc.file;
}

function itemSections(item: SequenceItem): StepSection[] {
  return item.kind === 'message' ? item.message.sections : (item.branches[0]?.[0]?.sections ?? []);
}

/**
 * The items with the `section` frames around them: a frame opens before the
 * first item of a run of items in the section and closes after the last.
 * Frames nest like the blocks in the source. When an item from outside a
 * section falls between items of it (a response answered later), the frame
 * closes and opens again after it.
 */
export function sectionedItems(items: SequenceItem[]): SectionedItem[] {
  const out: SectionedItem[] = [];
  const open: StepSection[] = [];
  for (const item of items) {
    const path = itemSections(item);
    let common = 0;
    while (common < open.length && common < path.length && sameSection(open[common], path[common])) common++;
    while (open.length > common) out.push({ kind: 'close', section: open.pop()!, depth: open.length });
    for (const section of path.slice(common)) {
      out.push({ kind: 'open', section, depth: open.length });
      open.push(section);
    }
    out.push({ kind: 'item', item, depth: open.length });
  }
  while (open.length) out.push({ kind: 'close', section: open.pop()!, depth: open.length });
  return out;
}

/**
 * For lists of messages: the section path (`PRE-REQUEST › root.yml`) to show
 * above each message that starts a new run of sections, else undefined.
 */
export function sectionHeadings(messages: SequenceMessage[]): (string | undefined)[] {
  let previous: StepSection[] = [];
  return messages.map((m) => {
    const same = m.sections.length === previous.length && m.sections.every((s, i) => sameSection(s, previous[i]));
    previous = m.sections;
    return same || m.sections.length === 0 ? undefined : m.sections.map((s) => s.name).join(' › ');
  });
}
