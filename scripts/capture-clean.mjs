// Capture Codex window with upgrade banner temporarily hidden (leaf-only, restored after).
// Usage: node capture-clean.mjs <out.png>
import { writeFileSync } from 'node:fs';

const out = process.argv[2] || '/tmp/capture-clean.png';
const CDP = 'http://127.0.0.1:19123';

const list = await (await fetch(`${CDP}/json/list`)).json();
const page = list.find((t) => t.type === 'page' && /codex/i.test(t.url + t.title)) || list.find((t) => t.type === 'page');
if (!page) { console.error('no page target'); process.exit(1); }

const WS = (await import('ws')).default;
const ws = new WS(page.webSocketDebuggerUrl, { perMessageDeflate: false });
await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });

let id = 0;
const pending = new Map();
ws.on('message', (data) => {
  const msg = JSON.parse(data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
});
function send(method, params = {}) {
  return new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
}
async function evalJs(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true });
  return r.result?.result?.value;
}

// Hide only leaf elements whose own text mentions Upgrade, plus count what we hid.
const hidden = await evalJs(`(() => {
  window.__gptskinHidden = [];
  const all = document.querySelectorAll('div,span,p,button,a');
  let n = 0;
  for (const el of all) {
    const t = (el.textContent || '').trim();
    if (!/upgrade/i.test(t)) continue;
    // leaf-only: skip if any descendant element also contains the text
    let leaf = true;
    for (const child of el.querySelectorAll('*')) {
      if (/upgrade/i.test(child.textContent || '')) { leaf = false; break; }
    }
    if (!leaf) continue;
    // climb at most 2 levels to catch a small pill container, never large regions
    let target = el;
    const rect = el.getBoundingClientRect();
    if (el.parentElement) {
      const pr = el.parentElement.getBoundingClientRect();
      if (pr.width < 500 && pr.height < 120) target = el.parentElement;
    }
    if (rect.width > 800) continue; // never hide wide containers
    target.style.setProperty('visibility', 'hidden', 'important');
    window.__gptskinHidden.push(target);
    n++;
  }
  return n;
})()`);
console.log('hidden banner leaves:', hidden);

await new Promise((r) => setTimeout(r, 800));
const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(out, Buffer.from(shot.result.data, 'base64'));

// Restore immediately.
const restored = await evalJs(`(() => {
  const arr = window.__gptskinHidden || [];
  for (const el of arr) el.style.removeProperty('visibility');
  window.__gptskinHidden = [];
  return arr.length;
})()`);
console.log('restored:', restored);

// Verify main content still present.
const ok = await evalJs(`document.body.innerText.length`);
console.log('body text length:', ok);
console.log('saved', out);
ws.close();
process.exit(0);
