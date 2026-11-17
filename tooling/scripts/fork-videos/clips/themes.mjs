// Render themes: the same file through `proschi render --theme …`, as the
// preview-html page (architecture + scenario picker) and the HLD document.
import { mkdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { glide, glideTo, launchBrowser } from '../lib/browser.mjs';
import { proschi, sleep } from '../lib/env.mjs';

export const title = 'Render themes: sketch-light, sketch-dark and classic';
export const needs = ['google-chrome'];

const THEMES = [
  { name: 'sketch-light', note: "upstream's look, and still the default" },
  { name: 'sketch-dark', note: 'the same look on dark paper' },
  { name: 'classic', note: 'white cards, type-coloured icon tiles, blue arrows' },
];

export async function record({ screen, rec, diagram, work }) {
  const stem = basename(diagram, '.proschi');
  const pages = {};
  for (const { name } of THEMES) {
    const dir = join(work, name);
    mkdirSync(dir, { recursive: true });
    proschi('render', '--format', 'preview-html', '--theme', name, '--out', dir, diagram);
    proschi('render', '--format', 'hld-html', '--theme', name, '--out', dir, diagram);
    pages[name] = {
      preview: pathToFileURL(join(dir, `${stem}.preview.html`)).href,
      hld: pathToFileURL(join(dir, `${stem}.hld.html`)).href,
    };
  }

  const { browser, page } = await launchBrowser(screen);
  try {
    await page.goto(pages[THEMES[0].name].preview);
    await sleep(800);
    rec.start();
    for (const { name, note } of THEMES) {
      await page.goto(pages[name].preview);
      rec.caption(`\`proschi render --format preview-html --theme ${name}\`: ${note}`);
      await sleep(3500);
      // The architecture, then a scenario's sequence diagram under the picker.
      await glideTo(page, '#scenario', 1800, 80);
      await sleep(1000);
      await page.selectOption('#scenario', { index: 0 });
      await sleep(2500);
      await glide(page, 500, 1500);
      await sleep(1500);
    }

    rec.caption('The scenario picker shows one scenario at a time (kept in the URL hash)');
    const options = await page.$$eval('#scenario option', (os) => os.map((o) => o.value));
    await glideTo(page, '#scenario', 900, 80);
    for (const value of options.slice(1, 4)) {
      await page.selectOption('#scenario', value);
      await sleep(2200);
    }

    for (const name of ['sketch-dark', 'classic']) {
      await page.goto(pages[name].hld);
      rec.caption(`The HLD document in a theme too: \`proschi render --format hld-html --theme ${name}\``);
      await sleep(3000);
      await glide(page, 1400, 5000);
      await sleep(1200);
      await glide(page, 1400, 5000);
      await sleep(1500);
    }

    rec.caption('Pick it per run with `--theme`, or for a folder with `"theme"` in proschi.json');
    await page.goto(pages.classic.preview);
    await sleep(3500);
    await rec.stop();
  } finally {
    await browser.close();
  }
}
