// The VS Code extension: section highlighting in the editor, and the preview
// with use case descriptions, section frames and the proschi.preview.theme
// setting, following VS Code's light or dark colour theme.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { maximize } from '../lib/terminal.mjs';
import { freePort, frontendRequire, sleep, startProcess, TOOLING } from '../lib/env.mjs';

export const title = 'VS Code: sections in the editor, a themed preview';
export const needs = ['code'];

/** The Electron binary (the `code` on PATH is a launcher script that drops Chromium flags). */
function codeBinary() {
  const candidates = [process.env.FORK_VIDEOS_VSCODE, '/usr/share/code/code', '/opt/visual-studio-code/code', '/usr/lib/code/code'].filter(Boolean);
  const found = candidates.find((c) => existsSync(c));
  if (!found) throw new Error(`No VS Code binary in ${candidates.join(', ')}; set FORK_VIDEOS_VSCODE`);
  return found;
}

const SETTINGS = {
  'workbench.colorTheme': 'Default Light Modern',
  'workbench.startupEditor': 'none',
  'workbench.tips.enabled': false,
  'workbench.secondarySideBar.defaultVisibility': 'hidden',
  'workbench.layoutControl.enabled': false,
  'chat.disableAIFeatures': true,
  'chat.commandCenter.enabled': false,
  'window.zoomLevel': 0.5,
  'window.restoreWindows': 'none',
  'window.commandCenter': false,
  'editor.minimap.enabled': false,
  'editor.fontSize': 13,
  'editor.cursorBlinking': 'solid',
  // proschi.json is typed key by key in the clip: no closing quotes, indents or suggestions added.
  'editor.autoClosingBrackets': 'never',
  'editor.autoClosingQuotes': 'never',
  'editor.autoIndent': 'none',
  'editor.autoSurround': 'never',
  'editor.quickSuggestions': { other: false, comments: false, strings: false },
  'editor.suggestOnTriggerCharacters': false,
  'editor.formatOnType': false,
  'security.workspace.trust.enabled': false,
  'update.mode': 'none',
  'extensions.autoCheckUpdates': false,
  'extensions.ignoreRecommendations': true,
  'telemetry.telemetryLevel': 'off',
  'git.enabled': false,
  'proschi.preview.theme': 'sketch-light',
};

/**
 * How many more inotify instances this user may open (up to 64). VS Code's
 * file watchers need a few dozen; without them it never sees proschi.json saved.
 */
function freeInotifyInstances() {
  const probe = `import ctypes
libc = ctypes.CDLL(None, use_errno=True)
fds = []
while len(fds) < 64:
    fd = libc.inotify_init()
    if fd < 0:
        break
    fds.append(fd)
print(len(fds))`;
  return Number(execFileSync('python3', ['-c', probe], { encoding: 'utf8' }).trim());
}

export async function record({ screen, rec, diagram, work }) {
  const free = freeInotifyInstances();
  if (free < 32) {
    throw new Error(
      `Only ${free} inotify instances are free for your user, so VS Code can't watch proschi.json. Close some editors or agents, or raise the limit: sudo sysctl fs.inotify.max_user_instances=512`,
    );
  }
  const userData = join(work, 'user-data');
  const settingsFile = join(userData, 'User/settings.json');
  mkdirSync(join(userData, 'User'), { recursive: true });
  writeFileSync(settingsFile, JSON.stringify(SETTINGS, null, 2));
  const folder = join(work, 'workspace');
  mkdirSync(folder, { recursive: true });
  const file = join(folder, 'e-commerce.proschi');
  writeFileSync(file, readFileSync(diagram, 'utf8'));
  // Empty until the clip types a theme into it.
  writeFileSync(join(folder, 'proschi.json'), '{}\n');

  const port = await freePort();
  const code = startProcess(
    codeBinary(),
    [
      `--user-data-dir=${userData}`,
      `--extensions-dir=${join(work, 'extensions')}`,
      `--extensionDevelopmentPath=${join(TOOLING, 'vscode')}`,
      '--disable-workspace-trust',
      '--skip-welcome',
      '--skip-release-notes',
      '--disable-gpu',
      `--remote-debugging-port=${port}`,
      '--new-window',
      folder,
      file,
    ],
    { env: screen.env },
  );
  const { chromium } = frontendRequire('@playwright/test');
  let browser;
  try {
    for (let i = 0; i < 100 && !browser; i++) {
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`).catch(() => sleep(200).then(() => undefined));
    }
    if (!browser) throw new Error('Could not connect to VS Code over CDP');
    let page;
    for (let i = 0; i < 100 && !page; i++) {
      page = browser.contexts()[0]?.pages().find((p) => p.url().includes('workbench'));
      if (!page) await sleep(200);
    }
    await page.waitForSelector('.monaco-workbench .monaco-editor', { timeout: 60_000 });
    await maximize(screen);
    await sleep(2500);

    const command = async (name, pause = 1200) => {
      await page.keyboard.press('F1');
      await page.waitForSelector('.quick-input-widget input', { state: 'visible' });
      await page.keyboard.type(name, { delay: 25 });
      await sleep(700);
      await page.keyboard.press('Enter');
      await sleep(pause);
    };
    const goToLine = async (line) => {
      await page.keyboard.press('Control+G');
      await page.keyboard.type(String(line), { delay: 40 });
      await page.keyboard.press('Enter');
      await sleep(300);
    };
    const preview = () => page.locator('iframe.webview').last();
    const scrollPreview = async (dy, steps = 12) => {
      const box = await preview().boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      for (let i = 0; i < steps; i++) {
        await page.mouse.wheel(0, dy / steps);
        await sleep(60);
      }
    };
    /** Picks `value` in the Settings editor, or writes it to settings.json if the UI can't. */
    const setTheme = async (value) => {
      await command('Preferences: Open Settings (UI)', 1500);
      await page.keyboard.type('proschi.preview.theme', { delay: 40 });
      await sleep(1500);
      const select = page.locator('.setting-item-contents select.monaco-select-box').first();
      await select.focus();
      await sleep(500);
      const current = await select.inputValue().catch(() => SETTINGS['proschi.preview.theme']);
      const order = ['sketch-light', 'sketch-dark', 'classic', 'sketch'];
      const delta = order.indexOf(value) - order.indexOf(current);
      await page.keyboard.press('Enter');
      await sleep(600);
      for (let i = 0; i < Math.abs(delta); i++) {
        await page.keyboard.press(delta > 0 ? 'ArrowDown' : 'ArrowUp');
        await sleep(350);
      }
      await page.keyboard.press('Enter');
      await sleep(1200);
      const saved = JSON.parse(readFileSync(settingsFile, 'utf8'));
      if (saved['proschi.preview.theme'] !== value) writeFileSync(settingsFile, JSON.stringify({ ...saved, 'proschi.preview.theme': value }, null, 2));
      // Settings opens as an editor or, in newer VS Code, a modal: close whichever it is.
      const modal = await page.locator('.monaco-dialog-modal-block, .modal-editor-part').count();
      await page.keyboard.press(modal ? 'Escape' : 'Control+W');
      await sleep(1500);
    };

    await command('View: Close Primary Side Bar', 300);
    await goToLine(29);
    await sleep(1000);

    rec.start();
    rec.caption('VS Code with the fork\'s extension: `section` is highlighted like the other keywords');
    await page.keyboard.press('Control+Home');
    await sleep(800);
    await goToLine(40);
    await sleep(3500);

    rec.caption('Proschi: Open Preview to the Side');
    await command('Proschi: Open Preview to the Side', 4500);
    rec.caption('The preview: the architecture, then each use case with its description and scenarios');
    await sleep(2500);
    await scrollPreview(700);
    await sleep(2000);
    rec.caption('Section and par frames in the sequence diagrams');
    await scrollPreview(600);
    await sleep(3500);

    rec.caption('The new `proschi.preview.theme` setting: classic');
    await setTheme('classic');
    await sleep(3000);
    await scrollPreview(-500);
    await sleep(2500);

    rec.caption('A dark VS Code theme with `sketch-dark`: the page follows VS Code\'s light or dark');
    await page.keyboard.press('Control+K');
    await page.keyboard.press('Control+T');
    await page.waitForSelector('.quick-input-widget input', { state: 'visible' });
    await sleep(600);
    await page.keyboard.type('Dark Modern', { delay: 40 });
    await sleep(800);
    await page.keyboard.press('Enter');
    await sleep(1500);
    await setTheme('sketch-dark');
    await sleep(3000);
    await scrollPreview(700);
    await sleep(3000);

    /** Replaces proschi.json's text with `theme`, typed; saves it only when asked. */
    const typeConfig = async (theme) => {
      await page.keyboard.press('Control+A');
      await sleep(300);
      await page.keyboard.press('Delete');
      await page.keyboard.type(`{\n  "theme": "${theme}"\n}\n`, { delay: 55 });
    };
    rec.caption('A `"theme"` in the folder\'s proschi.json overrides the setting');
    await page.keyboard.press('Control+1'); // the .proschi file's editor group, not the preview's
    await sleep(400);
    await page.keyboard.press('Control+P');
    await page.waitForSelector('.quick-input-widget input', { state: 'visible' });
    await page.keyboard.type('proschi.json', { delay: 50 });
    await sleep(900);
    await page.keyboard.press('Enter');
    await sleep(1500);
    await typeConfig('classic');
    rec.caption('Not saved yet, so the preview stays as it was');
    await sleep(3000);
    rec.caption('Saved: the preview switches to the folder\'s theme');
    await page.keyboard.press('Control+S');
    await sleep(4000);
    await scrollPreview(-500);
    await sleep(2500);

    rec.caption('Change it and save again: `sketch-light`');
    await typeConfig('sketch-light');
    await sleep(1200);
    await page.keyboard.press('Control+S');
    await sleep(4500);
    await rec.stop();
  } finally {
    await browser?.close().catch(() => {});
    code.stop();
  }
}
