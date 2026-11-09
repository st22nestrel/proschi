import { layoutGraph, SYSTEM_SIZE, type Point } from '../../../frontend/src/dsl/autoLayout';
import { fallbackRoute, labelPoint, roundedPath, snapToBottom, withHead } from '../../../frontend/src/dsl/edgePath';
import type { Diagram, DiagramNode } from '../proschi';
import { DASH_ARRAY, nodeBaseColor, tint } from '../../../frontend/src/dsl/palette';
import type { DiagramEdge, LegendEntry } from '../../../frontend/src/dsl/types';
import type { NodeOverlay } from '../../../frontend/src/sim/overlay';
import { loadText, type SystemBadge, type SystemStatus } from '../terminal/systems';
import { techIcon, typeColor } from './icons';
import { card, esc, fit, r, softShadow, svgDocument, text, textWidth, wrap, type TextOptions } from './svg';
import { SKETCH, type RenderTheme } from './theme';

/**
 * The architecture as SVG, drawn like the editor's canvas (canvas.css): the
 * canvas's own top-down ELK layout (autoLayout.ts, so pinned `pos x,y`
 * positions hold), ComponentNode's monochrome cards with a thick ink border,
 * hard shadow and square handles, GroupNode's dashed frames, TextNode's notes,
 * and RoutedEdge's orthogonal edges along the layout's routes (edgePath.ts).
 * Colors follow the canvas's light theme (dsl/palette.ts): category tints,
 * `color`, tags, the legend and the critical badge.
 *
 * Colours, corners, shadows and icon tiles come from the render theme
 * (theme.ts): `sketch` as described above, or `classic`, the earlier look
 * with white rounded cards and type-coloured icon tiles.
 */

const MARGIN = 32;
// ComponentNode: border 2 + py-3, a 36px row (icon tile / name + tech), mb-2, and the team line.
const CARD_HEIGHT = 72;
const CARD_WITH_TEAM_HEIGHT = 92;
const PAD_X = 18;
const PAD_Y = 14;
const NOTE_FONT = 14;
const NOTE_LINE = 21;

const ICON = 34;
const SHADOW_ID = 'proschi-arch-shadow';

/** `text()` in the theme's ink unless `o.fill` says otherwise. */
function ink(th: RenderTheme) {
  return (x: number, y: number, content: string, o: TextOptions = {}) => text(x, y, content, { fill: th.colors.text, ...o });
}

/** The base colour a card is tinted with: sketch tints by category, classic only by an explicit `color`. */
function baseColor(th: RenderTheme, node: DiagramNode): string | undefined {
  return th.categoryTint ? nodeBaseColor(node) : node.style?.color;
}

/** The icon tile left of a card's name: outlined with an ink glyph (sketch), or filled in the type's colour with a white glyph (classic). */
function iconTile(th: RenderTheme, node: DiagramNode, x: number, y: number): string {
  if (th.iconTile === 'filled') {
    return [
      `<rect x="${r(x)}" y="${r(y)}" width="36" height="36" rx="4" fill="${typeColor(node.type)}"/>`,
      techIcon(node.techStack, x + 8, y + 8, 20, '#ffffff', node.type),
    ].join('\n');
  }
  return [
    `<rect x="${r(x + 1)}" y="${r(y + 1)}" width="${ICON - 2}" height="${ICON - 2}" rx="4" fill="${th.colors.background}" stroke="${th.colors.border}" stroke-width="2"/>`,
    techIcon(node.techStack, x + 8, y + 8, 18, th.colors.text, node.type),
  ].join('\n');
}

/** A card's second line (tech stack, team), monospace in sketch. */
function subtitle(th: RenderTheme, x: number, y: number, content: string, max: number, fill = th.colors.muted): string {
  return th.mono
    ? text(x, y + 31, fit(content, max, 12), { size: 11, weight: 500, fill, family: th.mono })
    : text(x, y + 32, fit(content, max, 12), { size: 12, fill });
}

interface Placed {
  node: DiagramNode;
  x: number;
  y: number;
  width: number;
  height: number;
  lines?: string[];
}

function noteLines(node: DiagramNode, width: number): string[] {
  return wrap(node.description ?? node.name, width - 36, NOTE_FONT, 12);
}

export interface ArchitectureOptions {
  /** Promise, headroom and status of each system box and expanded frame (terminal/systems.ts), by node id. */
  systems?: Record<string, SystemBadge>;
  /** The load on each card, by node id (terminal/systems.ts viewOverlay): a team's nodes inside an expanded system under what it is sent. */
  nodes?: Record<string, NodeOverlay>;
  /** The render theme (theme.ts); sketch by default. */
  theme?: RenderTheme;
}

export async function renderArchitectureSvg(diagram: Diagram, options: ArchitectureOptions = {}): Promise<string> {
  const th = options.theme ?? SKETCH;
  const C = th.colors;
  const tx = ink(th);
  const layout = await layoutGraph(diagram);
  const boxes = new Map(layout.nodes.map((b) => [b.id, b]));

  // Absolute positions: group members are laid out relative to their group.
  const absolute = (id: string): { x: number; y: number } => {
    const b = boxes.get(id)!;
    const parent = b.parent ? absolute(b.parent) : { x: 0, y: 0 };
    return { x: parent.x + b.position.x, y: parent.y + b.position.y };
  };
  const placed = new Map<string, Placed>();
  for (const node of diagram.nodes) {
    const box = boxes.get(node.id)!;
    const { x, y } = absolute(node.id);
    if (node.kind === 'group') placed.set(node.id, { node, x, y, width: box.width, height: box.height });
    else if (node.kind === 'text') {
      const lines = noteLines(node, box.width);
      placed.set(node.id, { node, x, y, width: box.width, height: 46 + lines.length * NOTE_LINE + 18, lines });
    } else placed.set(node.id, { node, x, y, width: box.width, height: node.kind === 'system' ? SYSTEM_SIZE.height : node.ownerTeam ? CARD_WITH_TEAM_HEIGHT : CARD_HEIGHT });
  }

  const all = [...placed.values()];
  // Routes can run outside every box (around a group), so they count towards the size too.
  const bends = Object.values(layout.routes).flatMap((route) => route.points);
  const minX = Math.min(0, ...all.map((p) => p.x), ...bends.map((p) => p.x));
  const minY = Math.min(0, ...all.map((p) => p.y), ...bends.map((p) => p.y));
  let maxX = Math.max(0, ...all.map((p) => p.x + p.width), ...bends.map((p) => p.x));
  let maxY = Math.max(0, ...all.map((p) => p.y + p.height), ...bends.map((p) => p.y));
  const dx = MARGIN - minX;
  const dy = MARGIN - minY;
  const body: string[] = [];
  const titles: string[] = [];

  // Groups first (outermost first), then edges, then cards on top, as on the canvas.
  const depth = (n: DiagramNode): number => {
    const parent = n.parent ? placed.get(n.parent) : undefined;
    return parent ? depth(parent.node) + 1 : 0;
  };
  for (const p of all.filter((p) => p.node.kind === 'group').sort((a, b) => depth(a.node) - depth(b.node))) {
    const x = p.x + dx;
    const y = p.y + dy;
    const base = baseColor(th, p.node);
    const t = base ? tint(base, 'light') : undefined;
    if (p.node.system === p.node.id) {
      // An expanded system: a solid double frame in its status color, its status, team, promise and load after the name.
      const badge = options.systems?.[p.node.id];
      const color = statusColor(th, badge?.status) ?? t?.line ?? th.group.line;
      const fill = t ? `fill="${t.groupFill}"` : `fill="${th.group.fill}"${th.group.fillOpacity !== undefined ? ` fill-opacity="${th.group.fillOpacity}"` : ''}`;
      body.push(
        `<g data-node="${esc(p.node.id)}" data-kind="system-frame"${badge ? ` data-status="${badge.status}"` : ''}>`,
        `<rect x="${r(x + 1)}" y="${r(y + 1)}" width="${r(p.width - 2)}" height="${r(p.height - 2)}" rx="${th.group.rx}" ${fill} stroke="${color}" stroke-width="2"/>`,
        `<rect x="${r(x + 5)}" y="${r(y + 5)}" width="${r(p.width - 10)}" height="${r(p.height - 10)}" rx="7" fill="none" stroke="${color}" stroke-width="1.5"/>`,
        '</g>',
      );
      const name = fit(p.node.name.toUpperCase(), p.width - 52, 12, true);
      const about = badge ? [STATUS[badge.status], badge.team ? `@${badge.team}` : '', badge.promise ?? '', loadText(badge)].filter(Boolean).join(' · ') : '';
      const after = x + 34 + textWidth(name, 12, true) + 12;
      titles.push(
        `<g data-group-title="${esc(p.node.id)}">`,
        techIcon('Logical Group', x + 14, y + 13, 14, color),
        halo(th, text(x + 34, y + 24, name, { size: 12, weight: 700, fill: color, spacing: 1 })),
        about ? halo(th, text(after, y + 24, fit(about, x + p.width - 14 - after, 12), { size: 12, weight: 600, fill: statusColor(th, badge?.status) ?? C.muted })) : '',
        '</g>',
      );
      continue;
    }
    const dash = p.node.style?.dash ? DASH_ARRAY[p.node.style.dash] : '7 5';
    const g = th.group;
    const frame = t
      ? `fill="${t.groupFill}" stroke="${t.line}" stroke-width="2" stroke-dasharray="${dash}"`
      : `fill="${g.fill}"${g.fillOpacity !== undefined ? ` fill-opacity="${g.fillOpacity}"` : ''} stroke="${g.line}"${g.lineOpacity !== undefined ? ` stroke-opacity="${g.lineOpacity}"` : ''} stroke-width="2" stroke-dasharray="${dash}"`;
    body.push(
      `<g data-node="${esc(p.node.id)}" data-kind="group">`,
      `<rect x="${r(x + 1)}" y="${r(y + 1)}" width="${r(p.width - 2)}" height="${r(p.height - 2)}" rx="${g.rx}" ${frame}/>`,
      '</g>',
    );
    // The title and description go over the edges (with a halo), so an edge entering the group does not strike them through.
    const line = t?.line ?? g.line;
    titles.push(
      `<g data-group-title="${esc(p.node.id)}">`,
      ...(g.title === 'caps'
        ? [
            techIcon('Logical Group', x + 14, y + 13, 14, line),
            halo(th, text(x + 34, y + 24, fit(p.node.name.toUpperCase(), p.width - 52, 12, true), { size: 12, weight: 700, fill: line, opacity: t ? 1 : 0.8, spacing: 1 })),
            p.node.description ? halo(th, text(x + 14, y + 48, fit(p.node.description, p.width - 28, 13), { size: 13, fill: C.muted })) : '',
          ]
        : [
            // classic: GroupNode's folder icon and name in the group's blue, as before the canvas restyle.
            techIcon('Logical Group', x + 18, y + 22, 20, line),
            halo(th, text(x + 46, y + 38, fit(p.node.name, p.width - 64, 18, true), { size: 18, weight: 600, fill: line })),
            p.node.description ? halo(th, text(x + 18, y + 72, fit(p.node.description, p.width - 36, 14), { size: 14, fill: C.team })) : '',
          ]),
      '</g>',
    );
  }

  for (const edge of diagram.edges) {
    const s = placed.get(edge.source);
    const t = placed.get(edge.target);
    if (!s || !t || s === t) continue;
    const sBox = { x: s.x + dx, y: s.y + dy, width: s.width, height: s.height };
    const tBox = { x: t.x + dx, y: t.y + dy, width: t.width, height: t.height };
    const route = layout.routes[edge.id];
    const shift = (p: Point) => ({ x: p.x + dx, y: p.y + dy });
    // Cards here are drawn at their own height, so ends on a bottom move onto it.
    const points = route ? snapToBottom(snapToBottom(route.points.map(shift), 'start', sBox), 'end', tBox) : fallbackRoute(sBox, tBox);
    body.push(drawEdge(th, edge.id, edge.label, points, route?.label ? shift(route.label) : labelPoint(points), edgeStroke(edge)));
  }

  body.push(...titles);

  for (const p of all) {
    if (p.node.kind === 'group') continue;
    body.push(p.node.kind === 'text' ? drawNote(th, p, dx, dy) : p.node.kind === 'system' ? drawSystem(th, p, dx, dy, options.systems?.[p.node.id]) : drawCard(th, p, dx, dy, options.nodes?.[p.node.id]));
  }

  if (diagram.legend && diagram.nodes.length > 0) {
    const size = legendSize(diagram.legend);
    const lx = maxX + dx + LEGEND_GAP;
    const ly = Math.max(MARGIN, maxY + dy - size.height);
    body.push(drawLegend(th, diagram.legend, lx, ly, size.width));
    maxX += LEGEND_GAP + size.width;
    maxY = Math.max(maxY, ly - dy + size.height);
  }

  if (diagram.nodes.length === 0) body.push(tx(MARGIN, MARGIN + 16, 'Empty diagram', { fill: C.muted }));
  const defs = th.card.shadow === 'soft' ? softShadow(SHADOW_ID) : '';
  return svgDocument(maxX - minX + MARGIN * 2, maxY - minY + MARGIN * 2, diagram.title ?? 'Architecture', body.filter(Boolean), defs, th);
}

/** A background-coloured outline behind the letters, so lines underneath stop short of them. */
function halo(th: RenderTheme, textElement: string): string {
  return textElement.replace('<text ', `<text paint-order="stroke" stroke="${th.colors.background}" stroke-width="5" stroke-linejoin="round" `);
}

/** React Flow's handles (`.pc-handle`), 9px squares centred on the card's top and bottom; none in classic. */
function handles(th: RenderTheme, cx: number, top: number, bottom: number): string {
  if (!th.handles) return '';
  const one = (cy: number) => `<rect x="${r(cx - 4.5)}" y="${r(cy - 4.5)}" width="9" height="9" rx="1" fill="${th.colors.surface}" stroke="${th.colors.border}" stroke-width="2"/>`;
  return `${one(top)}\n${one(bottom)}`;
}

function drawCard(th: RenderTheme, p: Placed, dx: number, dy: number, load?: NodeOverlay): string {
  const C = th.colors;
  const { node, width, height } = p;
  const x = p.x + dx;
  const y = p.y + dy;
  const textX = x + PAD_X + ICON + 10;
  const base = baseColor(th, node);
  const t = base ? tint(base, 'light') : undefined;
  const dash = node.style?.dash ? DASH_ARRAY[node.style.dash].replace(/\d+/g, (n) => String(Number(n) * 1.5)) : undefined;
  // The load, as on the terminal's cards: how busy (or down) after the tech, a bar along the bottom, and the heat as the fill.
  const u = load?.utilization;
  const busy = load?.down ? 'down' : u !== undefined ? `${Math.round(u * 100)}%` : '';
  const heat = heatOf(load);
  const textMax = width - PAD_X * 2 - ICON - 10;
  const techMax = busy ? textMax - textWidth(busy, 11, true) - 8 : textMax;
  const ink = load?.saturated || (u ?? 0) >= 1 ? C.error : load?.down ? C.muted : C.text;
  const bar = u !== undefined && !load?.down ? loadBar(th, x + PAD_X, y + height - 11, width - PAD_X * 2, u, ink) : '';
  return [
    `<g data-node="${esc(node.id)}" data-kind="${esc(node.type)}"${busy ? ` data-load="${busy}"` : ''}>`,
    card(x, y, width, height, { fill: heat ?? t?.fill, line: t?.line, dash, theme: th, shadowId: SHADOW_ID }),
    iconTile(th, node, x + PAD_X, y + PAD_Y),
    text(textX, y + PAD_Y + 15, fit(node.name, textMax, 14, true), { size: 14, weight: th.bold, fill: C.text }),
    subtitle(th, textX, y + PAD_Y, node.techStack, techMax),
    busy ? text(x + width - PAD_X, y + PAD_Y + 31, busy, { size: 11, weight: 700, fill: ink, anchor: 'end', family: th.mono }) : '',
    bar,
    node.ownerTeam ? text(x + PAD_X, y + PAD_Y + 60, fit(`Team: ${node.ownerTeam}`, width - PAD_X * 2, 12), { size: 12, fill: C.team }) : '',
    handles(th, x + width / 2, y, y + height),
    node.critical ? criticalBadge(th, x + width, y) : '',
    '</g>',
  ]
    .filter(Boolean)
    .join('\n');
}

/** The status word of a system, and its color: red past capacity or its SLA, amber running hot (as the terminal's, paint.ts). */
const STATUS: Record<SystemStatus, string> = { ok: '✓ ok', hot: '▲ hot', saturated: '✗ saturated', breach: '✗ breaks SLA', idle: 'not simulated' };
const statusColor = (th: RenderTheme, status: SystemStatus | undefined): string | undefined =>
  status === 'saturated' || status === 'breach' ? th.colors.error : status === 'hot' ? '#B7791F' : undefined;
// The canvas's load fills (utils/heat.ts), light theme.
const HEAT = { warm: '#FFF1BF', hot: '#FFD6E8', over: '#FFD9D6' };

/**
 * A collapsed system (docs/design/team-systems-and-imports.md D3): a card
 * with a second border inside the first, its name and @team, the team's
 * promise, what it is sent against its headroom with a bar, and its status;
 * the border goes red past capacity or its SLA, amber running hot, and the
 * card fills with its heat as a busy card does on the canvas.
 */
/** How busy a card is, as a thin bar: the track, and the share it is busy. */
function loadBar(th: RenderTheme, x: number, y: number, w: number, u: number, ink: string): string {
  const share = Math.min(1, u);
  return [
    `<rect x="${r(x)}" y="${r(y)}" width="${r(w)}" height="3" rx="1.5" fill="${th.colors.text}" fill-opacity="0.12"/>`,
    `<rect x="${r(x)}" y="${r(y)}" width="${r(Math.max(share > 0 ? 3 : 0, w * share))}" height="3" rx="1.5" fill="${ink}"/>`,
  ].join('\n');
}

/** A card's fill for its load: the canvas's heat past 70%, 90% and capacity. */
function heatOf(load: NodeOverlay | undefined): string | undefined {
  const u = load?.utilization;
  if (!load || load.down || u === undefined) return undefined;
  return load.saturated || u >= 1 ? HEAT.over : u >= 0.9 ? HEAT.hot : u >= 0.7 ? HEAT.warm : undefined;
}

function drawSystem(th: RenderTheme, p: Placed, dx: number, dy: number, badge: SystemBadge | undefined): string {
  const C = th.colors;
  const { node, width, height } = p;
  const x = p.x + dx;
  const y = p.y + dy;
  const base = baseColor(th, node);
  const t = base ? tint(base, 'light') : undefined;
  const status = badge?.status;
  const line = statusColor(th, status) ?? t?.line ?? C.border;
  const u = badge?.utilization;
  const heat = u === undefined ? undefined : status === 'saturated' || u >= 1 ? HEAT.over : u >= 0.9 ? HEAT.hot : u >= 0.7 ? HEAT.warm : undefined;
  const textX = x + PAD_X + ICON + 10;
  const textMax = width - PAD_X * 2 - ICON - 10;
  const out = [
    `<g data-node="${esc(node.id)}" data-kind="system"${status ? ` data-status="${status}"` : ''}>`,
    card(x, y, width, height, { fill: heat ?? t?.fill, line, theme: th, shadowId: SHADOW_ID }),
    `<rect x="${r(x + 6)}" y="${r(y + 6)}" width="${r(width - 12)}" height="${r(height - 12)}" rx="${Math.max(2, th.card.rx - 4)}" fill="none" stroke="${line}" stroke-width="1.5"/>`,
    iconTile(th, node, x + PAD_X, y + PAD_Y),
    text(textX, y + PAD_Y + 15, fit(node.name, textMax, 14, true), { size: 14, weight: th.bold, fill: C.text }),
    text(textX, y + PAD_Y + 31, fit(badge?.team ? `@${badge.team}` : 'system', textMax, 12), { size: 12, weight: 600, fill: C.muted }),
  ];
  if (badge) {
    const word = STATUS[badge.status];
    const pill = textWidth(word, 11, true) + 14;
    const ink = statusColor(th, badge.status) ?? C.text;
    out.push(
      `<rect x="${r(x + width - 14 - pill)}" y="${r(y - 9)}" width="${r(pill)}" height="18" rx="9" fill="${C.surface}" stroke="${ink}" stroke-width="1.5"/>`,
      text(x + width - 14 - pill / 2, y + 4, word, { size: 11, weight: 700, fill: ink, anchor: 'middle' }),
      text(x + PAD_X, y + PAD_Y + 52, fit(badge.promise ? `promise ${badge.promise}` : 'no promise', width - PAD_X * 2, 12), { size: 12, weight: 500, fill: badge.promise ? C.text : C.muted, family: th.mono }),
      text(x + PAD_X, y + PAD_Y + 68, loadText(badge), { size: 12, weight: 600, fill: C.text, family: th.mono }),
      text(x + width - PAD_X, y + PAD_Y + 68, 'sent / headroom', { size: 11, fill: C.muted, anchor: 'end' }),
    );
    if (Number.isFinite(badge.headroomRps) && badge.headroomRps > 0) {
      const w = width - PAD_X * 2;
      const share = Math.min(1, badge.sentRps / badge.headroomRps);
      out.push(
        `<rect x="${r(x + PAD_X)}" y="${r(y + PAD_Y + 74)}" width="${r(w)}" height="4" rx="2" fill="${C.text}" fill-opacity="0.12"/>`,
        `<rect x="${r(x + PAD_X)}" y="${r(y + PAD_Y + 74)}" width="${r(Math.max(share > 0 ? 3 : 0, w * share))}" height="4" rx="2" fill="${ink}"/>`,
      );
    }
  }
  out.push(handles(th, x + width / 2, y, y + height), '</g>');
  return out.filter(Boolean).join('\n');
}

function drawNote(th: RenderTheme, p: Placed, dx: number, dy: number): string {
  const x = p.x + dx;
  const y = p.y + dy;
  const n = th.note;
  // sketch: a white card under a 22% wash of yellow; classic: TextNode's old yellow sticky note.
  const paper = n.border
    ? `<rect x="${r(x + 1)}" y="${r(y + 1)}" width="${r(p.width - 2)}" height="${r(p.height - 2)}" rx="${th.card.rx}" fill="${n.fill}" stroke="${n.border}" stroke-width="2"/>`
    : [
        card(x, y, p.width, p.height, { fill: th.colors.surface, stroke: 2, theme: th }),
        `<rect x="${r(x + 2)}" y="${r(y + 2)}" width="${r(p.width - 4)}" height="${r(p.height - 4)}" rx="3" fill="${n.fill}" fill-opacity="0.22"/>`,
      ].join('\n');
  return [
    `<g data-node="${esc(p.node.id)}" data-kind="text">`,
    paper,
    techIcon('Sticky Note', x + 18, y + 20, 16, n.icon),
    text(x + 42, y + 33, fit(p.node.name, p.width - 60, 14), { size: 14, weight: n.border ? 500 : 600, fill: n.title }),
    ...(p.lines ?? []).map((line, i) => text(x + 18, y + 61 + i * NOTE_LINE, line, { size: NOTE_FONT, fill: n.body })),
    '</g>',
  ].join('\n');
}

/** `critical`: ComponentNode's warning badge, a yellow disc with a triangle centred on the card's top-right corner. */
function criticalBadge(th: RenderTheme, cx: number, cy: number): string {
  const ink = th.colors.text;
  return [
    `<g data-critical="true">`,
    th.card.shadow === 'hard' ? `<circle cx="${r(cx + 1)}" cy="${r(cy + 1)}" r="11" fill="${ink}"/>` : '',
    `<circle cx="${r(cx)}" cy="${r(cy)}" r="10.5" fill="${CRITICAL_FILL}" stroke="${ink}" stroke-width="1.5"/>`,
    `<path d="M${r(cx)},${r(cy - 5.5)} L${r(cx + 5.5)},${r(cy + 4)} L${r(cx - 5.5)},${r(cy + 4)} Z" fill="none" stroke="${ink}" stroke-width="1.6" stroke-linejoin="round"/>`,
    `<path d="M${r(cx)},${r(cy - 1.5)} V${r(cy + 0.8)} M${r(cx)},${r(cy + 2.4)} v0.1" stroke="${ink}" stroke-width="1.6" stroke-linecap="round"/>`,
    '</g>',
  ]
    .filter(Boolean)
    .join('\n');
}

const CRITICAL_FILL = '#FFD23F';
const LEGEND_GAP = 32;
const LEGEND_ROW = 22;
const LEGEND_PAD = 12;
const LEGEND_SWATCH = 22;

function legendSize(entries: LegendEntry[]): { width: number; height: number } {
  const label = Math.max(...entries.map((e) => textWidth(fit(e.label, 240, 12), 12)), textWidth('LEGEND', 10) + 8);
  return { width: Math.ceil(LEGEND_PAD * 2 + LEGEND_SWATCH + 8 + label), height: LEGEND_PAD * 2 + 16 + entries.length * LEGEND_ROW };
}

/** The legend panel (Legend.tsx): a card with one swatch and label per entry. */
function drawLegend(th: RenderTheme, entries: LegendEntry[], x: number, y: number, width: number): string {
  const C = th.colors;
  const { height } = legendSize(entries);
  const out = [`<g data-legend="true">`, card(x, y, width, height, { stroke: 2, theme: th, shadowId: SHADOW_ID })];
  out.push(text(x + LEGEND_PAD, y + LEGEND_PAD + 8, 'LEGEND', { size: 10, weight: 700, fill: C.muted, spacing: 1 }));
  entries.forEach((entry, i) => {
    const rowY = y + LEGEND_PAD + 16 + i * LEGEND_ROW;
    const t = entry.color ? tint(entry.color, 'light') : undefined;
    const dash = entry.dash ? ` stroke-dasharray="${DASH_ARRAY[entry.dash]}"` : '';
    out.push(
      `<rect data-entry="${esc(entry.id)}" x="${r(x + LEGEND_PAD + 1)}" y="${r(rowY + 5)}" width="${LEGEND_SWATCH - 2}" height="12" rx="3" fill="${t?.fill ?? C.surface}" stroke="${t?.line ?? C.border}" stroke-width="2"${dash}/>`,
      text(x + LEGEND_PAD + LEGEND_SWATCH + 8, rowY + 15, fit(entry.label, 240, 12), { size: 12, weight: 500, fill: C.text }),
    );
  });
  out.push('</g>');
  return out.join('\n');
}

/** A tagged edge's stroke color and dash, light theme. */
function edgeStroke(edge: DiagramEdge): { color?: string; dash?: string } {
  return {
    ...(edge.style?.color ? { color: tint(edge.style.color, 'light').line } : {}),
    ...(edge.style?.dash ? { dash: DASH_ARRAY[edge.style.dash] } : {}),
  };
}

/** RoutedEdge: the route with rounded bends and an arrowhead at the target, the label on the line. */
function drawEdge(th: RenderTheme, id: string, label: string | undefined, points: Point[], at: Point, stroke: { color?: string; dash?: string } = {}): string {
  const color = stroke.color ?? th.colors.edge;
  const { points: line, head } = withHead(points);
  const out = [
    `<g data-edge="${esc(id)}">`,
    `<path d="${roundedPath(line)}" fill="none" stroke="${color}" stroke-width="${th.stroke}"${stroke.dash ? ` stroke-dasharray="${stroke.dash}"` : ''}/>`,
  ];
  if (head) out.push(`<path d="${head}" fill="${color}"/>`);
  if (label) {
    const shown = fit(label, 200, 11);
    const w = textWidth(shown, 11) + (th.mono ? 12 : 8);
    out.push(
      `<rect x="${r(at.x - w / 2)}" y="${r(at.y - 9)}" width="${r(w)}" height="18" rx="2" fill="${th.colors.background}"/>`,
      th.mono
        ? text(at.x, at.y + 4, shown, { size: 11, weight: 500, fill: th.colors.text, opacity: 0.8, anchor: 'middle', family: th.mono })
        : text(at.x, at.y + 4, shown, { size: 11, fill: th.colors.text, anchor: 'middle' }),
    );
  }
  out.push('</g>');
  return out.join('\n');
}
