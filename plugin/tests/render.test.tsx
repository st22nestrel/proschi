import { expect, mock, test } from 'claude-code/testing'

import { LAYOUT, SOURCE } from './fixture'

const reply = (text: string) =>
  ({
    plugin: 'proschi',
    component: 'AssistantMessage',
    requestId: 'm1',
    surface: 'terminal',
    props: { text, isFirstOfReply: true },
  }) as const

const FENCED = `Here is the design:\n\n\`\`\`proschi\n${SOURCE}\n\`\`\`\n\nPress Play.`

test('a proschi block in a reply draws as a diagram with its player', async ($, on) => {
  // Nothing sits beneath the plugin: these hooks stand for the engine and for Node running hooks/layout.cjs.
  on('process.run', () => ({ value: { exitCode: 0, stdout: LAYOUT, stderr: '' } }))
  on('ui.invalidate', () => ({ value: undefined }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })

  const ui = await $.ui.mount(reply(FENCED))
  // The first draw starts the layout; the next one has it.
  expect(await ui.find({ type: 'Text', text: /Laying out/ })).toBeDefined()
  await ui.unmount()

  const drawn = await $.ui.mount(reply(FENCED))
  expect(await drawn.find({ type: 'Raster' })).toBeDefined()
  expect(await drawn.find({ type: 'Markdown', text: /Here is the design/ })).toBeDefined()

  // The diagram first, with a picker; Play opens the player on the scenario's first step.
  expect(await drawn.find({ type: 'Select', key: 'uc-m1:0' })).toBeDefined()
  await drawn.press({ key: 'explore-m1:0' })
  expect(await drawn.find({ type: 'Text', text: /POST \/orders/ })).toBeDefined()
  await drawn.press({ key: 'play-m1:0' })
  expect(await drawn.find({ type: 'Text', text: /^Step 1 of \d+$/ })).toBeDefined()
  expect(await drawn.find({ type: 'Text', text: /Playback mode/ })).toBeDefined()
  expect(await drawn.find({ type: 'Text', text: /^Web App → Checkout API/ })).toBeDefined()
  await drawn.press({ key: 'play-m1:0' })
  await drawn.press({ key: 'next-m1:0' })
  expect(await drawn.find({ type: 'Text', text: /^Step 2 of \d+$/ })).toBeDefined()
  await drawn.press({ key: 'reset-m1:0' })
  expect(await drawn.find({ type: 'Text', text: /^Step 1 of \d+$/ })).toBeDefined()
  await drawn.press({ key: 'exit-m1:0' })
  expect(await drawn.find({ type: 'Text', text: /^Step \d+ of/ })).toBeUndefined()
  expect(await drawn.find({ type: 'Select', key: 'uc-m1:0' })).toBeDefined()
  await drawn.unmount()
})

test('a reply without a proschi block is left to the engine', async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  const ui = await $.ui.mount(reply('```mermaid\ngraph TD\n```'))
  expect((await ui.find({ type: 'Text' }))?.text).toBe('engine')
  await ui.unmount()
})

test('a block with errors stays as written', async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  const ui = await $.ui.mount(reply('```proschi\nusecase {\n```'))
  expect(await ui.find({ type: 'Raster' })).toBeUndefined()
  expect(await ui.find({ type: 'Markdown', text: /usecase/ })).toBeDefined()
  await ui.unmount()
})

test('Play moves the packet along its edge in place, then on to the next step', async ($, on) => {
  const clock = mock.clock(on)
  const blits: string[] = []
  on('process.run', () => ({ value: { exitCode: 0, stdout: LAYOUT, stderr: '' } }))
  on('ui.invalidate', () => ({ value: undefined }))
  on('ui.blit', (_, e) => {
    blits.push('cells' in e ? e.cells : '')
    return { value: {} }
  })
  await (await $.ui.mount(reply(FENCED))).unmount()
  const ui = await $.ui.mount(reply(FENCED))

  await ui.press({ key: 'play-m1:0' })
  expect(await ui.find({ type: 'Text', text: /^Step 1 of \d+$/ })).toBeDefined()
  // Out to the callee and part way back: the edge is only a few cells long, a frame per cell.
  await clock.advance(1000)
  expect(new Set(blits).size).toBeGreaterThan(2)
  await clock.advance(1100)
  expect(await ui.find({ type: 'Text', text: /^Step 2 of \d+$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^Checkout API → Cart Cache/ })).toBeDefined()

  await ui.press({ key: 'play-m1:0' })
  const paused = blits.length
  await clock.advance(1000)
  expect(blits.length).toBe(paused)
  await ui.unmount()
})

/** The terminal rows a step panel's body takes: a row per element, a Code's a row per line of its source. */
function height(box: { children: unknown[] } | undefined): number {
  return (box?.children ?? []).reduce<number>((n, child) => {
    const element = child as { type?: string; props?: { source?: string } }
    return n + (element.type === 'Code' ? String(element.props?.source).split('\n').length : 1)
  }, 0)
}

test('the player keeps one size from step to step, and no requirement is drawn', async ($, on) => {
  on('process.run', () => ({ value: { exitCode: 0, stdout: LAYOUT, stderr: '' } }))
  on('ui.invalidate', () => ({ value: undefined }))
  on('ui.blit', () => ({ value: {} }))
  await (await $.ui.mount(reply(FENCED))).unmount()
  const ui = await $.ui.mount(reply(FENCED))

  await ui.press({ key: 'play-m1:0' })
  await ui.press({ key: 'play-m1:0' })
  const total = Number((await ui.find({ type: 'Text', text: /^Step +1 of \d+$/ }))?.text.match(/of (\d+)/)?.[1])
  expect(total).toBeGreaterThan(2)
  const heights: number[] = []
  for (let step = 1; step <= total; step++) {
    expect(await ui.find({ type: 'Text', text: new RegExp(`^Step +${step} of ${total}$`) })).toBeDefined()
    heights.push(height(await ui.find({ key: 'rows-m1:0' })))
    await ui.press({ key: 'next-m1:0' })
  }
  expect(new Set(heights).size).toBe(1)
  expect(heights[0]).toBeGreaterThan(2)

  for (const text of [/requirements met/, /^✗/, /p99/, /availability/]) expect(await ui.find({ type: 'Text', text })).toBeUndefined()
  await ui.unmount()
})

/** The glyphs of a drawn Raster, decoded from its cells. */
function glyphs(raster: unknown): string {
  const cells = (raster as { props: { cells: string } }).props.cells
  const bytes = Uint8Array.from(atob(cells), c => c.charCodeAt(0))
  const words = new Uint32Array(bytes.buffer)
  let out = ''
  for (let i = 0; i < words.length; i += 3) out += String.fromCodePoint(words[i]!)
  return out
}

for (const [icons, postgres] of [['nerd-font', '\ue76e'], ['symbols', '◉']] as const) {
  test(`cards carry the tech icon (${icons})`, { options: { icons } }, async ($, on) => {
    on('process.run', () => ({ value: { exitCode: 0, stdout: LAYOUT, stderr: '' } }))
    on('ui.invalidate', () => ({ value: undefined }))
    await (await $.ui.mount(reply(FENCED))).unmount()
    const ui = await $.ui.mount(reply(FENCED))
    // The icon sits in the middle of its solid tile, left of the tech.
    expect(glyphs(await ui.find({ type: 'Raster' }))).toMatch(new RegExp(`${postgres} {2,6}PostgreSQL`))
    await ui.unmount()
  })
}

test('a playing scenario draws as its sequence diagram, and the toggle plays it over the architecture instead', async ($, on) => {
  const clock = mock.clock(on)
  const blits: { key: string; cells: string }[] = []
  on('process.run', () => ({ value: { exitCode: 0, stdout: LAYOUT, stderr: '' } }))
  on('ui.invalidate', () => ({ value: undefined }))
  on('ui.blit', (_, e) => {
    blits.push({ key: String((e as { key?: unknown }).key), cells: 'cells' in e ? e.cells : '' })
    return { value: {} }
  })
  await (await $.ui.mount(reply(FENCED))).unmount()
  const ui = await $.ui.mount(reply(FENCED))
  expect(await ui.find({ type: 'Raster', key: 'd-m1:0' })).toBeDefined()

  await ui.press({ key: 'play-m1:0' })
  const sequence = glyphs(await ui.find({ type: 'Raster', key: 'q-m1:0' }))
  // A box per participant, the numbered requests and the responses under them.
  for (const text of ['Web App', 'Checkout API', 'Cart Cache', '1 POST /orders', '2 GET cart', 'items', '201']) expect(sequence).toContain(text)
  expect(await ui.find({ type: 'Raster', key: 'd-m1:0' })).toBeUndefined()
  // The packet travels the sequence diagram's arrows, in its own Raster.
  await clock.advance(1000)
  expect(blits.length).toBeGreaterThan(2)
  expect(new Set(blits.map(b => b.key))).toEqual(new Set(['q-m1:0']))
  expect(new Set(blits.map(b => b.cells)).size).toBeGreaterThan(2)

  const label = async () => ((await ui.find({ key: 'view-m1:0' })) as unknown as { props: { label: string } }).props.label
  const toArchitecture = await label()
  expect(toArchitecture).toMatch(/Architecture/)
  await ui.press({ key: 'view-m1:0' })
  expect(await ui.find({ type: 'Raster', key: 'd-m1:0' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^Step \d+ of \d+$/ })).toBeDefined()
  const toSequence = await label()
  expect(toSequence).toMatch(/Sequence/)
  expect([...toSequence].length).toBe([...toArchitecture].length)
  await ui.press({ key: 'view-m1:0' })
  expect(await ui.find({ type: 'Raster', key: 'q-m1:0' })).toBeDefined()
  await ui.unmount()
})

test('Play and Pause are as wide as each other', async ($, on) => {
  on('process.run', () => ({ value: { exitCode: 0, stdout: LAYOUT, stderr: '' } }))
  on('ui.invalidate', () => ({ value: undefined }))
  on('ui.blit', () => ({ value: {} }))
  await (await $.ui.mount(reply(FENCED))).unmount()
  const ui = await $.ui.mount(reply(FENCED))
  await ui.press({ key: 'play-m1:0' })
  const pause = (await ui.find({ key: 'play-m1:0' })) as unknown as { props: { label: string } }
  await ui.press({ key: 'play-m1:0' })
  const play = (await ui.find({ key: 'play-m1:0' })) as unknown as { props: { label: string } }
  expect(pause.props.label).toMatch(/Pause/)
  expect(play.props.label).toMatch(/Play/)
  expect([...play.props.label].length).toBe([...pause.props.label].length)
  await ui.unmount()
})

const pane = (isFocused: boolean) =>
  ({
    plugin: 'proschi',
    component: 'Pane',
    requestId: 'proschi-view',
    surface: 'terminal',
    props: { title: 'Proschi', isFocused, bodyColumns: 100, placement: 'dock', scroll: { offset: 0, bodyRows: 60 }, view: {} },
  }) as const

const hotkeyOf = async (ui: { find(q: { key: string }): Promise<unknown> }, key: string) => ((await ui.find({ key })) as { props: { hotkey?: string } } | undefined)?.props.hotkey

test('Focus opens the block in a focused pane that Esc closes, with its player and keys', async ($, on) => {
  const opens: Record<string, unknown>[] = []
  const toasts: string[] = []
  // What the press does, in order: the engine places a pane opened in the press itself, before anything it awaits, and no later.
  const calls: string[] = []
  mock.clock(on)
  on('process.run', () => ({ value: { exitCode: 0, stdout: LAYOUT, stderr: '' } }))
  on('ui.invalidate', () => ({ value: undefined }))
  on('ui.blit', () => ({ value: {} }))
  on('ui.toast', (_, e) => {
    toasts.push(String((e as { text?: unknown }).text ?? ''))
    return { value: undefined }
  })
  on('state.set', ($, e, next) => {
    calls.push('state.set')
    return next(e)
  })
  on('ui.open', (_, e) => {
    opens.push({ ...e })
    const asked = !calls.includes('state.set')
    calls.push('ui.open')
    return { value: asked ? { isPlaced: true } : { isPlaced: false, reason: 'unasked below 110 columns' } }
  })
  await (await $.ui.mount(reply(FENCED))).unmount()
  const ui = await $.ui.mount(reply(FENCED))
  expect(await ui.find({ key: 'focus-m1:0' })).toBeDefined()
  await ui.press({ key: 'play-m1:0' })
  // The transcript's drawings take no hotkeys: the keyboard is the prompt's.
  expect(await hotkeyOf(ui, 'play-m1:0')).toBeUndefined()
  await ui.press({ key: 'play-m1:0' })
  await ui.press({ key: 'next-m1:0' })
  calls.length = 0
  await ui.press({ key: 'focus-m1:0' })
  await ui.unmount()

  expect(calls[0]).toBe('ui.open')
  expect(calls).toContain('state.set')
  expect(toasts.filter(t => /not shown/.test(t))).toEqual([])
  expect(opens).toHaveLength(1)
  expect(opens[0]).toMatchObject({ id: 'proschi-view', focus: true, closeOnEscape: true })
  expect(opens[0]!.holdToasts).toBeUndefined()

  // The pane draws the block (it has no file) where the inline player stood: its sequence diagram, as the scenario plays.
  const p = await $.ui.mount(pane(true))
  expect(await p.find({ type: 'Raster', key: 'q-proschi-view:0' })).toBeDefined()
  expect(await p.find({ type: 'Text', text: /^Step 2 of \d+$/ })).toBeDefined()
  expect(await p.find({ key: 'focus-proschi-view:0' })).toBeUndefined()
  for (const [key, hotkey] of [['play', 'p'], ['next', 'n'], ['prev', 'b'], ['reset', 'r'], ['end', 'e'], ['back', 'd'], ['view', 'v']] as const) {
    expect(await hotkeyOf(p, `${key}-proschi-view:0`)).toBe(hotkey)
  }
  expect(await hotkeyOf(p, 'exit-proschi-view:0')).toBeUndefined()
  expect(await p.find({ type: 'Text', text: /p play · n\/b step/ })).toBeDefined()

  await p.press({ key: 'back-proschi-view:0' })
  expect(await hotkeyOf(p, 'play-proschi-view:0')).toBe('p')
  expect(await hotkeyOf(p, 'explore-proschi-view:0')).toBe('x')
  await p.unmount()
})

test('↓ Inline moves the pane\'s drawing into the transcript where its player stood, and ⛶ Focus takes it back', async ($, on) => {
  const places: string[] = []
  const closes: string[] = []
  const opens: string[] = []
  mock.clock(on)
  on('process.run', () => ({ value: { exitCode: 0, stdout: LAYOUT, stderr: '' } }))
  on('ui.invalidate', () => ({ value: undefined }))
  on('ui.blit', () => ({ value: {} }))
  on('ui.scroll', () => ({ value: {} }))
  on('ui.open', (_, e) => {
    opens.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('ui.close', (_, e) => {
    closes.push(e.id)
    return { value: undefined }
  })
  on('ui.place', (_, e) => {
    places.push(e.id)
    return { value: { isPlaced: true, requestId: `row-${e.id}` } }
  })
  on('ui.log', () => ({ value: undefined }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  await (await $.ui.mount(reply(FENCED))).unmount()
  const ui = await $.ui.mount(reply(FENCED))
  await ui.press({ key: 'play-m1:0' })
  await ui.press({ key: 'play-m1:0' })
  await ui.press({ key: 'next-m1:0' })
  await ui.press({ key: 'focus-m1:0' })
  await ui.unmount()

  const p = await $.ui.mount(pane(true))
  expect(await hotkeyOf(p, 'inline-proschi-view:0')).toBe('i')
  await p.press({ key: 'inline-proschi-view:0' })
  await p.unmount()
  expect(places).toHaveLength(1)
  expect(places[0]).toMatch(/^inline-/)
  expect(closes).toEqual(['proschi-view'])

  const id = places[0]!
  const row = { plugin: 'proschi', component: 'Placed', requestId: `row-${id}`, surface: 'terminal', props: { id, plugin: 'proschi' } } as const
  const placed = await $.ui.mount(row)
  // The block, at the step the pane stood on, as its sequence diagram; no hotkeys in the transcript.
  expect(await placed.find({ type: 'Raster', key: `q-${id}:0` })).toBeDefined()
  expect(await placed.find({ type: 'Text', text: /^Step 2 of \d+$/ })).toBeDefined()
  expect(await hotkeyOf(placed, `play-${id}:0`)).toBeUndefined()
  expect(await placed.find({ key: `inline-${id}:0` })).toBeUndefined()
  await placed.press({ key: `focus-${id}:0` })
  expect(opens).toContain('proschi-view')
  await placed.unmount()

  // Back to the transcript with no prompt since: the row that stands takes the player again, and no second one is placed.
  const again = await $.ui.mount(pane(true))
  await again.press({ key: 'next-proschi-view:0' })
  await again.press({ key: 'inline-proschi-view:0' })
  await again.unmount()
  expect(places).toHaveLength(1)
  expect(closes).toEqual(['proschi-view', 'proschi-view'])
  const back = await $.ui.mount(row)
  expect(await back.find({ type: 'Text', text: /^Step 3 of \d+$/ })).toBeDefined()
  await back.unmount()

  // Another plugin's rows are left to it.
  const other = await $.ui.mount({ ...row, props: { id, plugin: 'other' } })
  expect((await other.find({ type: 'Text' }))?.text).toBe('engine')
  await other.unmount()
})

test('↓ Inline after Focus on a block of the last response closes the pane onto that block, but places a row once a prompt followed', async ($, on) => {
  const places: string[] = []
  const closes: string[] = []
  let messages = [
    { role: 'user', text: 'draw it', toolUses: [] },
    { role: 'assistant', text: FENCED, toolUses: [] },
  ]
  mock.clock(on)
  on('process.run', () => ({ value: { exitCode: 0, stdout: LAYOUT, stderr: '' } }))
  on('ui.invalidate', () => ({ value: undefined }))
  on('ui.blit', () => ({ value: {} }))
  on('ui.scroll', () => ({ value: {} }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.close', (_, e) => {
    closes.push(e.id)
    return { value: undefined }
  })
  on('ui.place', (_, e) => {
    places.push(e.id)
    return { value: { isPlaced: true, requestId: `row-${e.id}` } }
  })
  on('ui.log', () => ({ value: undefined }))
  on('session.messages', () => ({ value: messages }))
  await (await $.ui.mount(reply(FENCED))).unmount()
  let ui = await $.ui.mount(reply(FENCED))
  await ui.press({ key: 'play-m1:0' })
  await ui.press({ key: 'play-m1:0' })
  await ui.press({ key: 'focus-m1:0' })
  await ui.unmount()

  let p = await $.ui.mount(pane(true))
  await p.press({ key: 'next-proschi-view:0' })
  await p.press({ key: 'inline-proschi-view:0' })
  await p.unmount()
  expect(places).toEqual([])
  expect(closes).toEqual(['proschi-view'])
  ui = await $.ui.mount(reply(FENCED))
  expect(await ui.find({ type: 'Text', text: /^Step 2 of \d+$/ })).toBeDefined()

  // A prompt later the block belongs to an earlier response: Inline places it anew at the end.
  messages = [...messages, { role: 'user', text: 'thanks', toolUses: [] }, { role: 'assistant', text: 'You are welcome.', toolUses: [] }]
  await ui.press({ key: 'focus-m1:0' })
  await ui.unmount()
  p = await $.ui.mount(pane(true))
  await p.press({ key: 'inline-proschi-view:0' })
  await p.unmount()
  expect(places).toHaveLength(1)
})

test('Play and a step bring the diagram into view, in the transcript and in the pane', async ($, on) => {
  // The harness moves no window for a plugin's $.ui.scroll: each call is refused, and the refusal, naming its target, goes to the debug log.
  // (That the scroll is issued in the press itself, before the player changes, the e2e run checks in a live session.)
  const logs: string[] = []
  mock.clock(on)
  on('process.run', () => ({ value: { exitCode: 0, stdout: LAYOUT, stderr: '' } }))
  on('ui.invalidate', () => ({ value: undefined }))
  on('ui.blit', () => ({ value: {} }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.log', (_, e) => {
    logs.push(e.text)
    return { value: undefined }
  })
  const scrolledTo = () => logs.filter(line => line.startsWith('proschi: scroll to ')).map(line => line.slice('proschi: scroll to '.length).split(' refused')[0])
  await (await $.ui.mount(reply(FENCED))).unmount()
  const ui = await $.ui.mount(reply(FENCED))
  // The transcript row the drawing is in; the pane's keyed Box around the Raster.

  await ui.press({ key: 'play-m1:0' })
  expect(scrolledTo()).toEqual(['{"requestId":"m1"}'])
  // Playback goes on all the same.
  expect(await ui.find({ type: 'Text', text: /^Step 1 of \d+$/ })).toBeDefined()
  await ui.press({ key: 'play-m1:0' })
  logs.length = 0
  await ui.press({ key: 'next-m1:0' })
  expect(scrolledTo()).toEqual(['{"requestId":"m1"}'])
  await ui.press({ key: 'focus-m1:0' })
  await ui.unmount()

  const p = await $.ui.mount(pane(true))
  logs.length = 0
  await p.press({ key: 'reset-proschi-view:0' })
  expect(scrolledTo()).toEqual(['{"key":"at-proschi-view:0"}'])
  await p.unmount()
})

test('a layout that fails shows why under the block, and in the pane', async ($, on) => {
  on('process.run', () => ({ value: { exitCode: 1, stdout: '', stderr: 'Proschi lays diagrams out with Node.js 18 or newer' } }))
  on('ui.invalidate', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  await (await $.ui.mount(reply(FENCED))).unmount()
  const ui = await $.ui.mount(reply(FENCED))
  expect(await ui.find({ type: 'Markdown', text: /```proschi/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /could not lay this diagram out: Proschi lays diagrams out with Node\.js 18/ })).toBeDefined()
  await ui.unmount()
})

test('the use case bar keeps to its width: one row where it fits, else the picker above the buttons, and the explorer toggle keeps its width', async ($, on) => {
  on('process.run', () => ({ value: { exitCode: 0, stdout: LAYOUT, stderr: '' } }))
  on('ui.invalidate', () => ({ value: undefined }))
  const narrow = { ...reply(FENCED), viewport: { columns: 64, rows: 40 } } as const
  await (await $.ui.mount(narrow)).unmount()
  const ui = await $.ui.mount(narrow)
  const label = async () => ((await ui.find({ key: 'explore-m1:0' })) as unknown as { props: { label: string } }).props.label
  const closed = await label()
  await ui.press({ key: 'explore-m1:0' })
  const open = await label()
  expect(open).toMatch(/Hide/)
  expect([...open].length).toBe([...closed].length)
  // Short labels on the action bar where the long ones would wrap.
  expect(((await ui.find({ key: 'src-m1:0' })) as unknown as { props: { label: string } }).props.label).toBe('⧉ Source')
  await ui.unmount()
})
