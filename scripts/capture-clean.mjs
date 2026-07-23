// Capture Codex window with upgrade banner temporarily hidden (leaf-only, restored after).
// Usage: node capture-clean.mjs <out.png>
import { writeFileSync } from 'node:fs';
import { selectCodexTarget } from './lib/cdp-target.mjs';

const WS = globalThis.WebSocket || (await import('ws')).default;
const CDP_PORT = Number(process.env.GPTSKIN_CDP_PORT || 19123);
const out = process.argv[2] || '/tmp/capture-clean.png';

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

async function evalJs(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true });
  return r?.result?.value;
}

// Force the window to front + normalize viewport so Chrome produces frames
// even when the real window is occluded or minimized.
await send('Page.bringToFront');
await new Promise((r) => setTimeout(r, 600));
await send('Emulation.setDeviceMetricsOverride', {
  width: 1440,
  height: 900,
  deviceScaleFactor: 2,
  mobile: false,
});
await new Promise((r) => setTimeout(r, 1000));

// Hide only leaf elements whose own text mentions Upgrade; never large regions.
const hidden = await evalJs(`(() => {
  window.__gptskinHidden = [];
  const all = document.querySelectorAll('div,span,p,button,a');
  let n = 0;
  for (const el of all) {
    const t = (el.textContent || '').trim();
    if (!/upgrade/i.test(t)) continue;
    let leaf = true;
    for (const child of el.querySelectorAll('*')) {
      if (/upgrade/i.test(child.textContent || '')) { leaf = false; break; }
    }
    if (!leaf) continue;
    let target = el;
    const rect = el.getBoundingClientRect();
    if (el.parentElement) {
      const pr = el.parentElement.getBoundingClientRect();
      if (pr.width < 500 && pr.height < 120) target = el.parentElement;
    }
    if (rect.width > 800) continue;
    target.style.setProperty('visibility', 'hidden', 'important');
    window.__gptskinHidden.push(target);
    n++;
  }
  return n;
})()`);
console.log('hidden banner leaves:', hidden);

await new Promise((r) => setTimeout(r, 800));
const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(out, Buffer.from(shot.data, 'base64'));

// Restore immediately, then verify content intact.
const restored = await evalJs(`(() => {
  const arr = window.__gptskinHidden || [];
  for (const el of arr) el.style.removeProperty('visibility');
  window.__gptskinHidden = [];
  return arr.length;
})()`);
console.log('restored:', restored);
const textLen = await evalJs(`document.body.innerText.length`);
console.log('body text length:', textLen);

await send('Emulation.clearDeviceMetricsOverride');
ws.close();
console.log('saved', out);
process.exit(0);
