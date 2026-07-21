#!/usr/bin/env node
/**
 * GptSkin Theme Applier — fully automated.
 *
 * Free presets (no account needed):
 *   node apply-theme.mjs --preset dark-void
 *   node apply-theme.mjs --presets              (list all free themes)
 *
 * Custom themes (needs API key + credits):
 *   node apply-theme.mjs --key <api-key>        (one-time setup)
 *   node apply-theme.mjs --image <path> [name]  (generate from image)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join, resolve, basename } from "node:path";
import { homedir } from "node:os";
import { execSync, spawn } from "node:child_process";

const WS = globalThis.WebSocket || (await import("ws")).default;
const CONFIG_DIR = join(homedir(), ".gptskin");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");
const CDP_PORT = 9223;
const SCRIPT_DIR = new URL(".", import.meta.url).pathname;
const PRESETS_DIR = join(SCRIPT_DIR, "..", "presets");

function loadConfig() {
  if (!existsSync(CONFIG_FILE)) return { serverUrl: "https://gptskin.vercel.app", apiKey: "" };
  return JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
}
function saveConfig(c) { mkdirSync(CONFIG_DIR, { recursive: true }); writeFileSync(CONFIG_FILE, JSON.stringify(c, null, 2)); }

async function api(config, path, opts = {}) {
  const headers = { Authorization: `Bearer ${config.apiKey}`, ...opts.headers };
  if (opts.body && typeof opts.body === "string") headers["Content-Type"] = "application/json";
  const res = await fetch(`${config.serverUrl}${path}`, { ...opts, headers });
  return { status: res.status, data: await res.json() };
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function ensureCdp() {
  try { const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`); if (r.ok) return true; } catch {}
  console.log("Starting Codex with theme support...");
  try { execSync(`osascript -e 'quit app "ChatGPT"'`, { timeout: 5000 }); } catch {}
  await sleep(2000);
  spawn("open", ["-a", "ChatGPT", "--args", `--remote-debugging-port=${CDP_PORT}`], { detached: true, stdio: "ignore" }).unref();
  for (let i = 0; i < 25; i++) {
    await sleep(1000);
    try { const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`); if (r.ok) { console.log("Codex ready ✓"); return true; } } catch {}
  }
  console.error("❌ Codex failed to start with CDP.");
  return false;
}

async function cdpConnect() {
  const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
  const targets = await r.json();
  const page = targets.find(t => t.type === "page" && !t.url.startsWith("devtools://"));
  if (!page) throw new Error("No Codex page found");
  return new Promise((resolve, reject) => {
    const ws = new WS(page.webSocketDebuggerUrl);
    let id = 1;
    ws.onopen = () => resolve({
      eval(expr) {
        return new Promise((res, rej) => {
          const mid = id++;
          const onMsg = (evt) => {
            const msg = JSON.parse(typeof evt.data === "string" ? evt.data : evt.data.toString());
            if (msg.id === mid) { ws.removeEventListener("message", onMsg); msg.error ? rej(new Error(msg.error.message)) : res(msg.result); }
          };
          ws.addEventListener("message", onMsg);
          ws.send(JSON.stringify({ id: mid, method: "Runtime.evaluate", params: { expression: expr } }));
          setTimeout(() => { ws.removeEventListener("message", onMsg); rej(new Error("timeout")); }, 15000);
        });
      },
      close() { ws.close(); },
    });
    ws.onerror = () => reject(new Error("CDP connection failed"));
  });
}

// Generate CSS from colors array (accent, secondary, background)
function generateCSS(colors) {
  const [accent, secondary, bg] = colors;
  const hexToRgb = (hex) => {
    const h = hex.replace("#", "");
    return `${parseInt(h.slice(0,2),16)},${parseInt(h.slice(2,4),16)},${parseInt(h.slice(4,6),16)}`;
  };
  const lighten = (hex, pct) => {
    const h = hex.replace("#", "");
    const r = Math.min(255, parseInt(h.slice(0,2),16) + Math.round(255 * pct));
    const g = Math.min(255, parseInt(h.slice(2,4),16) + Math.round(255 * pct));
    const b = Math.min(255, parseInt(h.slice(4,6),16) + Math.round(255 * pct));
    return `rgb(${r},${g},${b})`;
  };
  return `:root {
  --gptskin-accent: ${accent};
  --gptskin-accent-rgb: ${hexToRgb(accent)};
  --gptskin-secondary: ${secondary};
  --gptskin-secondary-rgb: ${hexToRgb(secondary)};
  --gptskin-background: ${bg};
  --gptskin-background-rgb: ${hexToRgb(bg)};
  --gptskin-surface: ${lighten(bg, 0.08)};
  --gptskin-border: ${lighten(bg, 0.15)};
  --gptskin-text: ${lighten(bg, 0.85)};
  --gptskin-text-muted: ${lighten(bg, 0.5)};
}
body, [data-theme], .dark, .light {
  background-color: var(--gptskin-background) !important;
  color: var(--gptskin-text) !important;
}
a, button:not([disabled]), [role="button"] {
  color: var(--gptskin-accent) !important;
}
input, textarea, select, [data-radix-popper-content], .modal, dialog {
  background-color: var(--gptskin-surface) !important;
  border-color: var(--gptskin-border) !important;
  color: var(--gptskin-text) !important;
}
`;
}

async function injectTheme(cdp, css, bgBase64) {
  const esc = css.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$/g, "\\$");
  let js = `document.querySelectorAll('[id^="gptskin-"]').forEach(e=>e.remove());
    const s=document.createElement('style');s.id='gptskin-theme';
    s.textContent=\`${esc}\`;document.head.appendChild(s);`;
  if (bgBase64) {
    js += `const b=document.createElement('style');b.id='gptskin-bg';
      b.textContent=\`body::before{content:'';position:fixed;inset:0;z-index:-1;
      background-image:url('data:image/webp;base64,${bgBase64}');
      background-size:cover;background-position:center;opacity:.15;pointer-events:none}\`;
      document.head.appendChild(b);`;
  }
  return cdp.eval(js + `'ok'`);
}

function getPresets() {
  if (!existsSync(PRESETS_DIR)) return [];
  return readdirSync(PRESETS_DIR)
    .filter(f => f.endsWith(".json"))
    .map(f => JSON.parse(readFileSync(join(PRESETS_DIR, f), "utf-8")));
}

// ── Main ──
const args = process.argv.slice(2);
const config = loadConfig();

// === FREE PRESETS (no API key needed) ===

if (args[0] === "--presets") {
  const presets = getPresets();
  console.log("🎨 Free preset themes (no account needed):\n");
  presets.forEach((p, i) => {
    const colorDots = p.colors.map(c => `${c}`).join(" ");
    console.log(`  ${i + 1}. ${p.name} — ${p.description}`);
  });
  console.log(`\nUse: node apply-theme.mjs --preset <name>`);
  console.log(`Example: node apply-theme.mjs --preset dark-void`);
}

else if (args[0] === "--preset" && args[1]) {
  const presets = getPresets();
  const preset = presets.find(p => p.id === args[1]);
  if (!preset) {
    console.log(`❌ Unknown preset: ${args[1]}`);
    console.log(`Available: ${presets.map(p => p.id).join(", ")}`);
    process.exit(1);
  }
  const css = generateCSS(preset.colors);
  if (!(await ensureCdp())) process.exit(1);
  const cdp = await cdpConnect();
  await injectTheme(cdp, css, null);
  cdp.close();
  console.log(`✅ Applied: ${preset.name} | Colors: ${preset.colors.join(", ")}`);
}

// === API KEY CONFIG ===

else if (args[0] === "--key") {
  config.apiKey = args[1];
  saveConfig(config);
  const { status, data } = await api(config, "/api/user/credits");
  if (status === 200) console.log(`✅ Configured | Credits: ${data.credits}`);
  else { console.log("❌ Invalid key"); process.exit(1); }
}

// === CUSTOM THEMES (needs API key) ===

else if (args[0] === "--check") {
  if (!config.apiKey) { console.log("❌ No API key. Run: --key <your-api-key>\n   Get key: " + config.serverUrl + "/settings/apikeys"); process.exit(1); }
  const { data } = await api(config, "/api/user/credits");
  console.log(`Credits: ${data.credits}`);
}

else if (args[0] === "--remove") {
  if (!(await ensureCdp())) process.exit(1);
  const cdp = await cdpConnect();
  await cdp.eval(`document.querySelectorAll('[id^="gptskin-"]').forEach(e=>e.remove());'ok'`);
  cdp.close();
  console.log("✅ Theme removed");
}

else if (args[0] === "--list") {
  if (!config.apiKey) { console.log("❌ No API key. Run: --key <your-api-key>\n   Get key: " + config.serverUrl + "/settings/apikeys"); process.exit(1); }
  const { data } = await api(config, "/api/themes");
  (data.themes || []).forEach((t, i) => console.log(`${i + 1}. ${t.name} [${t.id.slice(0, 8)}]`));
}

else if (args[0] === "--apply" && args[1]) {
  if (!config.apiKey) { console.log("❌ No API key. Run: --key <your-api-key>\n   Get key: " + config.serverUrl + "/settings/apikeys"); process.exit(1); }
  if (!(await ensureCdp())) process.exit(1);
  const { data } = await api(config, `/api/themes/${args[1]}/css`);
  const cdp = await cdpConnect();
  await injectTheme(cdp, data.css, data.backgroundBase64);
  cdp.close();
  console.log(`✅ Applied: ${data.name}`);
}

else if (args[0] === "--image" && args[1]) {
  if (!config.apiKey) {
    console.log(`❌ Custom themes require an account.`);
    console.log(`\n   🆓 Free option: Register at ${config.serverUrl}/sign-up — get 90 free Credits (9 themes)`);
    console.log(`   Then get your API key at: ${config.serverUrl}/settings/apikeys`);
    console.log(`   And run: --key <your-api-key>\n`);
    console.log(`   Or try a free preset first: --presets`);
    process.exit(1);
  }
  const imgPath = resolve(args[1]);
  if (!existsSync(imgPath)) { console.log(`❌ Not found: ${imgPath}`); process.exit(1); }

  const { data: cd } = await api(config, "/api/user/credits");
  if (cd.message === "authentication required") { console.log("❌ Invalid key. Get new key: " + config.serverUrl + "/settings/apikeys"); process.exit(1); }
  if ((cd.credits ?? 0) < 10) {
    console.log(`❌ Credits: ${cd.credits ?? 0} (need 20).`);
    console.log(`   Top up: ${config.serverUrl}/settings/credits`);
    process.exit(1);
  }
  console.log(`Credits: ${cd.credits} ✓`);

  console.log("Uploading...");
  const fd = new FormData();
  fd.append("files", new Blob([readFileSync(imgPath)]), imgPath.split("/").pop());
  const ur = await fetch(`${config.serverUrl}/api/storage/upload-image`, {
    method: "POST", headers: { Authorization: `Bearer ${config.apiKey}` }, body: fd,
  });
  const ud = await ur.json();
  const rawUrl = ud.data?.urls?.[0];
  if (!rawUrl) { console.log("❌ Upload failed"); process.exit(1); }
  const imageUrl = rawUrl.startsWith("http") ? rawUrl : `${config.serverUrl}${rawUrl}`;

  console.log("Generating theme...");
  const { status, data: td } = await api(config, "/api/themes/compile", {
    method: "POST",
    headers: { "Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify({ imageUrl, prompt: "Codex workspace theme", themeName: args[2] || undefined }),
  });
  if (status !== 201 || td.status === "failed") { console.log(`❌ ${td.error || td.message}`); process.exit(1); }
  console.log(`Theme: ${td.theme.name} | Colors: ${td.theme.colors.join(", ")}`);

  if (!(await ensureCdp())) { console.log("⚠️ Saved. Apply later: --apply " + td.theme.id); process.exit(0); }
  console.log("Applying to Codex...");
  const { data: cssd } = await api(config, `/api/themes/${td.theme.id}/css`);
  const cdp = await cdpConnect();
  await injectTheme(cdp, cssd.css, cssd.backgroundBase64);
  cdp.close();
  console.log("✅ Theme applied to Codex!");
}

else {
  console.log(`GptSkin Theme Manager

  🆓 Free presets (no account needed):
    --presets              List all free themes
    --preset <name>        Apply a free preset theme

  💎 Custom themes (needs account):
    --key <api-key>        Save API key (one-time setup)
    --image <path> [name]  Generate + apply from image
    --apply <id>           Apply a saved theme
    --list                 List your themes
    --check                Check credit balance

  🛠️ Utility:
    --remove               Remove current theme`);
}
