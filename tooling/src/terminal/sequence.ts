import { nodeBaseColor } from '../../../frontend/src/dsl/palette';
import { buildSequence, sectionedItems, type SequenceMessage } from '../../../frontend/src/dsl/sequence';
import type { Diagram, DiagramNode, DiagramScenario, DiagramUseCase, FlowStep } from '../../../frontend/src/dsl/types';
import { DEFAULT, Grid, hex } from './grid';
import { iconOf, type IconStyle } from './icons';
import { COLOR } from './paint';
import { currentStepsOf, isErrorStep } from './playback';

/**
 * One scenario of a use case drawn as a sequence diagram in character cells,
 * the way the SVG renderer draws it (tooling/src/render/sequence.ts): a box
 * per participant with its lifeline, a numbered arrow per request, a dashed
 * one per response, and a titled frame around each `section` and `par`.
 * Playing it lights the current step's arrows and sends a packet along them;
 * nothing else moves.
 */

/** A participant: its box across the top and its lifeline, by the column its lifeline is in. */
export interface Lifeline {
  id: string;
  name: string;
  tech?: string;
  node?: DiagramNode;
  x: number;
  w: number;
}

/** A frame around a run of rows: a `section` (titled with its name) or a `par` (its branches split by dividers). */
interface Frame {
  title: string;
  par: boolean;
  depth: number;
  top: number;
  bottom: number;
  dividers: number[];
}

/** A message: its label on row `y`, its arrow on the row under it (and, sent to itself, a loop over two rows). */
export interface MessageRow {
  y: number;
  message: SequenceMessage;
  label: string;
  from: number;
  to: number;
}

export interface SequenceScene {
  columns: number;
  rows: number;
  lifelines: Lifeline[];
  frames: Frame[];
  messages: MessageRow[];
  steps: FlowStep[];
}

/** What one moment of playback lights: the step at `index` (and its parallel siblings), `progress` (0..100) of the way through its packet's travel. */
export interface SequencePlay {
  index: number;
  progress: number;
}

/** Rows the participant boxes take: border, name, tech, border. */
const HEAD_ROWS = 4;
const BOX_MIN = 12;
const BOX_MAX = 26;
/** The narrowest a box is let get, its name cut, before the diagram is let grow wider than the terminal. */
const BOX_FLOOR = 8;
/** The shortest a label is cut to before the diagram is let grow wider than the terminal. */
const LABEL_MIN = 8;
/** How far along an arrow (in %) a failed call gets before it is cut off, as on the architecture. */
const FAIL_AT = 55;

const cut = (text: string, room: number) => (room <= 0 ? '' : text.length <= room ? text : `${text.slice(0, Math.max(0, room - 1))}…`);

/** The text over a message's arrow: a request's number and label, a response's label (its status, else `return`). */
function labelOf(m: SequenceMessage): string {
  if (m.kind === 'request') return `${m.number} ${m.label}`.trimEnd();
  return m.label || 'return';
}

/** A sequence diagram of `scenario`, at most `columns` wide where its labels can be cut to fit. */
export function buildSequenceScene(diagram: Diagram, useCase: DiagramUseCase, scenario: DiagramScenario, columns: number): SequenceScene {
  const sequence = buildSequence(useCase, scenario, diagram.nodes);
  const nodes = new Map(diagram.nodes.map((n) => [n.id, n]));
  const index = new Map(sequence.participants.map((p, i) => [p.id, i]));
  const items = sectionedItems(sequence.items);
  const messages = items.flatMap((i) => (i.kind !== 'item' ? [] : i.item.kind === 'message' ? [i.item.message] : i.item.branches.flat()));

  // How many frames nest at most: sections, and a par inside them.
  let deepest = 0;
  for (const i of items) deepest = Math.max(deepest, i.depth + (i.kind === 'item' && i.item.kind === 'par' ? 1 : 0));
  const margin = deepest + 1;

  const natural = sequence.participants.map((p) => {
    const node = nodes.get(p.id);
    const named = p.name.length + (node && node.kind === 'component' ? 2 : 0);
    return Math.max(BOX_MIN, Math.min(BOX_MAX, Math.max(named, p.tech?.length ?? 0) + 4));
  });

  let widths = natural;

  // Lifeline columns for labels cut to `room`: each pair of neighbours as far apart as their boxes need, then each message as wide as its label.
  const place = (room: number) => {
    const xs: number[] = [];
    sequence.participants.forEach((_, i) => {
      const half = Math.ceil(widths[i] / 2);
      xs.push(i === 0 ? Math.max(half, margin + 1) : xs[i - 1] + Math.ceil(widths[i - 1] / 2) + half + 1);
    });
    let right = xs.length ? xs[xs.length - 1] + Math.ceil(widths[widths.length - 1] / 2) : 0;
    const spans = messages
      .map((m) => {
        const a = index.get(m.from)!;
        const b = index.get(m.to)!;
        return { lo: Math.min(a, b), hi: a === b ? a + 1 : Math.max(a, b), need: Math.min(room, labelOf(m).length) + 3 };
      })
      .sort((p, q) => p.hi - q.hi);
    for (const { lo, hi, need } of spans) {
      if (hi >= xs.length) {
        right = Math.max(right, xs[lo] + need + 3);
        continue;
      }
      const short = xs[lo] + need - xs[hi];
      if (short > 0) for (let i = hi; i < xs.length; i++) xs[i] += short;
    }
    right = Math.max(right, xs.length ? xs[xs.length - 1] + Math.ceil(widths[widths.length - 1] / 2) : 0);
    return { xs, width: right + margin + 1 };
  };

  const longest = Math.max(LABEL_MIN, ...messages.map((m) => labelOf(m).length));
  let room = longest;
  let placed = place(room);
  while (placed.width > columns && room > LABEL_MIN) placed = place(--room);
  // Still too wide: narrower boxes, their names cut.
  for (let box = BOX_MAX - 1; placed.width > columns && box >= BOX_FLOOR; box--) {
    widths = natural.map((w) => Math.min(w, box));
    placed = place(room);
  }
  // Then the labels take back what the narrower boxes left.
  while (room < longest && placed.width < columns) {
    const wider = place(room + 1);
    if (wider.width > columns) break;
    placed = wider;
    room++;
  }

  const lifelines: Lifeline[] = sequence.participants.map((p, i) => ({ ...p, node: nodes.get(p.id), x: placed.xs[i], w: widths[i] }));
  const width = Math.max(placed.width, 20);

  // The rows under the boxes, top to bottom.
  const frames: Frame[] = [];
  const open: Frame[] = [];
  const rows: MessageRow[] = [];
  let y = HEAD_ROWS + 1;
  const message = (m: SequenceMessage) => {
    const a = index.get(m.from)!;
    const b = index.get(m.to)!;
    rows.push({ y, message: m, label: cut(labelOf(m), room), from: a, to: b });
    y += a === b ? 3 : 2;
  };
  for (const item of items) {
    if (item.kind === 'open') {
      const frame: Frame = { title: item.section.name, par: false, depth: item.depth, top: y++, bottom: -1, dividers: [] };
      frames.push(frame);
      open.push(frame);
    } else if (item.kind === 'close') {
      open.pop()!.bottom = y++;
    } else if (item.item.kind === 'message') message(item.item.message);
    else {
      const frame: Frame = { title: 'par', par: true, depth: item.depth, top: y++, bottom: -1, dividers: [] };
      frames.push(frame);
      item.item.branches.forEach((branch, i) => {
        if (i > 0) frame.dividers.push(y++);
        branch.forEach(message);
      });
      frame.bottom = y++;
    }
  }

  return { columns: width, rows: y + 1, lifelines, frames, messages: rows, steps: scenario.steps };
}

export interface SequencePaintOptions {
  play?: SequencePlay;
  icons?: IconStyle;
}

/** How a message is drawn while its scenario plays: the current step's, one played before it, one still to come. */
type Look = 'lit' | 'past' | 'future' | undefined;

export function paintSequence(scene: SequenceScene, options: SequencePaintOptions = {}): Grid {
  const grid = new Grid(scene.columns, scene.rows);
  const { play } = options;
  const current = play ? new Set<FlowStep>(currentStepsOf(scene.steps, play.index)) : undefined;
  const lookOf = (step: FlowStep): Look => (!play ? undefined : current!.has(step) ? 'lit' : scene.steps.indexOf(step) < play.index ? 'past' : 'future');
  const lit = new Set<string>();
  const failing = new Set<string>();
  for (const step of current ?? []) {
    lit.add(step.fromServiceId);
    lit.add(step.toServiceId);
    if (isErrorStep(step)) failing.add(step.toServiceId);
  }

  for (const l of scene.lifelines) for (let y = HEAD_ROWS; y < scene.rows; y++) grid.set(l.x, y, '│', COLOR.fadedMore);
  for (const f of scene.frames) drawFrame(grid, scene, f);
  for (const row of scene.messages) drawMessage(grid, scene, row, lookOf(row.message.step));
  if (play) for (const step of current!) drawPacket(grid, scene, step, play.progress);
  for (const l of scene.lifelines) drawBox(grid, l, failing.has(l.id) ? COLOR.fail : lit.has(l.id) ? COLOR.pink : play ? COLOR.faded : undefined, options.icons ?? 'nerd-font');
  return grid;
}

function drawBox(grid: Grid, l: Lifeline, accent: number | undefined, icons: IconStyle): void {
  const base = l.node ? nodeBaseColor(l.node) : undefined;
  const color = accent ?? (base ? hex(base) : COLOR.line);
  const x0 = l.x - Math.floor(l.w / 2);
  const x1 = x0 + l.w - 1;
  for (let x = x0 + 1; x < x1; x++) {
    grid.set(x, 0, '━', color);
    grid.set(x, HEAD_ROWS - 1, x === l.x ? '┳' : '━', color);
    grid.set(x, 1, ' ');
    grid.set(x, 2, ' ');
  }
  for (const [x, top, bottom] of [
    [x0, '┏', '┗'],
    [x1, '┓', '┛'],
  ] as const) {
    grid.set(x, 0, top, color);
    grid.set(x, 1, '┃', color);
    grid.set(x, 2, '┃', color);
    grid.set(x, HEAD_ROWS - 1, bottom, color);
  }
  const icon = l.node ? iconOf(l.node, icons) : undefined;
  const room = l.w - 4;
  const name = icon ? `${icon} ${cut(l.name, room - 2)}` : cut(l.name, room);
  const centre = (text: string) => x0 + 2 + Math.max(0, Math.floor((room - [...text].length) / 2));
  grid.text(centre(name), 1, name, DEFAULT);
  if (l.tech) grid.text(centre(cut(l.tech, room)), 2, cut(l.tech, room), COLOR.muted);
}

function drawFrame(grid: Grid, scene: SequenceScene, f: Frame): void {
  const x0 = f.depth;
  const x1 = scene.columns - 1 - f.depth;
  const color = f.par ? COLOR.muted : COLOR.line;
  for (let x = x0 + 1; x < x1; x++) {
    grid.set(x, f.top, '─', color);
    grid.set(x, f.bottom, '─', color);
    for (const d of f.dividers) grid.set(x, d, '╌', color);
  }
  grid.set(x0, f.top, '╭', color);
  grid.set(x1, f.top, '╮', color);
  grid.set(x0, f.bottom, '╰', color);
  grid.set(x1, f.bottom, '╯', color);
  for (let y = f.top + 1; y < f.bottom; y++) {
    const divider = f.dividers.includes(y);
    grid.set(x0, y, divider ? '├' : '│', color);
    grid.set(x1, y, divider ? '┤' : '│', color);
  }
  const title = ` ${cut(f.title, x1 - x0 - 5)} `;
  grid.text(x0 + 2, f.top, title, f.par ? COLOR.muted : COLOR.note);
}

/** The cells a message's packet travels, in order: along its arrow, or round its loop. */
function pathOf(scene: SequenceScene, row: MessageRow): { x: number; y: number }[] {
  const a = scene.lifelines[row.from].x;
  if (row.from === row.to) return [a + 1, a + 2, a + 3].map((x) => ({ x, y: row.y + 1 })).concat([{ x: a + 3, y: row.y + 2 }, { x: a + 2, y: row.y + 2 }, { x: a + 1, y: row.y + 2 }]);
  const b = scene.lifelines[row.to].x;
  const step = b > a ? 1 : -1;
  const cells: { x: number; y: number }[] = [];
  for (let x = a + step; x !== b; x += step) cells.push({ x, y: row.y + 1 });
  return cells;
}

function drawMessage(grid: Grid, scene: SequenceScene, row: MessageRow, look: Look): void {
  const m = row.message;
  const color = look === 'future' ? COLOR.fadedMore : m.error ? COLOR.fail : look === 'lit' ? COLOR.pink : m.kind === 'response' ? COLOR.muted : DEFAULT;
  const heavy = look === 'lit';
  const body = m.kind === 'response' ? (heavy ? '┅' : '╌') : heavy ? '━' : '─';
  const head = m.failed ? '✗' : m.async ? (m.to === m.from ? '◁' : '') : '';
  const cells = pathOf(scene, row);
  const a = scene.lifelines[row.from].x;

  if (row.from === row.to) {
    grid.text(a + 1, row.y + 1, `${body}${body}${heavy ? '┓' : '╮'}`, color);
    grid.text(a + 1, row.y + 2, `${head || '◄'}${body}${heavy ? '┛' : '╯'}`, color);
  } else {
    const right = scene.lifelines[row.to].x > a;
    for (const c of cells) grid.set(c.x, c.y, body, color);
    const last = cells[cells.length - 1];
    if (last) grid.set(last.x, last.y, head || (m.async ? (right ? '▷' : '◁') : right ? '►' : '◄'), color);
  }

  // The label above the arrow, from the left end of it (right of the lifeline for a loop); a request's number as a chip.
  const left = row.from === row.to ? a + 2 : Math.min(a, scene.lifelines[row.to].x) + 2;
  if (m.kind === 'request') {
    const [number, ...rest] = row.label.split(' ');
    const chip = look === 'future' ? COLOR.fadedMore : m.error ? COLOR.fail : COLOR.pink;
    grid.text(left, row.y, number, look === 'lit' ? COLOR.onColor : chip, Infinity, look === 'lit' ? chip : undefined);
    grid.text(left + number.length + 1, row.y, rest.join(' '), look === 'future' ? COLOR.fadedMore : DEFAULT);
  } else grid.text(left, row.y, row.label, look === 'future' ? COLOR.fadedMore : m.error ? COLOR.fail : COLOR.muted);
}

/** The packet of a playing step: out along its request and, answered, back along its response; a failed call cut off part way. */
function drawPacket(grid: Grid, scene: SequenceScene, step: FlowStep, progress: number): void {
  if (progress >= 100) return;
  const request = scene.messages.find((r) => r.message.step === step && r.message.kind === 'request');
  if (!request) return;
  const response = scene.messages.find((r) => r.message.step === step && r.message.kind === 'response');
  const failed = !!step.failed;
  const roundTrip = !!response && !failed;
  const [row, share] = failed ? [request, Math.min(progress, FAIL_AT) / 100] : roundTrip && progress > 50 ? [response!, (progress - 50) / 50] : [request, roundTrip ? progress / 50 : progress / 100];
  const cells = pathOf(scene, row);
  if (cells.length === 0) return;
  const at = cells[Math.max(0, Math.min(cells.length - 1, Math.round(share * (cells.length - 1))))];
  const cutOff = failed && progress >= FAIL_AT;
  grid.set(at.x, at.y, cutOff ? '✗' : '■', row.message.error || cutOff ? COLOR.fail : COLOR.pink);
}
