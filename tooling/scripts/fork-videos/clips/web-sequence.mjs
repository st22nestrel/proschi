// The web app: use case playback switches between the architecture and a
// sequence diagram (steps animate in both), with the shared zoom controls.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchBrowser } from '../lib/browser.mjs';
import { FRONTEND, freePort, frontendRequire, sleep, startProcess } from '../lib/env.mjs';

export const title = 'Web app: sequence view in use case playback';
export const needs = ['google-chrome'];

export async function record({ screen, rec, diagram, args }) {
  let server;
  let base = args.webUrl;
  if (!base) {
    const port = await freePort();
    server = startProcess(join(FRONTEND, 'node_modules/.bin/vite'), ['--port', String(port), '--strictPort', '--host', '127.0.0.1'], { cwd: FRONTEND, ready: /Local:\s+(http:\/\/\S+)/ });
    base = (await server.ready)[1];
  }
  const lz = frontendRequire('lz-string');
  const { browser, page } = await launchBrowser(screen, { scale: 1 });
  try {
    const code = lz.compressToEncodedURIComponent(readFileSync(diagram, 'utf8'));
    await page.goto(new URL(`app/#code=${code}`, base).href);
    await page.waitForSelector('.react-flow__node', { timeout: 120_000 });
    await page.getByRole('button', { name: 'Dismiss tour hint' }).click({ timeout: 5_000 }).catch(() => {});
    await page.getByRole('button', { name: 'Hide sidebar' }).click().catch(() => {});
    await sleep(2500);

    const player = page.getByRole('group', { name: 'Playback view' });
    const scenario = (name) => page.getByRole('tab', { name: new RegExp(`^${name}`) }).first();
    /** The player's ▶ (playback opens paused on step 1). */
    const play = () => page.locator('button[title="Play"]').click();

    rec.start();
    rec.caption('proschi.app editor: the diagram from the PR, with use case sections');
    await sleep(3000);

    rec.caption('Play a use case: the steps animate on the architecture, as before');
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await sleep(1200);
    await play();
    await sleep(5000);

    rec.caption('New: the Architecture / Sequence switch in the player (V)');
    await player.getByRole('button', { name: 'Sequence' }).hover();
    await sleep(1200);
    await player.getByRole('button', { name: 'Sequence' }).click();
    await sleep(1500);
    rec.caption('The same steps play on a sequence diagram, with section and par frames');
    await page.locator('button[title="Reset to start"]').click();
    await sleep(500);
    await play();
    await sleep(12000);

    rec.caption('Shared zoom controls: zoom in, zoom out, fit (the % resets to 100%)');
    const zoom = page.getByRole('group', { name: 'Zoom' }).last();
    for (let i = 0; i < 2; i++) {
      await zoom.getByRole('button', { name: 'zoom in' }).click();
      await sleep(700);
    }
    await sleep(1500);
    await zoom.getByRole('button', { name: 'fit view' }).click();
    await sleep(2000);

    rec.caption('Click a step to jump to it');
    await page.getByRole('button', { name: /^Step 5:/ }).first().click();
    await sleep(3000);

    rec.caption('Other scenarios of the use case, still in the sequence view');
    for (const name of ['Payment declined', 'Database down']) {
      await scenario(name).click();
      await sleep(800);
      await play().catch(() => {});
      await sleep(6000);
    }

    rec.caption('A use case whose section wraps its alt branches: Get order');
    await page.getByRole('combobox', { name: 'Use case' }).click();
    await page.getByRole('option', { name: /Get order/ }).click();
    await sleep(800);
    await scenario('Cache miss').click();
    await sleep(800);
    await play().catch(() => {});
    await sleep(7000);

    rec.caption('Back to the architecture at the same step');
    await player.getByRole('button', { name: 'Architecture' }).click();
    await sleep(4000);

    rec.caption('The sequence view in the dark theme');
    await page.getByRole('button', { name: /^Theme:/ }).click();
    await sleep(800);
    await player.getByRole('button', { name: 'Sequence' }).click();
    await sleep(800);
    await page.locator('button[title="Reset to start"]').click();
    await play().catch(() => {});
    await sleep(7000);
    await rec.stop();
  } finally {
    await browser.close();
    server?.stop();
  }
}
