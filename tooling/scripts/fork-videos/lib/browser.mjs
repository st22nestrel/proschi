// A headed Chrome filling the recorded display, driven by Playwright.
import { frontendRequire, sleep } from './env.mjs';

/** Browser zoom: 1600×900 at 1.25 lays the pages out at 1280×720, readable in a PR. */
export const SCALE = Number(process.env.FORK_VIDEOS_SCALE ?? 1.25);

/** `scale` overrides SCALE for one clip (the editor wants all the room it can get). */
export async function launchBrowser(screen, { scale = SCALE } = {}) {
  const { chromium } = frontendRequire('@playwright/test');
  const browser = await chromium.launch({
    headless: false,
    // The installed Google Chrome; FORK_VIDEOS_CHROMIUM points at another build.
    ...(process.env.FORK_VIDEOS_CHROMIUM ? { executablePath: process.env.FORK_VIDEOS_CHROMIUM } : { channel: process.env.FORK_VIDEOS_CHANNEL ?? 'chrome' }),
    env: screen.env,
    ignoreDefaultArgs: ['--enable-automation'],
    args: ['--kiosk', `--window-size=${screen.width},${screen.height}`, '--window-position=0,0', `--force-device-scale-factor=${scale}`, '--no-first-run', '--no-default-browser-check', '--disable-infobars'],
  });
  const context = await browser.newContext({ viewport: null, locale: 'en-US', timezoneId: 'UTC' });
  const page = await context.newPage();
  // --kiosk alone doesn't reliably reach the window manager: ask for fullscreen over CDP.
  const cdp = await context.newCDPSession(page);
  const { windowId } = await cdp.send('Browser.getWindowForTarget');
  await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'fullscreen' } });
  await sleep(800);
  return { browser, context, page };
}

/** Scrolls the page (or `selector`'s element) by `dy` CSS pixels over `ms`, eased, and waits for it. */
export async function glide(page, dy, ms = 1200, selector) {
  await page.evaluate(
    ([dy, ms, selector]) =>
      new Promise((resolve) => {
        const el = selector ? document.querySelector(selector) : document.scrollingElement;
        const from = el.scrollTop;
        const t0 = performance.now();
        const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
        const tick = (now) => {
          const t = Math.min(1, (now - t0) / ms);
          el.scrollTop = from + dy * ease(t);
          if (t < 1) requestAnimationFrame(tick);
          else resolve();
        };
        requestAnimationFrame(tick);
      }),
    [dy, ms, selector],
  );
}

/** Glides until `selector` sits `offset` px below the top of the viewport. */
export async function glideTo(page, selector, ms = 1200, offset = 16) {
  const dy = await page.evaluate(([s, o]) => document.querySelector(s).getBoundingClientRect().top - o, [selector, offset]);
  await glide(page, dy, ms);
}

/** Types like a person would, so the viewer can follow. */
export async function typeSlowly(page, text, delay = 70) {
  await page.keyboard.type(text, { delay });
  await sleep(300);
}
