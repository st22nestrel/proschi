// `proschi preview`: a local server for the preview page of every .proschi
// file in a folder, with a filterable start page, a file dropdown and
// previous/next, rendered on every request.
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchBrowser, glideTo, glide, typeSlowly } from '../lib/browser.mjs';
import { CLI, REPO, sleep, startProcess, freePort } from '../lib/env.mjs';

export const title = '`proschi preview`: a local viewer for every diagram in a folder';
export const needs = ['google-chrome'];

/** Neighbours for the demo folder, from the repo's own examples. */
const EXAMPLES = [
  ['action/test/checkout.proschi', 'examples/checkout.proschi'],
  ['action/test/url-shortener.proschi', 'examples/url-shortener.proschi'],
  ['frontend/src/dsl/layoutFixtures/microservices.proschi', 'examples/microservices.proschi'],
  ['frontend/src/dsl/layoutFixtures/order-fulfillment.proschi', 'examples/order-fulfillment.proschi'],
  ['docs/images/src/org.proschi', 'org/org.proschi'],
  ['docs/images/src/teams', 'org/teams'],
];

export async function record({ screen, rec, diagram, work }) {
  const root = join(work, 'diagrams');
  mkdirSync(join(root, 'examples'), { recursive: true });
  const file = join(root, 'e-commerce.proschi');
  const original = readFileSync(diagram, 'utf8');
  writeFileSync(file, original);
  for (const [from, to] of EXAMPLES) cpSync(join(REPO, from), join(root, to), { recursive: true });

  const port = await freePort();
  const server = startProcess(process.execPath, [CLI, 'preview', '--root', root, '--port', String(port)], { cwd: root, ready: /Proschi preview at (http:\/\/\S+?)\/? / });
  const base = `${(await server.ready)[1]}/`;
  const { browser, page } = await launchBrowser(screen);
  try {
    await page.goto(base);
    await sleep(800);
    rec.start();
    rec.caption('`proschi preview --root <dir>`: every .proschi file under the folder, by directory, with titles');
    await sleep(4000);

    rec.caption('One box filters the list (or opens a pasted path); Enter opens the first match');
    await page.click('#filter');
    await typeSlowly(page, 'commerce', 120);
    await sleep(1500);
    await page.keyboard.press('Enter');
    await page.waitForLoadState();
    rec.caption("The file's preview page: architecture, use case descriptions and a scenario picker");
    await sleep(3500);
    await glideTo(page, '#scenario', 1800, 80);
    await sleep(1200);
    for (const value of (await page.$$eval('#scenario option', (os) => os.map((o) => o.value))).slice(0, 3)) {
      await page.selectOption('#scenario', value);
      await sleep(2000);
    }

    rec.caption('A bar on every page: the file dropdown…');
    await glide(page, -5000, 1200);
    await sleep(600);
    const picked = await page.$$eval('#file option', (os) => os.find((o) => /microservices/.test(o.value))?.value);
    // Picking a file opens it (the Open button is only there without scripts).
    await Promise.all([page.waitForURL(/microservices/), page.selectOption('#file', picked)]);
    await sleep(3000);

    rec.caption('…and previous / next through the folder (‹ ›)');
    for (let i = 0; i < 2; i++) {
      await page.click('a#next');
      await page.waitForLoadState();
      await sleep(2500);
    }

    rec.caption('It renders on every request: edit the file, reload, and the change is there');
    await page.goto(base);
    await page.click('#filter');
    await typeSlowly(page, 'e-commerce', 60);
    await page.keyboard.press('Enter');
    await page.waitForLoadState();
    await sleep(2000);
    writeFileSync(file, original.replace(/^title\s+"([^"]*)"/m, 'title "$1 (edited)"').replace(/"Notification Worker"/, '"E-mail Worker"'));
    await sleep(1000);
    await page.reload();
    await sleep(4000);
    await rec.stop();
  } finally {
    writeFileSync(file, original);
    await browser.close();
    server.stop();
  }
}
