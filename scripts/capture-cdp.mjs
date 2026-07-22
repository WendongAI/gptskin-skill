// Capture a screenshot of the themed Codex window via CDP.
// Usage: node capture-cdp.mjs <out.png>
import { writeFileSync } from 'node:fs';
import { selectCodexTarget } from './lib/cdp-target.mjs';

const WS = globalThis.WebSocket || (await import('ws')).default;
const CDP_PORT = Number(process.env.GPTSKIN_CDP_PORT || 19123);

const out = process.argv[2] || '/tmp/capture.png';

const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
const targets = await r.json();
const page = selectCodexTarget(targets);

const ws = new WS(page.webSocketDebuggerUrl);
let id = 1;
const pending = new Map();
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const mid = id++;
    pending.set(mid, { resolve, reject });
    ws.send(JSON.stringify({ id: mid, method, params }));
    setTimeout(() => {
      if (pending.has(mid)) {
        pending.delete(mid);
        reject(new Error('timeout ' + method));
      }
    }, 20000);
  });
}
ws.addEventListener('message', (evt) => {
  const msg = JSON.parse(typeof evt.data === 'string' ? evt.data : evt.data.toString());
  if (msg.id && pending.has(msg.id)) {
    const p = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result);
  }
});
await new Promise((res) => ws.addEventListener('open', res));

// Verify which theme is actually injected right now.
const state = await send('Runtime.evaluate', {
  expression: `JSON.stringify({bg: getComputedStyle(document.body).backgroundColor, hasTheme: !!document.getElementById('gptskin-theme')})`,
});
console.log('dom state:', state?.result?.value);

// Force the window to front so Chrome produces fresh frames.
await send('Page.bringToFront');
await new Promise((r) => setTimeout(r, 600));

// Normalize viewport for consistent screenshots.
await send('Emulation.setDeviceMetricsOverride', {
  width: 1440,
  height: 900,
  deviceScaleFactor: 2,
  mobile: false,
});
await new Promise((r) => setTimeout(r, 1000));

const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(out, Buffer.from(shot.data, 'base64'));
console.log('saved', out);

// Release the override so the app returns to normal rendering.
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
process.exit(0);
