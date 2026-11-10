import { atom, memberOf, read, update } from 'claude-code'
import type { Elements, EngineInterface, On, PluginOptions, RenderElement, RenderNode, RenderSurface, UiScrollArgs } from 'claude-code'

import type { Layout } from '../../frontend/src/dsl/autoLayout'
import type { IconStyle } from '../../tooling/src/terminal/icons'
import { importFilePath, keyOf, loadDocument, missingImports, parseSource, type Document, type Source } from '../../tooling/src/terminal/document'
import { CACHE_DIR, LOCK_FILE, lockedHash, parseLock, remoteError, type Lock } from '../../tooling/src/lockFormat'
import { isRemoteSpec } from '../../frontend/src/dsl/imports'
import { paint } from '../../tooling/src/terminal/paint'
import { currentStepsOf, isErrorStep, playAt, STEP_MS, TRAVEL_MS } from '../../tooling/src/terminal/playback'
import { buildScene, type Scene } from '../../tooling/src/terminal/scene'
import { buildSequenceScene, paintSequence, type SequenceScene } from '../../tooling/src/terminal/sequence'
import type { Grid } from '../../tooling/src/terminal/grid'
import { idList, systemAt, viewError, type SystemsView } from '../../tooling/src/terminal/systems'
import type { DiagramScenario, DiagramUseCase, FlowStep } from '../../frontend/src/dsl/types'
import { groupByEndpoint } from '../../frontend/src/playground/useCaseGroups'
import type { PaneSource, Player } from '../types'

/**
 * Draws Proschi diagrams in Claude Code's terminal: ```proschi blocks in
 * replies, `.proschi` files Claude writes or edits, and `/proschi view <file>`
 * in a pane. Each drawing is the browser's layout in character cells, with
 * the simulation's numbers on the cards and a player for the use cases.
 *
 * Built from plugin/src by tooling/build.mjs into hooks/register.js (this
 * module) and hooks/layout.cjs (ELK, which the hooks run in Node).
 */

type Ui = Elements['terminal']
type Draw = { ui: Ui; requestId: string; columns: number }

/** The `icons` setting: Nerd Font glyphs, plain symbols, or none. */
let icons: IconStyle = 'nerd-font'

const PANE = 'proschi-view'
/** The pane's one drawing, by the id its player is stored under. */
const PANE_VIEW = `${PANE}:0`
const IDLE: Player = { pick: '', step: 0, isPlaying: false, mode: 'diagram', explorer: false, expanded: [] }
const NO_SOURCE: PaneSource = { source: '' }
const paneFile = atom({ plugin: 'proschi', key: 'paneFile' } as const, '')
const paneSource = atom({ plugin: 'proschi', key: 'paneSource' } as const, NO_SOURCE)
const players = atom({ plugin: 'proschi', key: 'player' } as const, IDLE)

/** The pane's keys, as its Buttons' hotkeys name them; the system keys where the diagram has systems. */
const PANE_KEYS = 'p play · n/b step · r restart · e end · v sequence/architecture · x explorer · d diagram · esc back to the prompt'
const SYSTEM_KEYS = 's next system · o open/close · f focus in · u back out'

/** One animation frame, in ms. */
const FRAME = 50

const HINT = [
  'Proschi diagrams render in this terminal: put a Proschi document in a ```proschi fenced block',
  '(or write a .proschi file) and Claude Code draws it as the architecture, with a player for its',
  'use cases and the simulation\'s load on each node when it has `traffic`. Use the block instead of',
  'Mermaid or ASCII art when showing an architecture or a request flow.',
].join(' ')

// Per module load: what is laid out, being laid out, or failed, by document key.
const layouts = new Map<string, Layout | { error: string }>()
const pending = new Set<string>()
const documents = new Map<string, Document>()
const scenes = new Map<string, Scene>()
const sequences = new Map<string, SequenceScene>()
const timers = new Map<string, { cancel(): void }>()

const FENCE = /^```proschi[^\n]*\n([\s\S]*?)\n```[ \t]*$/gm

export function register(on: On, options: PluginOptions): void {
  const chosen = (options as { icons?: unknown }).icons
  icons = chosen === 'symbols' || chosen === 'none' ? chosen : 'nerd-font'

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'proschi', description: 'Proschi diagrams: /proschi view <file.proschi> shows one in a pane', argumentHint: 'view [--expand <id>,…] [--focus <id>] <file>' })
    return next(e)
  })

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    return { ...composed, sections: [...composed.sections, { id: 'proschi:render', text: HINT, scope: 'session' as const }] }
  })

  on('command.run', { command: 'proschi' }, async ($, e) => {
    const [verb, ...rest] = e.args.trim().split(/\s+/)
    const words: string[] = []
    const view: SystemsView = {}
    for (let i = 0; i < rest.length; i++) {
      if (rest[i] === '--expand' || rest[i] === '--focus') {
        const value = rest[++i]
        if (!value || idList(value).length === 0) return { text: `Missing system id after ${rest[i - 1]}` }
        if (rest[i - 1] === '--expand') view.expanded = [...(view.expanded ?? []), ...idList(value)]
        else view.focus = value
      } else words.push(rest[i])
    }
    const file = words.join(' ')
    if (verb !== 'view' || !file) return { text: USAGE }
    if (!(await $.fs.exists(file))) return { text: `No such file: ${file}` }
    if (view.expanded || view.focus !== undefined) {
      const { diagram, errors } = parseSource(await readWithImports($, file))
      const refused = errors.length ? undefined : viewError(diagram, view)
      if (refused) return { text: refused }
    }
    stop(PANE_VIEW)
    await update($, memberOf(players, { requestId: PANE_VIEW }), () => ({ ...IDLE, expanded: view.expanded ?? [], ...(view.focus !== undefined ? { focus: view.focus } : {}) }))
    await update($, paneFile, () => file)
    await $.ui.open({ id: PANE, title: `Proschi · ${basename(file)}` })
    watch($, file)
    return { text: `Showing ${file} in the Proschi pane.` }
  })

  on('ui.close', { id: PANE }, async ($, e, next) => {
    stop(PANE_VIEW)
    stop(PANE)
    return next(e)
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || !e.props.text.includes('```proschi')) return next(e)
    const ui = $.ui.resolve(e)
    const parts: RenderNode[] = []
    let last = 0
    let n = 0
    for (const match of e.props.text.matchAll(FENCE)) {
      const before = e.props.text.slice(last, match.index)
      if (before.trim()) parts.push(<ui.Markdown text={before} />)
      const view = await diagramView($, { ui, requestId: e.requestId, columns: (e.viewport?.columns ?? 120) - 4 }, `${e.requestId}:${n++}`, { source: match[1] })
      if ('error' in view) {
        parts.push(<ui.Markdown text={match[0]} />)
        parts.push(<ui.Text dimColor>{view.error}</ui.Text>)
      } else parts.push(view.element)
      last = match.index + match[0].length
    }
    if (n === 0) return next(e)
    const after = e.props.text.slice(last)
    if (after.trim()) parts.push(<ui.Markdown text={after} />)
    return <ui.Box flexDirection="column">{parts}</ui.Box>
  })

  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    const file = proschiFile(e.props.tool, e.props.input)
    if (e.surface !== 'terminal' || !file || e.props.isRunning || e.props.isErrored) return next(e)
    const row = await next(e)
    const ui = $.ui.resolve(e)
    const source = await readWithImports($, file).catch(() => undefined)
    if (!source) return row
    const view = await diagramView($, { ui, requestId: e.requestId, columns: (e.viewport?.columns ?? 120) - 6 }, `${e.requestId}:0`, source, file)
    return (
      <ui.Box flexDirection="column">
        {row}
        <ui.Box paddingLeft={2}>{'error' in view ? <ui.Text dimColor>{view.error}</ui.Text> : view.element}</ui.Box>
      </ui.Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    if (e.surface !== 'terminal') {
      const { Text } = $.ui.resolve(e)
      return <Text>The Proschi pane draws in a terminal.</Text>
    }
    const ui = $.ui.resolve(e)
    // The file `/proschi view` (or Focus under a Write or Edit) shows, else the block Focus opened from a reply.
    const file = await read($, paneFile)
    const focused = file ? NO_SOURCE : await read($, paneSource)
    if (!file && !focused.source) return <ui.Text dimColor>Run /proschi view &lt;file.proschi&gt;.</ui.Text>
    const source = file ? await readWithImports($, file).catch(() => undefined) : focused
    if (!source) return <ui.Text color="red">Cannot read {file}.</ui.Text>
    const columns = 'bodyColumns' in e.props && typeof e.props.bodyColumns === 'number' ? e.props.bodyColumns : (e.viewport?.columns ?? 120) - 4
    const view = await diagramView($, { ui, requestId: PANE, columns }, PANE_VIEW, source)
    if ('error' in view) return <ui.Text color="red">{view.error}</ui.Text>
    const isFocused = 'isFocused' in e.props && e.props.isFocused === true
    return (
      <ui.Box flexDirection="column">
        {view.element}
        <ui.Text dimColor wrap="truncate-end">
          {isFocused ? PANE_KEYS : 'ctrl+x tab focuses the pane for its keys'}
        </ui.Text>
        {isFocused && view.systems && <ui.Text dimColor wrap="truncate-end">{SYSTEM_KEYS}</ui.Text>}
      </ui.Box>
    )
  })
}

/** The `.proschi` file a Write or Edit call wrote. */
function proschiFile(tool: string, input: unknown): string | undefined {
  if (tool !== 'Write' && tool !== 'Edit') return undefined
  const path = (input as { file_path?: unknown } | undefined)?.file_path
  return typeof path === 'string' && path.endsWith('.proschi') ? path : undefined
}

const USAGE = 'Usage: /proschi view [--expand <system>[,<system>…]] [--focus <system>] <file.proschi>'

const basename = (path: string) => path.split('/').pop() ?? path
const dirname = (path: string) => path.slice(0, Math.max(0, path.lastIndexOf('/')))

/** The project root imports are confined to: the folder of the nearest proschi.json, else the git root, else the file's folder (tooling/src/imports.ts). */
async function projectRoot($: EngineInterface, dir: string): Promise<string> {
  for (let current = dir; ; current = dirname(current)) {
    if ((await $.fs.exists(`${current}/proschi.json`)) || (await $.fs.exists(`${current}/.git`))) return current || '/'
    if (!current || current === '/') return dir
  }
}

/** Why an import was not read, by its key: a remote one not synced, as `proschi check` says it. */
const importReasons = new Map<string, string>()

/** A file with the files it imports, keyed relative to it as the editor resolves them (tooling/src/share.ts). */
async function readWithImports($: EngineInterface, file: string): Promise<Source> {
  const name = basename(file)
  const dir = dirname(file)
  const root = await projectRoot($, dir)
  const doc: Source = { source: await $.fs.read(file), path: name, imports: {} }
  const lock: { read?: Promise<Lock | undefined> } = {}
  for (let round = 0; round < 8; round++) {
    const missing = missingImports(doc).filter(key => key !== name && !(key in doc.imports!))
    if (missing.length === 0) break
    for (const key of missing) {
      importReasons.delete(key)
      if (isRemoteSpec(key)) {
        doc.imports![key] = await readRemote($, root, key, (lock.read ??= readLock($, root))).catch((error: unknown) => {
          importReasons.set(key, error instanceof Error ? error.message : String(error))
          return ''
        })
        continue
      }
      // Paths outside the project are never read; they draw as missing.
      const path = importFilePath(dir, root, key)
      doc.imports![key] = path && (await $.fs.exists(path)) ? await $.fs.read(path) : ''
    }
  }
  return doc
}

async function readLock($: EngineInterface, root: string): Promise<Lock | undefined> {
  const file = `${root}/${LOCK_FILE}`
  return (await $.fs.exists(file)) ? parseLock(await $.fs.read(file)) : undefined
}

/**
 * A remote import as every command but sync reads it (tooling/src/imports.ts):
 * from the bytes proschi.lock pins in .proschi/cache, their sha256 checked;
 * never the network.
 */
async function readRemote($: EngineInterface, root: string, spec: string, locked: Promise<Lock | undefined>): Promise<string> {
  const lock = await locked
  if (!lock) throw remoteError.noLock(spec)
  const hash = lockedHash(lock, spec)
  if (!hash) throw remoteError.notLocked(spec)
  const file = `${root}/${CACHE_DIR}/${hash}`
  if (!(await $.fs.exists(file))) throw remoteError.notCached(spec)
  const { base64 } = (await $.fs.read(file, { as: 'bytes' })) as { base64: string }
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
  if ([...digest].map(b => b.toString(16).padStart(2, '0')).join('') !== hash) throw remoteError.altered(spec)
  return new TextDecoder().decode(bytes)
}

/** Redraws the pane when its file changes. */
function watch($: EngineInterface, file: string): void {
  stop(PANE)
  let seen = 0
  timers.set(
    PANE,
    $.clock.every(1000, async () => {
      if ((await read($, paneFile)) !== file) return
      const stat = await $.fs.stat(file).catch(() => undefined)
      const mtime = stat && 'mtimeMs' in stat ? Number(stat.mtimeMs) : 0
      if (seen && mtime !== seen) $.ui.invalidate('ui.render')
      seen = mtime
    }),
  )
}

/** Lays a document out in Node (hooks/layout.cjs); redraws once it is done. */
function requestLayout($: EngineInterface, key: string, source: Source): void {
  if (pending.has(key)) return
  pending.add(key)
  void $.process
    .run(['node', `${$.plugin.root}/hooks/layout.cjs`], { stdin: JSON.stringify(source), timeoutMs: 30_000 })
    .then(
      ({ exitCode, stdout, stderr }) => {
        layouts.set(key, exitCode === 0 ? (JSON.parse(stdout) as Layout) : { error: stderr.trim() || `layout exited with ${exitCode}` })
      },
      (error: unknown) => {
        layouts.set(key, { error: `Proschi lays diagrams out with Node.js 18 or newer, which did not start: ${String(error)}` })
      },
    )
    .finally(() => {
      pending.delete(key)
      $.ui.invalidate('ui.render')
    })
}

/** One scenario of a use case, as the player plays it. */
interface Pick {
  value: string
  useCase: DiagramUseCase
  scenario: DiagramScenario
}

const pickOf = (useCase: DiagramUseCase, scenario: DiagramScenario): Pick => ({ value: `${useCase.id}:${scenario.id}`, useCase, scenario })

/** A drawn diagram, as its handlers and its animation need it. */
interface View {
  d: Draw
  viewId: string
  rasterKey: string
  /** The keyed Box around the Raster: what a press scrolls the pane to, the Raster itself being no scroll target. */
  anchorKey: string
  scene: Scene
  /** System badges and the one the system keys act on, for the frames the animation paints. */
  systems: Document['systems']
  selected?: string
  /** The width of the bars under the diagram: the diagram's, at least as wide as their controls want where the terminal has room. */
  width: number
  overlay: Document['overlay']
  /** Drawn in the pane, whose Buttons take hotkeys and whose body scrolls under the plugin. */
  inPane: boolean
  /** The document and the key it is cached under, and the columns it is drawn in: what a played scenario's sequence diagram is built from. */
  doc: Document
  docKey: string
  columns: number
}

/** A stored player in the current shape: an older version stored `beat` instead of `step` and `mode`. */
function normal(p: Partial<Player> | undefined): Player {
  return {
    pick: p?.pick ?? '',
    step: typeof p?.step === 'number' ? p.step : 0,
    isPlaying: p?.isPlaying === true && p.mode === 'play',
    mode: p?.mode === 'play' ? 'play' : 'diagram',
    explorer: p?.explorer === true,
    expanded: Array.isArray(p?.expanded) ? p.expanded.filter((id): id is string => typeof id === 'string') : [],
    ...(typeof p?.focus === 'string' ? { focus: p.focus } : {}),
    ...(typeof p?.selected === 'string' ? { selected: p.selected } : {}),
    ...(p?.view === 'architecture' ? { view: 'architecture' as const } : {}),
  }
}

/** The canvas's tokens (design/tokens.css): the pink of playback, the ink on it, the yellow of the primary control. */
const PINK = '#ff5da2'
const INK = '#111111'
const YELLOW = '#ffd23f'

/** Play and Pause as wide as each other, so swapping them moves nothing on the controls row. */
const PAUSE = '❚❚ Pause'
const PLAY = ' ▶ Play '

/** What the bars under a diagram want, so they lay out on one row each. */
const BARS_WIDTH = 80

/** The drawing of one document: the diagram with its use case picker or player and its links, or why it cannot be drawn. `file` is where the source was read from, if anywhere. */
async function diagramView($: EngineInterface, d: Draw, viewId: string, written: Source, file?: string): Promise<{ element: RenderElement; systems: boolean } | { error: string }> {
  const { ui } = d
  // The systems the player opened or focused into are part of what is laid out.
  const player = normal(await read($, memberOf(players, { requestId: viewId })))
  const shown: SystemsView = { ...(player.expanded.length ? { expanded: player.expanded } : {}), ...(player.focus !== undefined ? { focus: player.focus } : {}) }
  const source: Source = shown.expanded || shown.focus !== undefined ? { ...written, view: shown } : written
  const key = keyOf(source)
  let doc = documents.get(key)
  if (!doc) {
    doc = loadDocument(source)
    documents.set(key, doc)
  }
  const where = file ?? 'The diagram'
  if (doc.errors.length > 0) {
    const [first] = doc.errors
    return { error: `${where} has errors (line ${first.line}: ${first.message})${file ? `: run \`npx proschi check ${file}\`` : ''}.` }
  }
  if (doc.diagram.nodes.length === 0) return { error: `${where} has no components to draw.` }

  const layout = layouts.get(key)
  if (!layout) {
    requestLayout($, key, source)
    return { element: <ui.Text dimColor>Laying out {doc.diagram.title ?? 'the diagram'}…</ui.Text>, systems: false }
  }
  if ('error' in layout) return { error: `Proschi could not lay ${file ?? 'this diagram'} out: ${layout.error}` }

  const columns = Math.max(40, Math.min(512, d.columns))
  const sceneKey = `${key}@${columns}`
  let scene = scenes.get(sceneKey)
  if (!scene) {
    scene = buildScene(doc.diagram, layout, columns)
    scenes.set(sceneKey, scene)
  }

  const picks = doc.diagram.useCases.flatMap(u => u.scenarios.map(s => pickOf(u, s)))
  const pick = picks.find(p => p.value === player.pick) ?? picks[0]
  const playing = player.mode === 'play' ? pick : undefined
  const steps = playing?.scenario.steps ?? []
  const step = Math.max(0, Math.min(player.step, steps.length - 1))
  const width = Math.min(Math.max(40, d.columns), Math.max(scene.columns, BARS_WIDTH))
  const systems = selectable(scene, player.focus)
  const selected = systems.find(s => s.path === player.selected) ?? systems[0]
  const view: View = { d, viewId, rasterKey: `d-${viewId}`, anchorKey: `at-${viewId}`, scene, width, overlay: doc.overlay, systems: doc.systems, ...(selected ? { selected: selected.id } : {}), inPane: d.requestId === PANE, doc, docKey: key, columns }
  if (playing && player.isPlaying && !timers.has(viewId)) animate($, view, steps)

  // While a step animates, its frames are blitted in place; a drawing starts it from the beginning.
  const progress = timers.has(viewId) ? 0 : 100
  const { grid, rasterKey } = frameOf(view, player, step, progress)
  const link = doc.link(playing ? { useCase: playing.useCase.id, ...(playing.useCase.scenarios.length > 1 ? { scenario: playing.scenario.id } : {}), step } : undefined)
  const lost = lostImports(written, keyOf(written))
  const hasSystems = systems.length > 0 || player.focus !== undefined
  // Wide enough for the long labels, else the short ones.
  const roomy = view.width >= 79

  return { element: (
    <ui.Box flexDirection="column">
      {playing
        ? playerHeader($, view, playing, player)
        : doc.diagram.title && (
            <ui.Box flexDirection="column">
              <ui.Text bold>{doc.diagram.title}</ui.Text>
              {doc.diagram.summary && <ui.Text dimColor>{doc.diagram.summary}</ui.Text>}
            </ui.Box>
          )}
      <ui.Box key={view.anchorKey} flexDirection="column">
        {grid.columns > d.columns && (
          <ui.Text dimColor wrap="truncate-end">
            ↔ {grid.columns} columns wide, wider than the {d.columns} here: {view.inPane ? 'widen the window' : 'use ⛶ Focus or a wider window'} to see it whole.
          </ui.Text>
        )}
        {lost.some(name => !importReasons.has(name)) && (
          <ui.Text dimColor wrap="truncate-end">
            ⚠ Not found, so drawn as plain boxes: {lost.filter(name => !importReasons.has(name)).join(', ')}
          </ui.Text>
        )}
        {lost.filter(name => importReasons.has(name)).map(name => (
          <ui.Text key={`lost-${name}`} dimColor>
            ⚠ {importReasons.get(name)}
          </ui.Text>
        ))}
        {doc.notes.map(note => (
          <ui.Text color="yellow">
            ⚠ {note.text}
            {note.hint && <ui.Text dimColor> → {note.hint}</ui.Text>}
          </ui.Text>
        ))}
        <ui.Raster key={rasterKey} columns={grid.columns} rows={grid.rows} cells={grid.toBase64()} />
      </ui.Box>
      {hasSystems && !playing && systemBar($, view, doc, systems, selected, player)}
      {playing ? stepPanel($, view, playing, step, player) : pick && useCaseBar($, view, doc, pick, player)}
      <ui.Box flexDirection="row" gap={1} borderStyle="round" borderColor="gray" paddingX={1} width={view.width}>
        <ui.Button key={`src-${viewId}`} label={roomy ? '⧉ Copy source' : '⧉ Source'} onPress={press => void copy($, press.surface, source.source, 'the Proschi source')} />
        <ui.Button key={`lnk-${viewId}`} label={roomy ? '⧉ Copy share link' : '⧉ Link'} onPress={press => void copy($, press.surface, link, 'the share link')} />
        <ui.Button key={`open-${viewId}`} label={roomy ? '↗ Open in Proschi' : '↗ Open'} variant="primary" onPress={press => void openLink($, press.surface, link)} />
        {!view.inPane && <ui.Button key={`focus-${viewId}`} label="⛶ Focus" onPress={() => focus($, view, file ? basename(file) : (doc.diagram.title ?? 'diagram'), file ? { file } : { source })} />}
      </ui.Box>
    </ui.Box>
  ), systems: hasSystems }
}

/** The scenario a player plays, if it plays one. */
function playedPick(doc: Document, player: Player): Pick | undefined {
  if (player.mode !== 'play') return undefined
  const picks = doc.diagram.useCases.flatMap(u => u.scenarios.map(s => pickOf(u, s)))
  return picks.find(p => p.value === player.pick) ?? picks[0]
}

/**
 * One frame of a drawing and the Raster it goes in: the diagram, with the
 * scenario played over it; or, while a scenario plays in the sequence view
 * (the default), its sequence diagram with the step lit, in a Raster of its
 * own so a blit never lands in one of the other size.
 */
function frameOf(view: View, player: Player, step: number, progress: number, tick = 0): { grid: Grid; rasterKey: string } {
  const pick = playedPick(view.doc, player)
  const steps = pick?.scenario.steps ?? []
  const at = Math.max(0, Math.min(step, steps.length - 1))
  if (pick && player.view !== 'architecture') {
    const key = `${view.docKey}#${pick.value}@${view.columns}`
    let sequence = sequences.get(key)
    if (!sequence) {
      sequence = buildSequenceScene(view.doc.diagram, pick.useCase, pick.scenario, view.columns)
      sequences.set(key, sequence)
    }
    return { grid: paintSequence(sequence, { icons, ...(steps.length > 0 ? { play: { index: at, progress } } : {}) }), rasterKey: `q-${view.viewId}` }
  }
  const grid = paint(view.scene, { overlay: view.overlay, icons, systems: view.systems, ...(view.selected ? { selected: view.selected } : {}), ...(steps.length > 0 ? { play: playAt(view.scene, steps, at, progress, tick) } : {}) })
  return { grid, rasterKey: view.rasterKey }
}

/** A system the keys can act on: a collapsed box or an expanded frame, by its id in the scene and its path from the root document. */
interface Selectable {
  id: string
  path: string
  name: string
  expanded: boolean
}

function selectable(scene: Scene, focus: string | undefined): Selectable[] {
  return [...scene.nodes.values()]
    .map(n => n.node)
    .filter(n => n.kind === 'system' || (n.kind === 'group' && n.system === n.id))
    .map(n => ({ id: n.id, path: focus !== undefined ? `${focus}.${n.id}` : n.id, name: n.name, expanded: n.kind === 'group' }))
}

/**
 * The systems row: which system the keys act on, and opening it in place,
 * focusing into it, or back out to the diagram around it
 * (docs/design/team-systems-and-imports.md D6).
 */
function systemBar($: EngineInterface, view: View, doc: Document, systems: Selectable[], selected: Selectable | undefined, player: Player): RenderElement {
  const { ui } = view.d
  const design = selected !== undefined && !!systemAt(doc.root, selected.path)?.diagram
  const next = () => {
    const at = systems.findIndex(s => s.path === selected?.path)
    const to = systems[(at + 1) % systems.length]
    if (to) void setPlayer($, view, p => ({ ...p, selected: to.path }))
  }
  const toggle = () => {
    if (!selected || !design) return
    const open = player.expanded.includes(selected.path) || selected.expanded
    void setPlayer($, view, p => ({
      ...p,
      // Closing a system closes the ones inside it too.
      expanded: open ? p.expanded.filter(id => id !== selected.path && !id.startsWith(`${selected.path}.`)) : [...p.expanded, selected.path],
      selected: selected.path,
    }))
  }
  const enter = () => {
    if (!selected || !design) return
    void setPlayer($, view, p => ({ ...p, focus: selected.path, selected: undefined, pick: '', mode: 'diagram', isPlaying: false }))
  }
  const leave = () => {
    const focus = player.focus
    if (focus === undefined) return
    const up = focus.includes('.') ? focus.slice(0, focus.lastIndexOf('.')) : undefined
    void setPlayer($, view, p => {
      const { focus: _focus, ...rest } = p
      void _focus
      return { ...rest, ...(up !== undefined ? { focus: up } : {}), selected: focus, pick: '', mode: 'diagram', isPlaying: false }
    })
  }
  const open = selected !== undefined && (selected.expanded || player.expanded.includes(selected.path))
  return (
    <ui.Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1} width={view.width}>
      {player.focus !== undefined && (
        <ui.Text dimColor wrap="truncate-end">
          Inside {player.focus.split('.').join(' › ')} · {doc.diagram.title ?? 'its design'}
        </ui.Text>
      )}
      <ui.Box flexDirection="row" gap={1} alignItems="center" flexWrap="wrap">
        <ui.Text bold>System</ui.Text>
        <ui.Text color={PINK} wrap="truncate-end">
          {selected ? `${selected.name} (${selected.path})` : 'none here'}
        </ui.Text>
        {systems.length > 1 && <ui.Button key={`sys-next-${view.viewId}`} label="⇥ Next" {...hotkey(view, 's')} onPress={next} />}
        {selected && design && <ui.Button key={`sys-open-${view.viewId}`} label={open ? '⊟ Collapse' : '⊞ Expand'} {...hotkey(view, 'o')} onPress={toggle} />}
        {selected && design && <ui.Button key={`sys-focus-${view.viewId}`} label="⤢ Focus in" {...hotkey(view, 'f')} onPress={enter} />}
        {player.focus !== undefined && <ui.Button key={`sys-back-${view.viewId}`} label="↑ Back out" {...hotkey(view, 'u')} onPress={leave} />}
      </ui.Box>
    </ui.Box>
  )
}

/** The imports a document names that were not found, which it draws as plain boxes: none were read for a block in a reply, and a file's were read as empty. */
const lostByKey = new Map<string, string[]>()
function lostImports(source: Source, key: string): string[] {
  let names = lostByKey.get(key)
  if (!names) {
    const empty = Object.entries(source.imports ?? {}).filter(([, text]) => text === '').map(([name]) => name)
    names = [...new Set([...missingImports(source), ...empty])]
    lostByKey.set(key, names)
  }
  return names
}

/** The explorer toggle's labels, long and short, each pair as wide as each other so a toggle leaves no cell behind; no glyph whose width terminals disagree on (☰ is wide in Unicode 16, narrow before). */
const EXPLORE = { long: ['≡ Explore use cases', '≡ Hide explorer'], short: ['≡ Explore', '≡ Hide'] }
/** The player's view toggle, naming the view it switches to: the architecture from the sequence diagram, and back. */
const VIEWS = ['◫ Architecture', '⇅ Sequence']
const toggle = (labels: string[], open: boolean) => labels[open ? 1 : 0].padEnd(Math.max(...labels.map(l => l.length)))

/** `text` cut to `room` cells with an ellipsis. */
const cut = (text: string, room: number) => (text.length <= room ? text : `${text.slice(0, Math.max(0, room - 1))}…`)

/**
 * Picking a use case, as the editor's header does, and the explorer listing
 * every scenario by endpoint. On one row where it fits; else the picker on a
 * row of its own, its options cut to fit, and the buttons under it.
 */
function useCaseBar($: EngineInterface, view: View, doc: Document, pick: Pick, player: Player): RenderElement {
  const { ui } = view.d
  const groups = groupByEndpoint(doc.diagram.useCases)
  const count = (u: DiagramUseCase) => `${u.scenarios.length} scenario${u.scenarios.length === 1 ? '' : 's'}`
  const labels = groups.flatMap(g => g.useCases.map(u => ({ value: u.id, label: `${g.label ? `${g.label} › ` : ''}${u.name} · ${count(u)}` })))
  // Inside the frame and its padding: "Use case", the picker's value and its ▾, then [ ▶ Play ] and the explorer toggle.
  const inner = view.width - 4
  const longToggle = toggle(EXPLORE.long, false).length + 4
  const picker = 9 + Math.max(...labels.map(o => o.label.length)) + 2
  const oneRow = picker + 1 + 10 + 1 + longToggle <= inner
  const explore = toggle(10 + 1 + longToggle <= inner ? EXPLORE.long : EXPLORE.short, player.explorer)
  const options = oneRow ? labels : labels.map(o => ({ ...o, label: cut(o.label, inner - 9 - 2) }))
  const select = (
    <ui.Box flexDirection="row" gap={1} alignItems="center">
      <ui.Text bold color={PINK}>
        Use case
      </ui.Text>
      <ui.Select
        key={`uc-${view.viewId}`}
        value={pick.useCase.id}
        options={options}
        onSelect={id => {
          const u = doc.diagram.useCases.find(c => c.id === id)
          if (u?.scenarios[0]) void setPlayer($, view, p => ({ ...p, pick: pickOf(u, u.scenarios[0]).value }))
        }}
      />
    </ui.Box>
  )
  const buttons = (
    <ui.Box flexDirection="row" gap={1} alignItems="center">
      <ui.Button key={`play-${view.viewId}`} label="▶ Play" variant="primary" {...hotkey(view, 'p')} onPress={() => start($, view, pick)} />
      <ui.Button key={`explore-${view.viewId}`} label={explore} {...hotkey(view, 'x')} onPress={() => void setPlayer($, view, p => ({ ...p, explorer: !p.explorer }))} />
    </ui.Box>
  )
  return (
    <ui.Box flexDirection="column" borderStyle="round" borderColor={PINK} paddingX={1} width={view.width}>
      <ui.Box flexDirection={oneRow ? 'row' : 'column'} gap={oneRow ? 1 : 0}>
        {select}
        {buttons}
      </ui.Box>
      {player.explorer &&
        groups.map(g => (
          <ui.Box flexDirection="column" marginTop={1}>
            {g.label && (
              <ui.Text bold color="cyan">
                {g.label}
              </ui.Text>
            )}
            {g.useCases.map(u => (
              <ui.Box flexDirection="row" gap={1} flexWrap="wrap" paddingLeft={g.label ? 2 : 0}>
                <ui.Text bold={u.id === pick.useCase.id}>{u.name}</ui.Text>
                {u.scenarios.map(s => (
                  <ui.Button key={`x-${view.viewId}-${u.id}-${s.id}`} onPress={() => start($, view, pickOf(u, s))}>
                    {scenarioLabel(ui, u, s)}
                  </ui.Button>
                ))}
              </ui.Box>
            ))}
          </ui.Box>
        ))}
    </ui.Box>
  )
}

/** A scenario as the editor's scenario tabs name it: ✓ or ✗, the branch, and the status an error ends with; as a tab, the current one marked ▸ and bold. */
function scenarioLabel(ui: Ui, u: DiagramUseCase, s: DiagramScenario, current?: boolean): RenderElement {
  const error = s.outcome === 'error'
  const status = error ? s.steps.find(isErrorStep)?.statusCode : undefined
  const name = u.scenarios.length > 1 ? s.name : 'Play'
  return (
    <ui.Text color={error ? 'red' : 'green'} bold={current === true}>
      {current === undefined ? '' : current ? '▸ ' : '  '}
      {error ? '✗' : '✓'} {name}
      {status ? ` · ${status}` : ''}
    </ui.Text>
  )
}

/** The player's header: back to the diagram, the use case, and a tab per scenario. */
function playerHeader($: EngineInterface, view: View, pick: Pick, player: Player): RenderElement {
  const { ui } = view.d
  const { useCase } = pick
  return (
    <ui.Box flexDirection="column" borderStyle="round" borderColor={PINK} paddingX={1} width={view.width}>
      <ui.Box flexDirection="row" gap={1} alignItems="center">
        <ui.Button key={`back-${view.viewId}`} label="← Diagram" {...hotkey(view, 'd')} onPress={() => void setPlayer($, view, p => ({ ...p, mode: 'diagram', isPlaying: false }))} />
        <ui.Text bold wrap="truncate-end">
          {useCase.name}
        </ui.Text>
        <ui.Text dimColor wrap="truncate-end">
          · Playback mode · read only
        </ui.Text>
        <ui.Button
          key={`view-${view.viewId}`}
          label={toggle(VIEWS, player.view === 'architecture')}
          {...hotkey(view, 'v')}
          onPress={() => {
            reveal($, view)
            void setPlayer($, view, p => ({ ...p, view: p.view === 'architecture' ? undefined : 'architecture' }), player.isPlaying ? pick.scenario.steps : undefined)
          }}
        />
      </ui.Box>
      {useCase.scenarios.length > 1 && (
        <ui.Box flexDirection="row" gap={1} flexWrap="wrap">
          {useCase.scenarios.map(s => {
            const current = s.id === pick.scenario.id
            return (
              <ui.Button key={`sc-${view.viewId}-${s.id}`} variant={current ? 'primary' : undefined} dimColor={!current} onPress={() => start($, view, pickOf(useCase, s), player.isPlaying)}>
                {scenarioLabel(ui, useCase, s, current)}
              </ui.Button>
            )
          })}
        </ui.Box>
      )}
    </ui.Box>
  )
}

const FORMAT: Record<FlowStep['requestFormat'], string> = { JSON: 'JSON', XML: 'XML', FREE_TEXT: 'Text' }
const LANGUAGE: Record<FlowStep['requestFormat'], string | undefined> = { JSON: 'json', XML: 'xml', FREE_TEXT: undefined }

/** A badge as the editor draws one: a coloured chip. */
const chip = (ui: Ui, text: string, background: string) => (
  <ui.Text backgroundColor={background} color={INK} bold>
    {` ${text} `}
  </ui.Text>
)

/** Lines of a request or response body the player shows; the rest is counted. */
const BODY_LINES = 8

/** Rows of a step panel: each element one terminal row, except a Code, which takes a row per line of its source. */
interface Rows {
  nodes: RenderNode[]
  height: number
}

/** A body, at most BODY_LINES lines of it, each cut at the panel's edge. */
function bodyRows(ui: Ui, label: RenderElement, text: string, format: FlowStep['requestFormat']): Rows {
  const lines = text.replace(/\n+$/, '').split('\n')
  const shown = lines.slice(0, BODY_LINES)
  const more = lines.length - shown.length
  const language = LANGUAGE[format]
  return {
    nodes: [
      label,
      <ui.Code source={shown.join('\n')} wrap="truncate-end" {...(language ? { language } : {})} />,
      ...(more > 0 ? [<ui.Text dimColor>… {more} more line{more === 1 ? '' : 's'}</ui.Text>] : []),
    ],
    height: 1 + shown.length + (more > 0 ? 1 : 0),
  }
}

/** The step at `at` (and its parallel siblings) with what it sends and gets back, one row per line, cut at the panel's edge. */
function stepRows(ui: Ui, view: View, steps: FlowStep[], at: number): Rows {
  const name = (id: string) => view.scene.nodes.get(id)?.node.name ?? id
  const current = currentStepsOf(steps, at)
  const nodes: RenderNode[] = []
  let height = 0
  const row = (node: RenderNode) => {
    nodes.push(node)
    height++
  }
  const add = (rows: Rows) => {
    nodes.push(...rows.nodes)
    height += rows.height
  }
  if (current.length > 1) {
    row(
      <ui.Text bold color="blue" wrap="truncate-end">
        ⚡ Parallel Execution ({current.length} steps running simultaneously)
      </ui.Text>,
    )
  }
  if (steps.length === 0) row(<ui.Text dimColor>This scenario has no steps.</ui.Text>)
  current.forEach((s, i) => {
    const error = isErrorStep(s)
    const call = `${s.httpMethod} ${s.endpoint}`.trim()
    if (i > 0) row(<ui.Text> </ui.Text>)
    row(
      <ui.Text wrap="truncate-end">
        {chip(ui, String(steps.indexOf(s) + 1), error ? '#ff3b30' : PINK)} <ui.Text bold>{s.stepName}</ui.Text>
        {s.failed && <ui.Text> {chip(ui, 'Failed', '#fca5a5')}</ui.Text>}
        {!s.failed && (s.statusCode ?? 0) >= 400 && <ui.Text> {chip(ui, String(s.statusCode), '#fca5a5')}</ui.Text>}
        {s.executionType === 'SYNC_REQUEST_RESPONSE' && <ui.Text> {chip(ui, 'Sync', '#86efac')}</ui.Text>}
        {s.executionType === 'ASYNC_FIRE_AND_FORGET' && <ui.Text> {chip(ui, 'Fire & Forget', '#fdba74')}</ui.Text>}
        {s.executionType === 'ASYNC_REQUEST_RESPONSE' && <ui.Text> {chip(ui, 'Async', '#d8b4fe')}</ui.Text>}
      </ui.Text>,
    )
    row(
      <ui.Text dimColor wrap="truncate-end">
        {name(s.fromServiceId)} → {name(s.toServiceId)}
        {call && call !== s.stepName ? `   ${call}` : ''}
      </ui.Text>,
    )
    if (s.description) row(<ui.Text wrap="truncate-end">{s.description.replace(/\s*\n\s*/g, ' ')}</ui.Text>)
    if (s.requestBody) add(bodyRows(ui, <ui.Text dimColor>Request ({FORMAT[s.requestFormat]})</ui.Text>, s.requestBody, s.requestFormat))
    if (s.responseBody && s.executionType !== 'ASYNC_FIRE_AND_FORGET') {
      const label = (
        <ui.Text color={error ? 'red' : undefined} dimColor={!error}>
          Response ({FORMAT[s.responseFormat]}){s.statusCode !== undefined ? ` - ${s.statusCode}` : ''}
        </ui.Text>
      )
      add(bodyRows(ui, label, s.responseBody, s.responseFormat))
    }
    if (!s.responseBody && !s.failed && (s.statusCode ?? 0) >= 400) row(<ui.Text color="red">Answered with {s.statusCode}</ui.Text>)
    if (s.failed) {
      row(
        <ui.Text color="red" wrap="truncate-end">
          No response: the call failed (timeout, connection refused or similar).
        </ui.Text>,
      )
    }
  })
  return { nodes, height }
}

/** The current step (and its parallel siblings) with what it sends and gets back, then the controls, as the editor's player lays them out; as tall as the scenario's tallest step, so stepping moves nothing. */
function stepPanel($: EngineInterface, view: View, pick: Pick, step: number, player: Player): RenderElement {
  const { ui } = view.d
  const { scenario } = pick
  const steps = scenario.steps
  const total = steps.length
  const go = (to: number, isPlaying = false) => {
    reveal($, view)
    void setPlayer($, view, p => ({ ...p, step: Math.max(0, Math.min(total - 1, to)), isPlaying }), steps)
  }
  const rows = stepRows(ui, view, steps, step)
  const tallest = steps.reduce((most, _, i) => Math.max(most, stepRows(ui, view, steps, i).height), rows.height)
  const counter = `Step ${String(Math.min(step + 1, total)).padStart(String(total).length)} of ${total}`
  // What else the controls row holds, as the terminal draws it (a Button is `[ label ]`, Pause the wider label), so the bar takes the rest; short of room, Exit's label shortens and then the bar goes, so the row never wraps.
  const room = view.width - 4 - (5 + 5 + 12 + 5 + 5 + counter.length + 7)
  const exit = room - 19 >= 10 ? '✕ Exit playback' : '✕ Exit'
  const left = room - (exit.length + 4)
  const bar = left >= 6 ? Math.min(60, left) : 0
  const filled = total === 0 ? 0 : Math.round((bar * (step + 1)) / total)

  return (
    <ui.Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1} width={view.width}>
      {scenario.condition && (
        <ui.Text wrap="truncate-end">
          <ui.Text bold>When:</ui.Text> {scenario.condition}
        </ui.Text>
      )}
      <ui.Box key={`rows-${view.viewId}`} flexDirection="column">
        {rows.nodes}
        {Array.from({ length: tallest - rows.height }, () => (
          <ui.Text> </ui.Text>
        ))}
      </ui.Box>
      <ui.Box flexDirection="row" gap={1} alignItems="center" marginTop={1} flexWrap="wrap">
        <ui.Button key={`reset-${view.viewId}`} label="⇤" {...hotkey(view, 'r')} onPress={() => go(0)} />
        <ui.Button key={`prev-${view.viewId}`} label="‹" {...hotkey(view, 'b')} onPress={() => go(step - 1)} />
        <ui.Button
          key={`play-${view.viewId}`}
          label={player.isPlaying ? PAUSE : PLAY}
          variant="primary"
          {...hotkey(view, 'p')}
          onPress={() => (player.isPlaying ? void setPlayer($, view, p => ({ ...p, isPlaying: false })) : go(step >= total - 1 ? 0 : step, true))}
        />
        <ui.Button key={`next-${view.viewId}`} label="›" {...hotkey(view, 'n')} onPress={() => go(step + 1)} />
        <ui.Button key={`end-${view.viewId}`} label="⇥" {...hotkey(view, 'e')} onPress={() => go(total - 1)} />
        <ui.Text>{counter}</ui.Text>
        {bar > 0 && (
          <ui.Text>
            <ui.Text color={YELLOW}>{'━'.repeat(filled)}</ui.Text>
            <ui.Text dimColor>{'━'.repeat(bar - filled)}</ui.Text>
          </ui.Text>
        )}
        <ui.Button key={`exit-${view.viewId}`} label={exit} dimColor onPress={() => void setPlayer($, view, p => ({ ...p, mode: 'diagram', isPlaying: false }))} />
      </ui.Box>
    </ui.Box>
  )
}

/** A Button's hotkey, in the pane alone: the transcript's drawings share no keyboard. */
const hotkey = (view: View, key: string) => (view.inPane ? { hotkey: key } : {})

/** Plays a scenario from its first step: the diagram brought into view first, while the press is still the person's. */
function start($: EngineInterface, view: View, pick: Pick, isPlaying = true): void {
  reveal($, view)
  void setPlayer($, view, p => ({ ...p, pick: pick.value, step: 0, isPlaying, mode: 'play' }), pick.scenario.steps)
}

/**
 * Brings the drawing to the top of its window, the step panel under it. A
 * transcript row moves only while the plugin answers the person's own input,
 * so a press handler calls this first, before anything it awaits: the scroll
 * is issued in the press itself. In the pane it targets the keyed Box around
 * the Raster; in the transcript, where the engine finds no element of a
 * plugin's by key (neither the Raster nor a Box), the row the drawing is in.
 */
function reveal($: EngineInterface, view: View): void {
  void scroll($, view.inPane ? { to: { key: view.anchorKey }, in: PANE, block: 'start' } : { to: { requestId: view.d.requestId }, block: 'start' })
}

/** Scrolls, a failure answered as a refusal (and noted in the debug log): a drawing that cannot move still plays. */
async function scroll($: EngineInterface, args: UiScrollArgs): Promise<{ deny?: string }> {
  const moved = await $.ui.scroll(args).catch((error: unknown) => ({ deny: String(error) }))
  if (moved.deny) $.ui.log(`proschi: scroll to ${JSON.stringify(args.to)} refused: ${moved.deny}`, { to: 'debug' })
  return moved
}

/**
 * Opens the drawing in the pane as a dialog: it takes the keys and Esc closes
 * it (no `holdToasts`: the copy buttons toast). The pane opens first, in the
 * press itself, so it counts as the person's and is placed at any width; what
 * it shows follows. A file keeps its watch; a block from a reply is stored
 * whole. The pane's player starts where this one stands, and this one pauses.
 */
function focus($: EngineInterface, view: View, title: string, what: { file: string } | { source: Source }): void {
  const opened = $.ui.open({ id: PANE, title: `Proschi · ${title}`, focus: true, closeOnEscape: true })
  void (async () => {
    const player = normal(await read($, memberOf(players, { requestId: view.viewId })))
    if (player.isPlaying) await setPlayer($, view, p => ({ ...p, isPlaying: false }))
    stop(PANE_VIEW)
    await update($, memberOf(players, { requestId: PANE_VIEW }), () => player)
    if ('file' in what) {
      await update($, paneFile, () => what.file)
      watch($, what.file)
    } else {
      const { source, path, imports } = what.source
      stop(PANE)
      await update($, paneFile, () => '')
      await update($, paneSource, () => ({ source, ...(path ? { path } : {}), ...(imports ? { imports } : {}) }))
    }
    const placed = await opened
    if (!placed.isPlaced) $.ui.toast(`The Proschi pane is open but not shown: ${placed.reason}`)
  })()
}

/** Changes the player; with `steps`, the step it lands on animates (on and on while it plays). */
async function setPlayer($: EngineInterface, view: View, fn: (p: Player) => Player, steps?: FlowStep[]): Promise<void> {
  stop(view.viewId)
  // Started before the redraw, so the redraw draws the step's first frame rather than its last.
  if (steps && steps.length > 0) animate($, view, steps)
  await update($, memberOf(players, { requestId: view.viewId }), p => fn(normal(p)))
}

function stop(viewId: string): void {
  timers.get(viewId)?.cancel()
  timers.delete(viewId)
}

/** Sends the current step's packet along its edge frame by frame; while playing, on to the next step every STEP_MS until the last. */
function animate($: EngineInterface, view: View, steps: FlowStep[]): void {
  stop(view.viewId)
  let started = -1
  let tick = 0
  const timer = $.clock.every(FRAME, async () => {
    const player = normal(await read($, memberOf(players, { requestId: view.viewId })))
    if (player.mode !== 'play') return stop(view.viewId)
    const step = Math.max(0, Math.min(player.step, steps.length - 1))
    const now = await $.clock.now()
    if (started < 0) started = now
    const elapsed = now - started
    const { grid, rasterKey } = frameOf(view, player, step, Math.min(100, (elapsed / TRAVEL_MS) * 100), tick++)
    await $.ui.blit({ requestId: view.d.requestId, key: rasterKey, cells: grid.toBase64() })
    if (!player.isPlaying) {
      if (elapsed >= TRAVEL_MS) stop(view.viewId)
      return
    }
    if (elapsed < STEP_MS) return
    started = -1
    const last = step >= steps.length - 1
    if (last) stop(view.viewId)
    await update($, memberOf(players, { requestId: view.viewId }), p => ({ ...normal(p), step: last ? step : step + 1, isPlaying: !last }))
    // The pane's body is the plugin's to scroll: keep the diagram, where the step plays, in view (no move while it shows).
    if (view.inPane) await scroll($, { to: { key: view.anchorKey }, in: PANE, block: 'nearest' })
  })
  timers.set(view.viewId, timer)
}

/** Copies to the clipboard of the surface pressed on, and says whether it took. */
async function copy($: EngineInterface, surface: RenderSurface, text: string, what: string): Promise<void> {
  const copied = await $.ui.copy({ text, surface })
  $.ui.toast(copied.isCopied ? `Copied ${what} to the clipboard` : `Could not copy ${what}: ${copied.reason === 'no-clipboard' ? 'no clipboard tool answered' : copied.reason}`)
}

/** Opens the editor in the browser; where nothing opens it, copies the link instead. */
async function openLink($: EngineInterface, surface: RenderSurface, link: string): Promise<void> {
  for (const opener of ['open', 'xdg-open']) {
    const opened = await $.process.run([opener, link], { timeoutMs: 10_000 }).then(
      r => r.exitCode === 0,
      () => false,
    )
    if (opened) {
      $.ui.toast('Opened the diagram in Proschi')
      return
    }
  }
  await copy($, surface, link, 'the Proschi link (no browser opened)')
}
