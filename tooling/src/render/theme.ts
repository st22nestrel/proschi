/**
 * Render themes for `proschi render`: the colours and the few structural
 * choices (card corners and shadow, icon tiles, handles, group titles) the
 * architecture and sequence renderers draw with. One renderer, two token sets.
 *
 * - `sketch` (default): the editor's canvas look — cream paper, ink borders,
 *   hard shadows, outlined icon tiles, pink step numbers, monospace tech names.
 * - `classic`: the look `proschi render` and the VS Code preview had before
 *   the canvas restyle (gvart.proschi ≤ 0.10) — white background, rounded
 *   light-grey cards with a soft shadow, icons on tiles coloured by component
 *   type, blue requests and step numbers, grey dashed lifelines, sans text.
 */

import { CANVAS_FONT, CANVAS_TOKENS, TAILWIND_HEX } from '../../../frontend/src/utils/canvasColors';

export const THEME_NAMES = ['sketch', 'classic'] as const;
export type ThemeName = (typeof THEME_NAMES)[number];
export const DEFAULT_THEME: ThemeName = 'sketch';

export interface RenderTheme {
  name: ThemeName;
  font: string;
  /** Font of tech stacks and edge labels; undefined keeps the sans font. */
  mono?: string;
  colors: {
    background: string;
    surface: string;
    text: string;
    muted: string;
    /** Response arrows. */
    line: string;
    border: string;
    /** Step number discs. */
    active: string;
    error: string;
    par: string;
    /** The hard shadow (sketch). */
    shadow: string;
    /** Request arrows. */
    request: string;
    /** Number inside a step disc. */
    stepText: string;
    /** Outline of a step disc; undefined draws none. */
    stepStroke?: string;
    lifeline: string;
    lifelineOpacity?: number;
    /** Architecture edges. */
    edge: string;
    /** Team line and group description. */
    team: string;
  };
  card: { rx: number; stroke: number; shadow: 'hard' | 'soft' };
  /** `outline`: a paper tile with an ink glyph; `filled`: a tile in the component type's colour with a white glyph. */
  iconTile: 'outline' | 'filled';
  /** React Flow's square handles on top and bottom of each card. */
  handles: boolean;
  /** Width of edges and message arrows. */
  stroke: number;
  /** Cards take their category's default colour (sketch); classic only tints cards with an explicit `color`. */
  categoryTint: boolean;
  group: { fill: string; line: string; fillOpacity?: number; lineOpacity?: number; rx: number; title: 'caps' | 'plain' };
  note: { fill: string; border?: string; icon: string; title: string; body: string };
  /** Text weight of names and titles. */
  bold: number;
  /** CSS custom properties of the `--format html` page, light then dark. */
  page: { light: string; dark: string; figure: string };
}

const S = CANVAS_TOKENS.light;

export const SKETCH: RenderTheme = {
  name: 'sketch',
  font: CANVAS_FONT,
  mono: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  colors: {
    background: S.paper,
    surface: S.surface,
    text: S.ink,
    muted: S.muted,
    line: S.muted,
    border: S.ink,
    active: S.accent,
    error: S.fail,
    par: S.muted,
    shadow: S.shadow,
    request: S.ink,
    stepText: S.ink,
    stepStroke: S.ink,
    lifeline: S.muted,
    lifelineOpacity: 0.6,
    edge: S.muted,
    team: S.muted,
  },
  card: { rx: 4, stroke: 3, shadow: 'hard' },
  iconTile: 'outline',
  handles: true,
  stroke: 2,
  categoryTint: true,
  group: { fill: S.ink, fillOpacity: 0.03, line: S.ink, lineOpacity: 0.45, rx: 10, title: 'caps' },
  // TextNode: `--c-yellow` at 22% over the surface.
  note: { fill: '#FFD23F', icon: S.ink, title: S.ink, body: S.ink },
  bold: 700,
  page: {
    light: '--bg: #ffffff; --fg: #111111; --muted: #5b5b5b; --card: #fff8e7; --border: #111111; --link: #111111; --error: #ff3b30;',
    dark: '--bg: #141318; --fg: #f4efe3; --muted: #a9a5b4; --card: #fff8e7; --border: #f4efe3; --link: #f4efe3; --error: #ff6b61;',
    figure: 'background: var(--card); border: 2px solid var(--border); border-radius: 4px; box-shadow: 3px 3px 0 var(--border);',
  },
};

export const CLASSIC: RenderTheme = {
  name: 'classic',
  font: CANVAS_FONT,
  colors: {
    background: '#ffffff',
    surface: '#ffffff',
    text: TAILWIND_HEX['text-gray-800'],
    muted: TAILWIND_HEX['text-gray-500'],
    line: '#6b7280',
    border: TAILWIND_HEX['border-gray-300'],
    active: '#3b82f6',
    error: '#dc2626',
    par: '#6366f1',
    shadow: '#000000',
    request: '#3b82f6',
    stepText: '#ffffff',
    lifeline: TAILWIND_HEX['border-gray-300'],
    edge: '#b1b1b7',
    team: TAILWIND_HEX['text-gray-600'],
  },
  card: { rx: 8, stroke: 2, shadow: 'soft' },
  iconTile: 'filled',
  handles: false,
  stroke: 1.5,
  categoryTint: false,
  group: { fill: '#f0f9ff', line: '#3b82f6', rx: 8, title: 'plain' },
  note: {
    fill: TAILWIND_HEX['bg-yellow-100'],
    border: TAILWIND_HEX['border-yellow-300'],
    icon: TAILWIND_HEX['text-yellow-600'],
    title: TAILWIND_HEX['text-yellow-800'],
    body: TAILWIND_HEX['text-gray-700'],
  },
  bold: 600,
  page: {
    light: '--bg: #f8fafc; --fg: #1f2937; --muted: #6b7280; --card: #ffffff; --border: #e5e7eb; --link: #2563eb; --error: #dc2626;',
    dark: '--bg: #0f172a; --fg: #e5e7eb; --muted: #94a3b8; --card: #ffffff; --border: #334155; --link: #93c5fd; --error: #f87171;',
    figure: 'background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 8px;',
  },
};

const THEMES: Record<ThemeName, RenderTheme> = { sketch: SKETCH, classic: CLASSIC };

export function isThemeName(name: unknown): name is ThemeName {
  return typeof name === 'string' && (THEME_NAMES as readonly string[]).includes(name);
}

/** The theme called `name` (default: sketch); throws an Error listing the valid names for an unknown one. */
export function getTheme(name: string = DEFAULT_THEME): RenderTheme {
  if (!isThemeName(name)) throw new Error(`Unknown theme '${name}'; use ${THEME_NAMES.join(', ')}`);
  return THEMES[name];
}
