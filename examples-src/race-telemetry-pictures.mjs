/**
 * Draws the Race telemetry example's pictures, from race-telemetry-art.mjs:
 *
 *   node examples-src/race-telemetry-pictures.mjs [path to Chrome]
 *
 * It drives a headless Chrome (set CHROME to its path if it isn't found), loads each page with the
 * template's fonts and saves it as WebP in examples-src/race-telemetry-pictures. Run it after
 * race-telemetry-snapshot.mjs and before building the example, and again after changing the layout.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pictures } from './race-telemetry-art.mjs';

const CHROMES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
];
const chrome = process.argv[2] ?? process.env.CHROME ?? CHROMES.find((path) => existsSync(path));
if (!chrome) throw new Error('Chrome not found: pass its path, or set CHROME.');

const out = new URL('race-telemetry-pictures/', import.meta.url);
mkdirSync(out, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), 'race-telemetry-pictures-'));
const port = 9300 + Math.floor(Math.random() * 600);
const browser = spawn(chrome, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', '--hide-scrollbars', 'about:blank'], {
  stdio: 'ignore',
});
try {
  let target;
  for (let i = 0; i < 50 && !target; i++) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    target = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })
      .then((response) => response.json())
      .catch(() => undefined);
  }
  if (!target) throw new Error('Chrome did not start.');
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });
  let nextId = 1;
  const waiting = new Map();
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    const answer = waiting.get(message.id);
    if (!answer) return;
    waiting.delete(message.id);
    if (message.error) answer.reject(new Error(message.error.message));
    else answer.resolve(message.result);
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      waiting.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });

  await send('Page.enable');
  const { frameTree } = await send('Page.getFrameTree');
  let total = 0;
  for (const picture of pictures()) {
    await send('Emulation.setDeviceMetricsOverride', { width: picture.width, height: picture.height, deviceScaleFactor: picture.scale, mobile: false });
    // Without this a page with no background of its own is drawn on white.
    await send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
    await send('Page.setDocumentContent', { frameId: frameTree.frame.id, html: picture.html });
    const ready = await send('Runtime.evaluate', {
      expression: `document.fonts.ready.then(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve([...document.fonts].filter((face) => face.status === 'loaded').length)))))`,
      awaitPromise: true,
      returnByValue: true,
    });
    if (ready.exceptionDetails) throw new Error(ready.exceptionDetails.exception?.description);
    const { data } = await send('Page.captureScreenshot', {
      format: 'webp',
      quality: picture.opaque ? 90 : 94,
      clip: { x: 0, y: 0, width: picture.width, height: picture.height, scale: 1 },
    });
    const bytes = Buffer.from(data, 'base64');
    writeFileSync(new URL(`${picture.name}.webp`, out), bytes);
    total += bytes.length;
    console.log(`${picture.name}.webp  ${picture.width * picture.scale} x ${picture.height * picture.scale}  ${(bytes.length / 1024).toFixed(1)} KB  (${ready.result.value} fonts)`);
  }
  console.log(`${(total / 1024).toFixed(0)} KB in all`);
  socket.close();
} finally {
  browser.kill();
  // Chrome may still hold its profile for a moment.
  await new Promise((resolve) => setTimeout(resolve, 500));
  rmSync(profile, { recursive: true, force: true, maxRetries: 5 });
}
