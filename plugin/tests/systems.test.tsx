import { expect, mock, test } from 'claude-code/testing'

import { DRONE, DRONE_LAYOUTS } from './systems'

const pane = {
  plugin: 'proschi',
  component: 'Pane',
  requestId: 'proschi-view',
  surface: 'terminal',
  props: { title: 'Proschi', isFocused: true, bodyColumns: 120, placement: 'dock', scroll: { offset: 0, bodyRows: 80 }, view: {} },
} as const

const ROOT = '/proj'
const FILE = `${ROOT}/org-busy.proschi`

type On = Parameters<Parameters<typeof test>[1]>[1]

/** The project on disk and Node laying it out, as the engine would answer them; what each layout was asked for is kept in `asked`. */
function project(on: On, asked: unknown[], opens: string[] = []) {
  mock.clock(on)
  const path = (p: string) => (p.startsWith(`${ROOT}/`) ? p.slice(ROOT.length + 1) : '')
  on('fs.exists', (_, e) => ({ value: e.path === `${ROOT}/proschi.json` || path(e.path) in DRONE }))
  on('fs.read', (_, e) => (path(e.path) in DRONE ? { value: DRONE[path(e.path)] } : { error: { name: 'Error', message: `ENOENT: ${e.path}` } }))
  on('fs.stat', () => ({ value: { mtimeMs: 1 } }))
  on('process.run', (_, e) => {
    const view = (JSON.parse(String((e as { init?: { stdin?: unknown } }).init?.stdin)) as { view?: { expanded?: string[]; focus?: string } }).view
    asked.push(view)
    const layout = view?.focus ? DRONE_LAYOUTS.focused : view?.expanded ? DRONE_LAYOUTS.expanded : DRONE_LAYOUTS.collapsed
    return { value: { exitCode: 0, stdout: layout, stderr: '' } }
  })
  on('ui.invalidate', () => ({ value: undefined }))
  on('ui.open', (_, e) => {
    opens.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('ui.blit', () => ({ value: {} }))
  on('ui.scroll', () => ({ value: {} }))
  on('command.register', () => ({ value: { command: 'proschi' } }))
}

/** The pane drawn once its layout is in: the first draw asks for it. */
async function drawn($: Parameters<Parameters<typeof test>[1]>[0]) {
  await (await $.ui.mount(pane)).unmount()
  return $.ui.mount(pane)
}

const hotkeyOf = async (ui: { find(q: { key: string }): Promise<unknown> }, key: string) => ((await ui.find({ key })) as { props: { hotkey?: string } } | undefined)?.props.hotkey
const labelOf = async (ui: { find(q: { key: string }): Promise<unknown> }, key: string) => ((await ui.find({ key })) as { props: { label?: string } } | undefined)?.props.label

test('the pane draws team systems with their warnings, and keys open, focus into and back out of one', async ($, on) => {
  const asked: unknown[] = []
  project(on, asked)
  expect((await $.command.run({ command: 'proschi', args: `view ${FILE}` })).text).toBe(`Showing ${FILE} in the Proschi pane.`)

  let ui = await drawn($)
  expect(await ui.find({ type: 'Raster', key: 'd-proschi-view:0' })).toBeDefined()
  // The sim's word on Orders, and the hint of its failing check.
  expect(await ui.find({ type: 'Text', text: /'orders' cannot take what it is sent: you send 5\.2k rps into "Place order"/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /ask the Orders team to add capacity/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /s next system · o open\/close · f focus in · u back out/ })).toBeDefined()
  for (const [key, hotkey] of [['sys-next', 's'], ['sys-open', 'o'], ['sys-focus', 'f']] as const) expect(await hotkeyOf(ui, `${key}-proschi-view:0`)).toBe(hotkey)
  expect(await ui.find({ key: 'sys-back-proschi-view:0' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /^Frontend \(frontend\)$/ })).toBeDefined()

  // Next picks Orders; Expand opens it in place.
  await ui.press({ key: 'sys-next-proschi-view:0' })
  expect(await ui.find({ type: 'Text', text: /^Order Processing \(orders\)$/ })).toBeDefined()
  await ui.press({ key: 'sys-open-proschi-view:0' })
  await ui.unmount()
  ui = await drawn($)
  expect(asked).toContainEqual({ expanded: ['orders'] })
  expect(await labelOf(ui, 'sys-open-proschi-view:0')).toBe('⊟ Collapse')
  expect(await ui.find({ type: 'Text', text: /^Order Processing \(orders\)$/ })).toBeDefined()

  // Focus in: Orders' own design, and a way back out.
  await ui.press({ key: 'sys-focus-proschi-view:0' })
  await ui.unmount()
  ui = await drawn($)
  expect(asked).toContainEqual({ expanded: ['orders'], focus: 'orders' })
  expect(await ui.find({ type: 'Text', text: /^Inside orders · Orders$/ })).toBeDefined()
  expect(await hotkeyOf(ui, 'sys-back-proschi-view:0')).toBe('u')
  // What is said about Orders still shows inside it.
  expect(await ui.find({ type: 'Text', text: /'orders' cannot take what it is sent/ })).toBeDefined()

  // Back out lands on Orders, still open; Collapse closes it.
  await ui.press({ key: 'sys-back-proschi-view:0' })
  await ui.unmount()
  ui = await drawn($)
  expect(await ui.find({ key: 'sys-back-proschi-view:0' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /^Order Processing \(orders\)$/ })).toBeDefined()
  await ui.press({ key: 'sys-open-proschi-view:0' })
  await ui.unmount()
  ui = await drawn($)
  expect(await labelOf(ui, 'sys-open-proschi-view:0')).toBe('⊞ Expand')
  await ui.unmount()
})

test('/proschi view takes --expand and --focus, and names the systems for an id that is not one', async ($, on) => {
  const asked: unknown[] = []
  project(on, asked)
  expect((await $.command.run({ command: 'proschi', args: `view --expand order ${FILE}` })).text).toBe(
    "No system 'order' to expand; the systems are frontend, orders, warehouse, feed.",
  )
  expect((await $.command.run({ command: 'proschi', args: `view ${FILE} --focus` })).text).toBe('Missing system id after --focus')
  expect((await $.command.run({ command: 'proschi', args: `view --focus orders ${FILE}` })).text).toBe(`Showing ${FILE} in the Proschi pane.`)
  const ui = await drawn($)
  expect(asked).toContainEqual({ focus: 'orders' })
  expect(await ui.find({ type: 'Text', text: /^Inside orders · Orders$/ })).toBeDefined()
  await ui.unmount()
})

test('/proschi view --inline draws the file in a row at the transcript\'s end, not in the pane', async ($, on) => {
  const asked: unknown[] = []
  const places: string[] = []
  const opens: string[] = []
  project(on, asked, opens)
  on('ui.place', (_, e) => {
    places.push(e.id)
    return { value: { isPlaced: true, requestId: `row-${e.id}` } }
  })
  expect((await $.command.run({ command: 'proschi', args: `view --inline ${FILE}` })).text).toBe(`Showing ${FILE} in the transcript.`)
  expect(opens).toEqual([])
  expect(places).toHaveLength(1)
  const id = places[0]!
  const row = { plugin: 'proschi', component: 'Placed', requestId: `row-${id}`, surface: 'terminal', props: { id, plugin: 'proschi' } } as const
  await (await $.ui.mount(row)).unmount()
  const ui = await $.ui.mount(row)
  expect(await ui.find({ type: 'Raster', key: `d-${id}:0` })).toBeDefined()
  expect(await ui.find({ key: `focus-${id}:0` })).toBeDefined()
  await ui.unmount()
})
