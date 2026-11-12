// Makes each example's link preview: the picture Teams, Slack and other apps show beside a shared link to
// its page. It opens the example on the site in headless Chrome, takes the graphic alone on a clear
// background, and sets it in a 1200 × 630 card in the site's colours, written to
// static/img/share/<slug>.jpg. The page names its card with `image:` in its front matter.
//
//   npm run share-cards                         every example, from the live site
//   npm run share-cards -- weather rankings     just these
//   SITE=http://localhost:3000 npm run share-cards -- my-new-example     from `npm start`
//
// Needs Google Chrome; set CHROME to its path if it isn't in the usual place. Analytics requests are
// blocked, so the visits aren't counted. When a card changes, raise the `?v=` in its page's `image:`:
// chat apps keep the picture they once fetched from an address.
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const siteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = (process.env.SITE ?? 'https://ografstudio.org').replace(/\/$/, '');
const OUT = path.join(siteRoot, 'static', 'img', 'share');
const PORT = Number(process.env.CDP_PORT ?? 9531);
const CARD = { width: 1200, height: 630 };
// Teams shows a small square cut from the middle of the card, about its middle 790 px, so a small graphic
// goes there whole. A large one fills the card inside a margin, and one that fills its frame fills the card.
const MIDDLE = { width: 780, height: 500 };
const MARGIN = { width: 1104, height: 550 };

/**
 * What to do before the picture: a string presses the player's button with that text, a number waits that
 * many milliseconds. Pressing a button stops an example's show, so the picture stays put. `focus` keeps a
 * part of the graphic, as fractions of it, for one too long and thin to read whole. `mode: 'middle'` keeps a
 * wide graphic inside the part of the card Teams shows.
 */
const SCENES = {
  weather: { steps: ['Next step', 3500] },
  rankings: { steps: ['Next vote', 11500, 'Next vote', 2600] },
  'live-markets': { steps: [6000] },
  'race-telemetry': { steps: [12000] },
  ticker: { steps: [4000], focus: { x: 0, y: 0, width: 0.42, height: 1 } },
  'weather-strap': { mode: 'middle' },
};
const DEFAULT_STEPS = [3000];

const CHROME =
  process.env.CHROME ??
  {
    win32: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    darwin: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  }[process.platform] ??
  'google-chrome';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function startChrome() {
  const profile = mkdtempSync(path.join(tmpdir(), 'share-cards-'));
  const chrome = spawn(
    CHROME,
    ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--hide-scrollbars', '--mute-audio', 'about:blank'],
    { stdio: 'ignore' },
  );
  for (let i = 0; i < 50; i++) {
    try {
      await fetch(`http://127.0.0.1:${PORT}/json/version`);
      return {
        stop: () => {
          chrome.kill();
          setTimeout(() => rmSync(profile, { recursive: true, force: true }), 1000).unref();
        },
      };
    } catch {
      await sleep(200);
    }
  }
  chrome.kill();
  throw new Error(`Chrome didn't start: ${CHROME}. Set CHROME to its path.`);
}

/** A tab, driven over the DevTools protocol. */
async function openTab() {
  const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });
  let nextId = 1;
  const pending = new Map();
  socket.onmessage = (message) => {
    const data = JSON.parse(message.data);
    const waiting = pending.get(data.id);
    if (!waiting) return;
    pending.delete(data.id);
    if (data.error) waiting.reject(new Error(data.error.message));
    else waiting.resolve(data.result);
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? 'Script failed');
    return result.result.value;
  };
  const picture = async (clip, format = 'png') =>
    (await send('Page.captureScreenshot', { format, ...(format === 'jpeg' ? { quality: 88 } : {}), ...(clip ? { clip } : {}) }))
      .data;
  const close = async () => {
    socket.close();
    await fetch(`http://127.0.0.1:${PORT}/json/close/${target.id}`).catch(() => undefined);
  };
  // A tab behind another one waits to decode images and draw, so the one at work is in front.
  await fetch(`http://127.0.0.1:${PORT}/json/activate/${target.id}`);
  await send('Page.enable');
  return { send, evaluate, picture, close };
}

/** The graphic on a clear background, and where it sits in its frame: a picture at twice the frame's size. */
async function takeGraphic(tab, slug) {
  await tab.send('Network.enable');
  await tab.send('Network.setBlockedURLs', {
    urls: ['*googletagmanager.com*', '*google-analytics.com*', '*analytics.google.com*', '*doubleclick.net*'],
  });
  await tab.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await tab.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await tab.send('Page.navigate', { url: `${SITE}/examples/${slug}` });
  const status = () => tab.evaluate(`document.querySelector('figure [role=status]')?.textContent ?? ''`);
  for (let i = 0; i < 120; i++) {
    await sleep(250);
    if ((await status()) === 'On air') break;
    if (i === 119) throw new Error(`${slug} never came on air (${await status()})`);
  }
  for (const step of SCENES[slug]?.steps ?? DEFAULT_STEPS) {
    if (typeof step === 'number') {
      await sleep(step);
      continue;
    }
    for (let i = 0; ; i++) {
      const pressed = await tab.evaluate(`(() => {
        const button = [...document.querySelectorAll('figure button')].find((b) => b.textContent.includes(${JSON.stringify(step)}));
        if (!button || button.disabled) return false;
        button.click();
        return true;
      })()`);
      if (pressed) break;
      if (i === 40) throw new Error(`${slug}: no ${step} to press`);
      await sleep(250);
    }
  }
  // Everything behind the graphic goes clear: the frame's backdrop and the page.
  await tab.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
  // The picture is rounded inwards to whole pixels, so none of the player's border gets in.
  const frame = await tab.evaluate(`(() => {
    const frame = document.querySelector('figure [data-filling]');
    frame.scrollIntoView({ block: 'center' });
    for (let el = frame; el; el = el.parentElement) {
      el.style.setProperty('background', 'transparent', 'important');
      el.style.setProperty('border-color', 'transparent', 'important');
    }
    for (const el of frame.querySelectorAll('video')) el.style.setProperty('display', 'none', 'important');
    const r = frame.getBoundingClientRect();
    const x = Math.ceil(r.x + scrollX), y = Math.ceil(r.y + scrollY);
    return { x, y, width: Math.floor(r.right + scrollX) - x, height: Math.floor(r.bottom + scrollY) - y };
  })()`);
  await sleep(300);
  return { frame, whole: await tab.picture({ ...frame, scale: 2 }) };
}

/** Where a picture isn't clear, as fractions of it. Its outermost pixels don't count: they can catch the page. */
async function bounds(tab, png) {
  return tab.evaluate(`(async () => {
    const image = new Image();
    image.src = 'data:image/png;base64,${png}';
    await image.decode();
    const canvas = new OffscreenCanvas(image.width, image.height);
    const g = canvas.getContext('2d');
    g.drawImage(image, 0, 0);
    const { data, width, height } = g.getImageData(0, 0, image.width, image.height);
    let left = width, top = height, right = -1, bottom = -1;
    for (let y = 2; y < height - 2; y++) {
      for (let x = 2; x < width - 2; x++) {
        if (data[(y * width + x) * 4 + 3] < 24) continue;
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
    if (right < 0) return null;
    return { x: left / width, y: top / height, width: (right + 1 - left) / width, height: (bottom + 1 - top) / height, pixels: [width, height] };
  })()`);
}

/** The card: the graphic in the site's colours, at 1200 × 630, drawn in the tab, which it takes over. */
async function card(work, png, size, mode) {
  let box = '';
  if (mode === 'cover') box = `width:${CARD.width}px;height:${CARD.height}px;object-fit:cover`;
  else {
    const room = mode === 'middle' ? MIDDLE : MARGIN;
    const scale = Math.min(room.width / size.width, room.height / size.height);
    box = `width:${Math.round(size.width * scale)}px;height:${Math.round(size.height * scale)}px;filter:drop-shadow(0 14px 36px rgb(0 0 0 / 55%))`;
  }
  await work.send('Page.navigate', { url: 'about:blank' });
  await sleep(300);
  await work.send('Emulation.setDefaultBackgroundColorOverride', {});
  await work.send('Emulation.setDeviceMetricsOverride', { ...CARD, deviceScaleFactor: 1, mobile: false });
  await work.evaluate(`(async () => {
    document.documentElement.innerHTML = ${JSON.stringify(`<head><style>
      html, body { margin: 0; width: ${CARD.width}px; height: ${CARD.height}px; overflow: hidden; }
      body {
        display: grid;
        place-items: center;
        background: radial-gradient(ellipse 80% 60% at 50% 86%, rgb(22 44 116) 0%, rgb(22 44 116 / 0%) 100%), #05070f;
      }
      img { display: block; ${box}; }
    </style></head><body><img></body>`)};
    const img = document.querySelector('img');
    img.src = 'data:image/png;base64,${png}';
    await img.decode();
  })()`);
  // A JPEG: some apps leave out a preview picture much over 300 KB.
  return work.picture(undefined, 'jpeg');
}

const wanted = process.argv.slice(2);
const slugs = readdirSync(path.join(siteRoot, 'examples'))
  .filter((name) => /\.mdx?$/.test(name) && !name.startsWith('index.'))
  .map((name) => name.replace(/\.mdx?$/, ''))
  .filter((slug) => wanted.length === 0 || wanted.includes(slug));
const unknown = wanted.filter((slug) => !slugs.includes(slug));
if (unknown.length > 0) throw new Error(`No example page for: ${unknown.join(', ')}`);

mkdirSync(OUT, { recursive: true });
const chrome = await startChrome();
let failed = 0;
try {
  for (const slug of slugs) {
    const tab = await openTab();
    try {
      const { frame, whole } = await takeGraphic(tab, slug);
      const found = await bounds(tab, whole);
      if (!found) throw new Error(`${slug}: the graphic is empty`);
      const focus = SCENES[slug]?.focus ?? { x: 0, y: 0, width: 1, height: 1 };
      const part = {
        x: found.x + found.width * focus.x,
        y: found.y + found.height * focus.y,
        width: found.width * focus.width,
        height: found.height * focus.height,
      };
      let png = whole;
      let size = { width: part.width * frame.width, height: part.height * frame.height };
      let mode = 'cover';
      if (part.width < 0.97 || part.height < 0.97) {
        // A graphic that leaves part of its frame clear is taken again, alone and sharp enough for its place.
        mode = SCENES[slug]?.mode ?? (part.width > 0.5 || part.height > 0.5 ? 'margin' : 'middle');
        const room = mode === 'middle' ? MIDDLE : MARGIN;
        const scale = Math.min(8, Math.max(2, 1.5 * Math.min(room.width / size.width, room.height / size.height)));
        png = await tab.picture({
          x: frame.x + part.x * frame.width,
          y: frame.y + part.y * frame.height,
          width: size.width,
          height: size.height,
          scale,
        });
      }
      writeFileSync(path.join(OUT, `${slug}.jpg`), Buffer.from(await card(tab, png, size, mode), 'base64'));
      console.log(`${slug}: ${mode}`);
    } catch (error) {
      failed += 1;
      console.error(`${slug}: ${error.message}`);
    } finally {
      await tab.close();
    }
  }
} finally {
  chrome.stop();
}
if (failed > 0) process.exitCode = 1;
