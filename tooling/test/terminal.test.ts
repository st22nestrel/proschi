import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { layoutGraph } from '../../frontend/src/dsl/autoLayout';
import { examples } from '../../frontend/src/dsl/examples';
import { importFilePath, keyOf, loadDocument, missingImports, parseSource, viewSource, type Source } from '../src/terminal/document';
import { viewError, viewOptions, type SystemsView } from '../src/terminal/systems';
import { DEFAULT, Grid, base64 } from '../src/terminal/grid';
import { COLOR, heatOf, paint } from '../src/terminal/paint';
import { currentStepsOf, playAt, stepPath } from '../src/terminal/playback';
import { buildScene, routePath, type Rect, type Scene } from '../src/terminal/scene';
import { buildSequenceScene, paintSequence } from '../src/terminal/sequence';

async function sceneOf(source: string, columns = 150) {
  const doc = loadDocument({ source });
  return { doc, scene: buildScene(doc.diagram, await layoutGraph(doc.diagram), columns) };
}

const example = (id: string) => examples.find((e) => e.id === id)!.source;

describe('terminal grid', () => {
  it('encodes cells as Raster takes them', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253]);
    expect(base64(bytes)).toBe(Buffer.from(bytes).toString('base64'));
    const grid = new Grid(1, 1);
    grid.set(0, 0, '█', 0xff8800);
    expect(grid.toBase64()).toBe(Buffer.from(new Uint32Array([0x2588, 0xff8800, DEFAULT]).buffer).toString('base64'));
  });

  it('joins crossing lines into one glyph', () => {
    const grid = new Grid(1, 1);
    grid.line(0, 0, 1 | 4, 0);
    grid.line(0, 0, 2 | 8, 0);
    expect(grid.toText()).toBe('┼');
  });
});

describe('terminal scene', () => {
  it('draws the browser layout as cards, edges and labels', async () => {
    const { doc, scene } = await sceneOf(example('ecommerce'));
    expect(paint(scene, { overlay: doc.overlay }).toText()).toMatchSnapshot();
  });

  it('draws groups, team lines and every example without throwing', async () => {
    for (const { source } of examples) {
      const { scene } = await sceneOf(source);
      const text = paint(scene).toText();
      for (const node of scene.diagram.nodes) if (node.kind === 'component') expect(text).toContain(node.name.slice(0, 10));
    }
  });

  it('fits a wide diagram into the columns it is given', async () => {
    const wide = await sceneOf(examples[1].source, 70);
    expect(wide.scene.columns).toBeLessThanOrEqual(72);
  });

  it('fits every example, layout fixture and problem solution into 100, 160 and 240 columns where it can', async () => {
    const docs: { id: string; src: Source }[] = examples.map((e) => ({ id: e.id, src: { source: e.source } }));
    const fixtures = new URL('../../frontend/src/dsl/layoutFixtures/', import.meta.url);
    for (const f of readdirSync(fixtures).filter((f) => f.endsWith('.proschi'))) docs.push({ id: f, src: { source: readFileSync(new URL(f, fixtures), 'utf8') } });
    const problems = new URL('../../frontend/src/practice/problems/', import.meta.url);
    for (const p of readdirSync(problems)) {
      const read = (f: string) => readFileSync(new URL(`${p}/${f}`, problems), 'utf8');
      docs.push({ id: `${p}/solution`, src: { source: read('solution.proschi'), path: 'solution.proschi', imports: { 'problem.proschi': read('given.proschi') } } });
    }
    // Too wide at any readable scale: drawn wider than asked, and the plugin says so.
    const tooWide = new Set(['order-fulfillment.proschi@100', 'order-fulfillment.proschi@160', 'order-fulfillment-hinted.proschi@100', 'order-fulfillment-hinted.proschi@160']);
    for (const { id, src } of docs) {
      const doc = loadDocument(src);
      expect(doc.errors, id).toEqual([]);
      const layout = await layoutGraph(doc.diagram);
      for (const columns of [100, 160, 240]) {
        const { columns: drawn } = buildScene(doc.diagram, layout, columns);
        if (tooWide.has(`${id}@${columns}`)) expect(drawn, `${id} at ${columns}`).toBeGreaterThan(columns);
        else expect(drawn, `${id} at ${columns}`).toBeLessThanOrEqual(columns);
      }
    }
  }, 60_000);

  it('puts the simulation on the cards of a document with traffic', async () => {
    const { doc, scene } = await sceneOf(example('hello'));
    expect(doc.overlay?.api.utilization).toBeGreaterThan(0);
    expect(doc.tests.length).toBeGreaterThan(0);
    const text = paint(scene, { overlay: doc.overlay }).toText();
    // The numbers and a bar take the team's row; the replicas sit on the card stacked behind.
    expect(text).toMatch(/\d+% ━*─+ ┃/);
    expect(text).toMatch(/╰─+ ×2 ─╯/);
  });

  it('fills a busy card with its heat, reddens one past capacity and greys one that is down', async () => {
    const { doc, scene } = await sceneOf(STRESSED);
    expect(doc.overlay?.db).toMatchObject({ saturated: true, size: 'L' });
    const overlay = { ...doc.overlay!, api: { ...doc.overlay!.api, down: true } };
    const grid = paint(scene, { overlay });
    const db = scene.nodes.get('db')!.rect;
    const api = scene.nodes.get('api')!.rect;
    expect(grid.bg[(db.y + 1) * grid.columns + db.x + 1]).toBe(COLOR.heatOver);
    expect(grid.fg[db.y * grid.columns + db.x]).toBe(COLOR.fail);
    expect(grid.toText()).toMatch(/L · \d+%/);
    expect(grid.glyph(api.x, api.y + 1)).toBe('┇');
    expect(grid.toText()).toContain('down');
    expect(heatOf({ utilization: 0.5 })).toBeUndefined();
    expect(heatOf({ utilization: 0.95 })).toBe(COLOR.heatHot);
    expect(heatOf({ utilization: 2, down: true })).toBeUndefined();
  });

  it('draws the legend as a panel, dashed and dotted lines apart, and group descriptions', async () => {
    const { scene } = await sceneOf(STRESSED);
    scene.nodes.get('back')!.node.description = 'Behind the gateway';
    const text = paint(scene).toText();
    expect(text).toMatch(/╭─ LEGEND ─+╮/);
    expect(text).toMatch(/│ ╌╌╌ Old +│/);
    expect(text).toMatch(/│ ┈┈┈ Maybe +│/);
    expect(text).toContain('Behind the gateway');
    // The dotted connection runs in dots, the dashed group frame in dashes.
    expect(text).toMatch(/[┊┈]/);
    expect(text).toMatch(/[╎╌]/);
  });
});

/** Every edge runs cell by cell from beside its source to the arrowhead beside its target, its joins agreeing with its neighbours, its label on it. */
function expectConnected(scene: Scene): void {
  const beside = (c: { x: number; y: number }, r: Rect) =>
    (c.x >= r.x && c.x < r.x + r.w && (c.y === r.y - 1 || c.y === r.y + r.h)) || (c.y >= r.y && c.y < r.y + r.h && (c.x === r.x - 1 || c.x === r.x + r.w));
  const dir = (a: { x: number; y: number }, b: { x: number; y: number }) => (b.x > a.x ? 2 : b.x < a.x ? 8 : b.y > a.y ? 4 : 1);
  for (const { edge, path, label } of scene.edges) {
    const { cells, dirs } = path;
    const from = scene.nodes.get(edge.source)!.rect;
    const to = scene.nodes.get(edge.target)!.rect;
    expect(beside(cells[0], from), `${edge.id} leaves ${edge.source}`).toBe(true);
    expect(beside(cells[cells.length - 1], to), `${edge.id} reaches ${edge.target}`).toBe(true);
    for (let i = 1; i < cells.length; i++) {
      expect(Math.abs(cells[i].x - cells[i - 1].x) + Math.abs(cells[i].y - cells[i - 1].y), `${edge.id} at ${i}`).toBe(1);
      expect(dirs[i] & dir(cells[i], cells[i - 1]), `${edge.id} joins back at ${i}`).toBeTruthy();
      if (i < cells.length - 1) expect(dirs[i] & dir(cells[i], cells[i + 1]), `${edge.id} joins on at ${i}`).toBeTruthy();
    }
    if (label && edge.label) {
      const half = Math.ceil(edge.label.length / 2);
      expect(cells.some((c) => c.y === label.y && Math.abs(c.x - label.x) <= half), `${edge.id}'s label`).toBe(true);
    }
  }
}

describe('terminal compaction', () => {
  it('squeezes the empty rows out of a tall diagram and keeps every edge joined', async () => {
    const { scene } = await sceneOf(RIDES);
    // 96 rows before the empty rows went.
    expect(scene.rows).toBeLessThanOrEqual(96 * 0.75);
    expectConnected(scene);
    for (const { source } of examples) expectConnected((await sceneOf(source)).scene);
  });

  it('keeps cards side by side apart and a cell of padding inside a group', async () => {
    const { scene } = await sceneOf(RIDES);
    const r = (id: string) => scene.nodes.get(id)!.rect;
    expect(r('db').x - (r('geo').x + r('geo').w)).toBeGreaterThanOrEqual(3);
    const trips = r('trips');
    for (const id of ['trip', 'match']) {
      expect(r(id).x).toBeGreaterThan(trips.x + 1);
      expect(r(id).y).toBeGreaterThan(trips.y + 1);
      // The card stacked behind a card with replicas stays inside the frame too.
      expect(r(id).y + r(id).h + 1).toBeLessThan(trips.y + trips.h - 1);
    }
  });

  it('draws cards with heavy borders and no shadow, lit pink while playing', async () => {
    const { doc, scene } = await sceneOf(RIDES);
    const grid = paint(scene, { overlay: doc.overlay });
    const gw = scene.nodes.get('gw')!.rect;
    expect(grid.glyph(gw.x, gw.y)).toBe('┏');
    expect(grid.glyph(gw.x + gw.w - 1, gw.y + gw.h - 1)).toBe('┛');
    expect(grid.glyph(gw.x, gw.y + 1)).toBe('┃');
    // No shadow: nothing right of or under a card without replicas but the lines.
    expect(grid.glyph(gw.x + gw.w, gw.y + 2)).toBe(' ');
    expect(grid.toText()).not.toMatch(/[▀▄▌▐█]/);
    // The legacy billing's dotted border, heavy.
    const billing = scene.nodes.get('billing')!.rect;
    expect(grid.glyph(billing.x + 1, billing.y)).toBe('┅');
    const steps = doc.diagram.useCases[0].scenarios[0].steps;
    const lit = paint(scene, { play: playAt(scene, steps, 0, 50) });
    expect(lit.glyph(gw.x, gw.y)).toBe('┏');
    expect(lit.fg[gw.y * lit.columns + gw.x]).toBe(COLOR.pink);
  });
});

const RIDES = `title "Ride Booking" "Riders request trips, drivers get matched in real time"
legend {
  core     "Owned by Trips team" green
  planned  "Planned flow"        blue dashed
  legacy   "Being replaced"      red dotted
}
rider   "Rider App"      [Mobile App]
gw      "API Gateway"    [API Gateway]
group trips "Trips" .core {
  trip  "Trip Service"   [REST API] @trips x3 critical
  match "Matching"       [REST API] @trips x2
}
geo     "Driver Locations" [Redis]
db      "Trips DB"       [PostgreSQL] x2
bus     "Trip Events"    [Kafka]
notify  "Notifications"  [REST API]
billing "Legacy Billing" [SOAP API] .legacy
rider -> gw : HTTPS
gw -> trip : book
trip -> match : find driver
match -> geo : nearby
trip -> db : SQL
trip -> bus : publish
bus -> notify : consume
trip -> billing .legacy : charge
notify -> rider .planned : push
usecase "Book a ride" {
  rider -> gw : POST /rides
  gw -> trip : POST /trips
  trip -> match : POST /match
  trip -x db : INSERT trip
  trip --> gw : 503
}
traffic {
  "Book a ride" 800 rps
}
capacity {
  geo size L
}
`;

const STRESSED = `web "Web" [Actor]
api "API" [REST API] .old
group back "Back end" {
  db "DB" [PostgreSQL] x2
}
q "Q" [Kafka]
web -> api
api -> db .maybe : write
api -> q
legend {
  old   "Old"   dashed
  maybe "Maybe" dotted
}
usecase "Write" {
  web -> api : POST /x
  api -> db : INSERT
  api ->> q : log
}
traffic {
  "Write" 50k rps
}
capacity {
  db size L
}
`;

describe('terminal playback', () => {
  it('plays one step per call, the packet out and back, as the editor does', async () => {
    const { doc, scene } = await sceneOf(examples[0].source);
    const steps = doc.diagram.useCases[0].scenarios[0].steps;
    const first = steps[0];

    const out = playAt(scene, steps, 0, 25);
    expect([...out.active].sort()).toEqual([first.fromServiceId, first.toServiceId].sort());
    expect(out.packets).toHaveLength(1);
    const path = stepPath(scene, first.fromServiceId, first.toServiceId)!;
    // A request-response call is half way out at 25% and back at the caller by 100%.
    expect(out.packets[0].at).toEqual(path.cells[Math.round(0.5 * (path.cells.length - 1))]);
    expect(playAt(scene, steps, 0, 100).packets).toHaveLength(0);
    expect(playAt(scene, steps, 0, 100).edges[0].flowing).toBe(true);

    const text = paint(scene, { play: out }).toText();
    expect(text).toContain('■');
    expect(text).toMatch(/[┃━]/);
  });

  it('fades what the scenario does not touch', async () => {
    const { doc, scene } = await sceneOf(example('ecommerce'));
    const steps = doc.diagram.useCases[0].scenarios[0].steps;
    const play = playAt(scene, steps, 0, 50);
    const off = doc.diagram.nodes.find((n) => n.kind === 'component' && !play.pathNodes.has(n.id));
    expect(off).toBeDefined();
    const grid = paint(scene, { play });
    const rect = scene.nodes.get(off!.id)!.rect;
    expect(grid.fg[rect.y * grid.columns + rect.x]).toBe(COLOR.fadedMore);
  });

  it('cuts a failed call off part way with a cross', async () => {
    const { doc, scene } = await sceneOf('a "A" [REST API]\nb "B" [REST API]\na -> b\nusecase "U" {\n  a -x b : GET /x\n}\n');
    const steps = doc.diagram.useCases[0].scenarios[0].steps;
    expect(playAt(scene, steps, 0, 80).packets[0]).toMatchObject({ cut: true, error: true });
    expect(paint(scene, { play: playAt(scene, steps, 0, 80) }).toText()).toContain('✗');
  });

  it('keeps the earlier steps of a parallel group current', () => {
    const step = (parallelGroup?: number) => ({ parallelGroup }) as never;
    expect(currentStepsOf([step(), step(1), step(1), step()], 2)).toHaveLength(2);
  });
});

describe('terminal document', () => {
  it('lists the imports it still needs, relative to the document', () => {
    expect(missingImports({ source: 'import "shared/infra.proschi"\n', path: 'app/main.proschi' })).toEqual(['app/shared/infra.proschi']);
  });

  it('reads imports only inside the project root, never remote ones', () => {
    expect(importFilePath('/repo/docs', '/repo', '../shared/base.proschi')).toBe('/repo/shared/base.proschi');
    expect(importFilePath('/repo/docs', '/repo', '../../etc/passwd')).toBeUndefined();
    expect(importFilePath('/repo/docs', '/repo', '../../repo-other/x.proschi')).toBeUndefined();
    expect(importFilePath('/repo/docs', '/repo', 'git:example.com/a/b//x.proschi@v1')).toBeUndefined();
    expect(missingImports({ source: 'import "/etc/passwd"\n', path: 'main.proschi' })).toEqual([]);
  });

  it('links to the editor, at a playback step when asked', () => {
    const doc = loadDocument({ source: examples[0].source });
    expect(doc.link()).toMatch(/^https:\/\/proschi\.app\/app\/#code=/);
    expect(doc.link({ useCase: 'x', step: 2 })).toContain('&step=2');
    expect(keyOf({ source: 'a' })).not.toBe(keyOf({ source: 'b' }));
  });
});

/** The drone startup of sim/systems.test.ts, small: an org of four team systems; at 5.2k rps Orders saturates and Warehouse and Feed run hot. */
function drone(file: 'org.proschi' | 'org-busy.proschi', view?: SystemsView): Source {
  const dir = new URL('./fixtures/drone/', import.meta.url);
  const teams = Object.fromEntries(readdirSync(new URL('teams/', dir)).map((f) => [`teams/${f}`, readFileSync(new URL(`teams/${f}`, dir), 'utf8')]));
  return { source: readFileSync(new URL(file, dir), 'utf8'), path: file, imports: teams, ...(view ? { view } : {}) };
}

async function droneText(file: 'org.proschi' | 'org-busy.proschi', view?: SystemsView, columns = 100) {
  const doc = loadDocument(drone(file, view));
  const scene = buildScene(doc.diagram, await layoutGraph(viewSource(drone(file, view)).diagram), columns);
  return { doc, scene, text: paint(scene, { overlay: doc.overlay, systems: doc.systems, icons: 'symbols' }).toText() };
}

describe('terminal systems', () => {
  it('draws each team as a double-bordered box with its team, promise and sent / headroom', async () => {
    const { doc, text } = await droneText('org.proschi');
    expect(doc.notes).toEqual([]);
    expect(doc.systems.orders).toMatchObject({ team: 'Orders', promise: 'p99 150 ms', sentRps: 100, status: 'ok' });
    expect(text).toContain('╔');
    expect(text).toContain('@Orders');
    expect(text).toMatchSnapshot();
  });

  it('flags a system sent more than it takes, in red, with the warning and the hint', async () => {
    const { doc, scene, text } = await droneText('org-busy.proschi');
    expect(doc.systems.orders.status).toBe('saturated');
    expect(doc.systems.warehouse.status).toBe('hot');
    expect(doc.systems.frontend.status).toBe('ok');
    expect(doc.notes[0].text).toMatch(/^'orders' cannot take what it is sent: you send 5\.2k rps into "Place order"/);
    expect(doc.notes.find((n) => n.hint)?.hint).toBe('Send it less, or ask the Orders team to add capacity for it (their bottleneck is db)');
    expect(text).toContain('✗ saturated');
    expect(text).toContain('5.2k / 4.7k rps');
    expect(text).toMatchSnapshot();
    const grid = paint(scene, { overlay: doc.overlay, systems: doc.systems });
    const { rect } = scene.nodes.get('orders')!;
    expect(grid.fg[rect.y * grid.columns + rect.x]).toBe(COLOR.fail);
    // Selected for the plugin's keys, its border is the accent.
    const picked = paint(scene, { overlay: doc.overlay, systems: doc.systems, selected: 'orders' });
    expect(picked.fg[rect.y * picked.columns + rect.x]).toBe(COLOR.pink);
  });

  it('opens an expanded system as a frame around its team design, under the load it is sent', async () => {
    const { doc, text } = await droneText('org-busy.proschi', { expanded: ['orders'] });
    expect(doc.diagram.nodes.find((n) => n.id === 'orders')?.kind).toBe('group');
    expect(doc.overlay?.['orders.db']).toMatchObject({ saturated: true });
    expect(text).toContain('ORDER PROCESSING ✗ saturated · @Orders');
    expect(text).toMatchSnapshot();
  });

  it('enters an expanded frame straight, without a jog under its title', async () => {
    for (const columns of [100, 160]) {
      const { scene, text } = await droneText('org-busy.proschi', { expanded: ['orders', 'feed'] }, columns);
      expect(text, `at ${columns}`).not.toMatch(/▼─|─▼|╰─+╮\n.*╔═ ORDER/);
      const { cells } = scene.edges.find((e) => e.edge.target === 'orders.gateway')!.path;
      expect(new Set(cells.map((c) => c.x)).size, `at ${columns}`).toBe(1);
    }
    // ELK's way in through a port on the frame: down, five cells over, through the title, and back.
    const path = routePath([{ x: 10, y: 4 }, { x: 10, y: 6 }, { x: 15, y: 6 }, { x: 15, y: 8 }, { x: 10, y: 8 }, { x: 10, y: 10 }], { x: 0, y: 0, w: 20, h: 4 }, { x: 0, y: 10, w: 20, h: 5 })!;
    expect(path.cells.every((c) => c.x === 10)).toBe(true);
  });

  it('drops the load, then the promise and the team, before cutting an expanded frame\'s name', async () => {
    const title = (text: string) => text.split('\n').find((l) => l.includes('╔═ '))!.trim();
    expect(title((await droneText('org-busy.proschi', { expanded: ['orders'] }, 160)).text)).toMatch(/^╔═ ORDER PROCESSING ✗ saturated · @Orders · p99 150 ms ═+╗$/);
    expect(title((await droneText('org-busy.proschi', { expanded: ['orders'] }, 60)).text)).toMatch(/^╔═ ORDER PROCESSING ✗ saturated · @Orders ═+╗$/);
    const { doc, scene } = await droneText('org-busy.proschi', { expanded: ['orders'] });
    scene.nodes.get('orders')!.rect.w = 26;
    const narrow = title(paint(scene, { overlay: doc.overlay, systems: doc.systems, icons: 'symbols' }).toText());
    expect(narrow.slice(0, 26)).toBe('╔═ ORDER P… ✗ saturated ═╗');
  });

  it('focuses into a system: its own design, with what is said about it', async () => {
    const { doc, text } = await droneText('org-busy.proschi', { focus: 'orders' });
    expect(doc.diagram.title).toBe('Orders');
    expect(doc.overlay?.db).toMatchObject({ saturated: true });
    expect(doc.notes.map((n) => n.system)).toEqual(['orders', 'orders']);
    expect(text).toMatchSnapshot();
  });

  it('fits the drone startup into 100 and 160 columns, collapsed, expanded and focused', async () => {
    for (const view of [undefined, { expanded: ['orders'] }, { focus: 'orders' }])
      for (const columns of [100, 160]) {
        const { scene } = await droneText('org-busy.proschi', view, columns);
        expect(scene.columns, `${JSON.stringify(view)} at ${columns}`).toBeLessThanOrEqual(columns);
      }
  });

  it('names the systems when asked to open one that is not there', () => {
    const { diagram } = parseSource(drone('org.proschi'));
    expect(viewError(diagram, { expanded: ['orders'] })).toBeUndefined();
    expect(viewError(diagram, { expanded: ['order'] })).toBe("No system 'order' to expand; the systems are frontend, orders, warehouse, feed.");
    expect(viewError(diagram, { focus: 'shopper' })).toMatch(/^No system 'shopper' to focus/);
    expect(viewOptions({ expanded: ['orders.wh'] }).expanded).toEqual(new Set(['orders', 'orders.wh']));
    expect(keyOf(drone('org.proschi', { expanded: ['orders'] }))).not.toBe(keyOf(drone('org.proschi')));
  });
});

describe('terminal sequence', () => {
  const SECTIONS = [
    'user "Shopper" [Actor]',
    'api "Orders API" [REST API]',
    'pay "Stripe" [External API]',
    'db "Orders DB" [PostgreSQL]',
    'queue "Events" [Kafka]',
    'user -> api : HTTPS',
    'api -> pay : HTTPS',
    'api -> db : SQL',
    'api -> queue : publish',
    'usecase "Place order" {',
    '  section "VALIDATE" {',
    '    user -> api : POST /orders',
    '    api -> api : Check stock',
    '  }',
    '  section "PAY" {',
    '    par {',
    '      api -> pay : Charge',
    '      pay --> api : 200',
    '      api -> db : Reserve',
    '      db --> api : ok',
    '    }',
    '  }',
    '  api ->> queue : OrderPlaced',
    '  api --> user : 201 Created',
    '}',
  ].join('\n');

  const sceneOfUseCase = (source: string, columns = 120) => {
    const doc = loadDocument({ source });
    const useCase = doc.diagram.useCases[0];
    return buildSequenceScene(doc.diagram, useCase, useCase.scenarios[0], columns);
  };

  it('draws participants, numbered requests, responses and a frame per section and par', () => {
    const scene = sceneOfUseCase(SECTIONS);
    const text = paintSequence(scene, { icons: 'none' }).toText();
    for (const name of ['Shopper', 'Orders API', 'Stripe', 'Orders DB', 'Events']) expect(text).toContain(name);
    for (const label of ['1 POST /orders', '2 Check stock', '3 Charge', '4 Reserve', '5 OrderPlaced', '201 Created']) expect(text).toContain(label);
    expect(text).toMatch(/╭─ VALIDATE ─+╮/);
    expect(text).toMatch(/╭─ PAY ─+╮/);
    expect(text).toMatch(/╭─ par ─+╮/);
    // The par's branches split by a divider, and the async message drawn with an open head.
    expect(text).toMatch(/├╌+┤/);
    expect(text).toContain('▷');
    // The response comes after the sections it is not written in.
    const rows = text.split('\n');
    expect(rows.findIndex((r) => r.includes('201 Created'))).toBeGreaterThan(rows.findIndex((r) => r.includes('5 OrderPlaced')));
    expect(text).toMatchSnapshot();
  });

  it('lights the current step and sends its packet along the arrow, and only that', () => {
    const scene = sceneOfUseCase(SECTIONS);
    const idle = paintSequence(scene, { icons: 'none' });
    const start = paintSequence(scene, { icons: 'none', play: { index: 0, progress: 10 } });
    const back = paintSequence(scene, { icons: 'none', play: { index: 0, progress: 80 } });
    const done = paintSequence(scene, { icons: 'none', play: { index: 0, progress: 100 } });
    expect(idle.toText()).not.toContain('■');
    expect(start.toText()).toContain('■');
    expect(back.toText()).toContain('■');
    expect(done.toText()).not.toContain('■');
    // Out on the request's row, back on the response's.
    const rowOf = (text: string) => text.split('\n').findIndex((r) => r.includes('■'));
    expect(rowOf(back.toText())).toBeGreaterThan(rowOf(start.toText()));
    expect(done.toText()).toMatch(/━+►/);
    expect(idle.toText()).not.toMatch(/━+►/);
    expect(done.toText()).toContain('┅');
    // A par plays as one step: both branches lit at once.
    const par = paintSequence(scene, { icons: 'none', play: { index: 3, progress: 100 } }).toText();
    expect(par.split('\n').filter((r) => /━+[►◄]/.test(r)).length).toBe(2);
  });

  it('cuts labels to fit the columns it is given', () => {
    const long = SECTIONS.replace('POST /orders', `POST /orders/${'x'.repeat(80)}`);
    const scene = sceneOfUseCase(long, 90);
    expect(scene.columns).toBeLessThanOrEqual(90);
    expect(paintSequence(scene).toText()).toContain('…');
  });

  it('draws every example use case without throwing', () => {
    for (const { source } of examples) {
      const doc = loadDocument({ source });
      for (const useCase of doc.diagram.useCases) {
        for (const scenario of useCase.scenarios) {
          const scene = buildSequenceScene(doc.diagram, useCase, scenario, 160);
          for (let i = 0; i < scenario.steps.length; i++) paintSequence(scene, { play: { index: i, progress: 50 } });
        }
      }
    }
  });
});
