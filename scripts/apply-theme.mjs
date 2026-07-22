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

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createApiClient, CUSTOM_THEME_CREDITS } from "./lib/api-client.mjs";
import { selectCodexTarget } from "./lib/cdp-target.mjs";
import { createConfigStore } from "./lib/config-store.mjs";
import { createPaidTheme, resolveThemeForApply } from "./lib/paid-theme-flow.mjs";
import { createPlatformAdapter } from "./lib/platform.mjs";
import { createThemeStore, formatThemeList } from "./lib/theme-store.mjs";

const CDP_PORT = Number(process.env.GPTSKIN_CDP_PORT || 19123);
const SCRIPT_DIR = fileURLToPath(new URL(".", import.meta.url));
const PRESETS_DIR = join(SCRIPT_DIR, "..", "presets");

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function ensureCdp() {
  try { const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`); if (r.ok) return true; } catch {}
  console.log("Starting Codex with theme support...");
  try {
    await createPlatformAdapter().restartWithCdp(CDP_PORT);
  } catch (error) {
    console.error(`❌ ${error.message}`);
    return false;
  }
  await sleep(2000);
  for (let i = 0; i < 25; i++) {
    await sleep(1000);
    try { const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`); if (r.ok) { console.log("Codex ready ✓"); return true; } } catch {}
  }
  console.error("❌ Codex failed to start with CDP.");
  return false;
}

async function cdpConnect() {
  let WS = globalThis.WebSocket;
  if (!WS) {
    try {
      WS = (await import("ws")).default;
    } catch {
      throw new Error("Missing dependency: run npm install in the gptskin-theme skill folder");
    }
  }
  const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
  const targets = await r.json();
  const page = selectCodexTarget(targets);
  return new Promise((resolve, reject) => {
    const ws = new WS(page.webSocketDebuggerUrl);
    let id = 1;
    ws.onopen = () => resolve({
      evaluate(expr) {
        return new Promise((res, rej) => {
          const mid = id++;
          const onMsg = (evt) => {
            const msg = JSON.parse(typeof evt.data === "string" ? evt.data : evt.data.toString());
            if (msg.id === mid) {
              ws.removeEventListener("message", onMsg);
              if (msg.error) return rej(new Error(msg.error.message));
              // Page-side exceptions (e.g. SyntaxError in injected JS) arrive
              // as result.exceptionDetails, NOT error — surface them loudly.
              const ex = msg.result && msg.result.exceptionDetails;
              if (ex) return rej(new Error("page evaluation failed: " + (ex.exception && ex.exception.description || ex.text)));
              res(msg.result);
            }
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
    const r = Math.min(255, Math.max(0, parseInt(h.slice(0,2),16) + Math.round(255 * pct)));
    const g = Math.min(255, Math.max(0, parseInt(h.slice(2,4),16) + Math.round(255 * pct)));
    const b = Math.min(255, Math.max(0, parseInt(h.slice(4,6),16) + Math.round(255 * pct)));
    return `rgb(${r},${g},${b})`;
  };
  const isLight = (hex) => {
    const [r, g, b] = hexToRgb(hex).split(",").map(Number);
    return (r * 299 + g * 587 + b * 114) / 1000 > 128;
  };
  const rgba = (hex, a) => `rgba(${hexToRgb(hex)},${a})`;

  // Derived palette — direction depends on whether the theme bg is light.
  const light = isLight(bg);
  const shift = (pct) => lighten(bg, light ? -pct : pct);
  const surface = shift(0.06);        // main window surface
  const surfaceAlt = shift(0.1);      // cards / secondary surfaces
  const border = rgba(lighten(bg, light ? -0.5 : 0.5), 0.14);
  const borderHeavy = rgba(lighten(bg, light ? -0.5 : 0.5), 0.24);
  const text = shift(0.86);
  const textMuted = shift(0.55);
  const textFaint = shift(0.42);

  // The Codex workspace is styled almost entirely through --color-token-*
  // CSS variables. Overriding those tokens re-themes the whole UI natively;
  // the --gptskin-* variables are kept for compatibility.
  return `:root {
  --gptskin-accent: ${accent};
  --gptskin-accent-rgb: ${hexToRgb(accent)};
  --gptskin-secondary: ${secondary};
  --gptskin-secondary-rgb: ${hexToRgb(secondary)};
  --gptskin-background: ${bg};
  --gptskin-background-rgb: ${hexToRgb(bg)};
  --gptskin-surface: ${surface};
  --gptskin-border: ${border};
  --gptskin-text: ${text};
  --gptskin-text-muted: ${textMuted};

  /* Codex token overrides */
  --color-token-main-surface-primary: ${surface} !important;
  --color-token-bg-primary: ${bg} !important;
  --color-token-bg-secondary: ${surface} !important;
  --color-token-bg-tertiary: ${surfaceAlt} !important;
  --color-token-bg-fog: ${surface} !important;
  --color-token-bg-appshot: ${surface} !important;
  --color-token-diff-surface: ${surface} !important;
  --color-token-text-primary: ${text} !important;
  --color-token-text-secondary: ${textMuted} !important;
  --color-token-text-tertiary: ${textFaint} !important;
  --color-token-foreground: ${text} !important;
  --color-token-description-foreground: ${textMuted} !important;
  --color-token-border: ${border} !important;
  --color-token-border-default: ${border} !important;
  --color-token-border-light: ${border} !important;
  --color-token-border-heavy: ${borderHeavy} !important;
  --color-token-input-border: ${borderHeavy} !important;
  --color-token-menu-border: ${border} !important;
  --color-token-button-border: ${border} !important;
  --color-token-terminal-border: ${border} !important;
  --color-token-dropdown-background: ${surface} !important;
  --color-token-focus-border: ${rgba(accent, 0.76)} !important;
  --color-text-accent: ${accent} !important;
  --color-background-accent: ${rgba(accent, 0.16)} !important;
}
body, [data-theme], .dark, .light {
  background-color: ${bg} !important;
  color: ${text} !important;
}
a, button:not([disabled]), [role="button"] {
  color: ${accent} !important;
}
/* Codex hardcodes these two surfaces (not token-based) */
aside.app-shell-left-panel {
  background-color: ${surface} !important;
}
div[class*="composer-surface-"] {
  background-color: ${surface} !important;
}
/* Bottom dock pane ships its own hardcoded dark wrapper */
main .app-theme {
  background-color: transparent !important;
}
input, textarea, select, [data-radix-popper-content], .modal, dialog {
  background-color: ${surface} !important;
  border-color: ${border} !important;
  color: ${text} !important;
}
`;
}

// Light themes need extra help: Codex is a dark-only app, so lots of text is
// hard-coded white (or uses tokens we can't reach). lightFixFor() returns the
// dark text colors to flip to, or null for dark themes.
function lightFixFor(colors) {
  if (!colors || colors.length < 3) return null;
  const h = colors[2].replace("#", "");
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  if ((r * 299 + g * 587 + b * 114) / 1000 <= 128) return null;
  const shift = (pct) => {
    const f = (v) => Math.min(255, Math.max(0, v + Math.round(255 * pct)));
    return `rgb(${f(r)},${f(g)},${f(b)})`;
  };
  return { text: shift(-0.86), muted: shift(-0.55) };
}

async function injectTheme(cdp, css, bgBase64, bgMime = "image/webp", bgFilter = "brightness(1.25) saturate(1.1)", themeName = null, lightFix = null) {
  const esc = css.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$/g, "\\$");
  // Wrap in an IIFE: top-level `const` in Runtime.evaluate leaks into the
  // page's global scope, so a second injection in the same session would
  // throw "Identifier already declared" and silently fail.
  let js = `(()=>{
    if(window.__gptskinLightFix){window.__gptskinLightFix.disconnect();window.__gptskinLightFix=null;}
    document.querySelectorAll('[data-gptskin-fix]').forEach(e=>{e.style.removeProperty('color');e.removeAttribute('data-gptskin-fix');});
    document.querySelectorAll('[id^="gptskin-"]').forEach(e=>e.remove());
    document.body.style.removeProperty('background-color');
    const s=document.createElement('style');s.id='gptskin-theme';
    s.textContent=\`${esc}\`;document.head.appendChild(s);`;
  if (bgBase64) {
    // The image sits on body::before. Two gotchas:
    // 1. body's own background-color paints ABOVE a z-index:-1 pseudo-element
    //    (CSS painting order), so body bg must be cleared inline or the image
    //    is fully hidden. Inline !important beats the theme's body rule.
    // 2. Codex's surfaces are opaque; make them translucent (~28% show-through).
    // brightness() lifts dark source images (e.g. space scenes) into visibility.
    js += `document.body.style.setProperty('background-color','transparent','important');
      const b=document.createElement('style');b.id='gptskin-bg';
      b.textContent=\`body::before{content:'';position:fixed;inset:0;z-index:-1;
      background-image:url('data:${bgMime};base64,${bgBase64}');
      background-size:cover;background-position:center;pointer-events:none;
      filter:${bgFilter}}
      main.main-surface,aside.app-shell-left-panel,div[class*="composer-surface-"]{
      background-color:rgba(var(--gptskin-background-rgb),.72)!important}\`;
      document.head.appendChild(b);`;
  }
  // Watermark badge: every user screenshot carries the theme name + domain.
  // This is the organic growth loop — keep it subtle but always visible.
  if (themeName) {
    const label = `\u2726 ${themeName} \u00b7 gptskin.best`;
    js += `const w=document.createElement('div');w.id='gptskin-badge';
      w.textContent='${label.replace(/'/g, "\\'")}';
      w.style.cssText='position:fixed;right:10px;bottom:8px;z-index:2147483647;padding:3px 10px;border-radius:999px;background:rgba(0,0,0,.32);color:rgba(255,255,255,.5);font:12px/1.4 -apple-system,Helvetica,sans-serif;letter-spacing:.02em;pointer-events:none;backdrop-filter:blur(4px)';
      document.body.appendChild(w);`;
  }
  // Light-theme rescue: Codex is a dark-only app with lots of hard-coded
  // white text. Flip near-white text to dark — but only when it sits on a
  // light backdrop, so white-on-accent buttons and dark panes stay white.
  // Fixed elements are tagged and cleaned up on the next inject/remove.
  if (lightFix) {
    js += `(function(){
      var DARK='${lightFix.text}',MUTED='${lightFix.muted}';
      function parseC(c){var m=c&&c.match(/rgba?\\((\\d+)[,\\s]+(\\d+)[,\\s]+(\\d+)(?:[,\\s/]+([\\d.]+))?/);return m?{r:+m[1],g:+m[2],b:+m[3],a:m[4]===undefined?1:+m[4]}:null;}
      function bgDark(el){var cur=el;while(cur&&cur!==document.documentElement){var p=parseC(getComputedStyle(cur).backgroundColor);if(p&&p.a>0.05)return 0.299*p.r+0.587*p.g+0.114*p.b<150;cur=cur.parentElement;}return false;}
      function fix(root){var list=[];if(root.nodeType===1)list.push(root);if(root.querySelectorAll){var all=root.querySelectorAll('*');for(var i=0;i<all.length;i++)list.push(all[i]);}
        var n=0;
        for(var i=0;i<list.length;i++){var el=list[i];if(n>4000)break;
          if(el.id==='gptskin-badge')continue;
          var p=parseC(getComputedStyle(el).color);
          if(!p||p.r<235||p.g<235||p.b<235)continue;
          if(bgDark(el))continue;
          el.style.setProperty('color',p.a>=0.75?DARK:MUTED,'important');
          el.setAttribute('data-gptskin-fix','1');n++;}}
      fix(document.body);
      var obs=new MutationObserver(function(muts){obs.__m=(obs.__m||[]).concat(muts);clearTimeout(obs.__t);obs.__t=setTimeout(function(){var ms=obs.__m;obs.__m=[];for(var i=0;i<ms.length;i++){var an=ms[i].addedNodes;for(var j=0;j<an.length;j++)if(an[j].nodeType===1)fix(an[j]);}},300);});
      obs.observe(document.body,{childList:true,subtree:true});
      window.__gptskinLightFix=obs;
    })();`;
  }
  js += `})()`;
  return cdp.evaluate(js + `,'ok'`);
}

function getPresets() {
  if (!existsSync(PRESETS_DIR)) return [];
  return readdirSync(PRESETS_DIR)
    .filter(f => f.endsWith(".json"))
    .map(f => JSON.parse(readFileSync(join(PRESETS_DIR, f), "utf-8")));
}

// ── Main ──
const args = process.argv.slice(2);
const configStore = createConfigStore();
const themeStore = createThemeStore();
const config = configStore.load();
const client = createApiClient(config);

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
  // Optional bundled background image (preset.background = "bg/xxx.webp")
  let bgBase64 = null, bgMime = "image/webp";
  if (preset.background) {
    const p = join(PRESETS_DIR, preset.background);
    if (!existsSync(p)) { console.log(`❌ Missing background: ${p}`); process.exit(1); }
    if (/\.png$/i.test(p)) bgMime = "image/png";
    else if (/\.jpe?g$/i.test(p)) bgMime = "image/jpeg";
    bgBase64 = readFileSync(p).toString("base64");
  }
  if (!(await ensureCdp())) process.exit(1);
  const cdp = await cdpConnect();
  await injectTheme(cdp, css, bgBase64, bgMime, preset.bgFilter || undefined, preset.name, lightFixFor(preset.colors));
  cdp.close();
  console.log(`✅ Applied: ${preset.name} | Colors: ${preset.colors.join(", ")}${bgBase64 ? " + background" : ""}`);
  // Best-effort usage tracking (no auth required for presets).
  try {
    if (config.apiKey) {
      await client.request("/api/themes/preset-use", {
        method: "POST",
        body: JSON.stringify({ presetId: preset.id }),
      }).catch(() => {});
    }
  } catch {}
}

// === LOCAL PREVIEW (no API key needed) ===

else if (args[0] === "--try" && args[1]) {
  // --try "#accent,#secondary,#bg" [bg-image.(webp|png|jpg)]
  const colors = args[1].split(",").map(s => s.trim());
  if (colors.length !== 3 || colors.some(c => !/^#[0-9a-fA-F]{6}$/.test(c))) {
    console.log(`❌ Usage: --try "#accent,#secondary,#bg" [image.(webp|png|jpg)]`);
    process.exit(1);
  }
  let bgBase64 = null, bgMime = "image/webp";
  if (args[2]) {
    const p = resolve(args[2]);
    if (!existsSync(p)) { console.log(`❌ Not found: ${p}`); process.exit(1); }
    if (/\.png$/i.test(p)) bgMime = "image/png";
    else if (/\.jpe?g$/i.test(p)) bgMime = "image/jpeg";
    bgBase64 = readFileSync(p).toString("base64");
  }
  const css = generateCSS(colors);
  if (!(await ensureCdp())) process.exit(1);
  const cdp = await cdpConnect();
  await injectTheme(cdp, css, bgBase64, bgMime, undefined, null, lightFixFor(colors));
  cdp.close();
  console.log(`✅ Applied local preview | Colors: ${colors.join(", ")}${bgBase64 ? " + background image" : ""}`);
}

// === API KEY CONFIG ===

else if (args[0] === "--key") {
  const candidate = args[1];
  let creditState;
  const saved = await configStore.saveApiKeyIfValid(candidate, async (apiKey) => {
    creditState = await createApiClient({ serverUrl: config.serverUrl, apiKey }).getCredits();
    return true;
  });
  if (saved) console.log(`✅ Configured | Credits: ${creditState.credits}`);
  else {
    console.log("❌ Invalid API key. The existing configuration was not changed.");
    process.exit(1);
  }
}

// === CUSTOM THEMES (needs API key) ===

else if (args[0] === "--check") {
  if (!config.apiKey) { console.log("❌ No API key. Run: --key <your-api-key>\n   Get key: " + config.serverUrl + "/settings/apikeys"); process.exit(1); }
  try {
    const data = await client.getCredits();
    console.log(`Credits: ${data.credits}`);
  } catch (error) {
    console.log(`❌ ${error.message}`);
    process.exit(1);
  }
}

else if (args[0] === "--remove") {
  if (!(await ensureCdp())) process.exit(1);
  const cdp = await cdpConnect();
  await cdp.evaluate(`if(window.__gptskinLightFix){window.__gptskinLightFix.disconnect();window.__gptskinLightFix=null;}document.querySelectorAll('[data-gptskin-fix]').forEach(e=>{e.style.removeProperty('color');e.removeAttribute('data-gptskin-fix');});document.querySelectorAll('[id^="gptskin-"]').forEach(e=>e.remove());document.body.style.removeProperty('background-color');'ok'`);
  cdp.close();
  console.log("✅ Theme removed");
}

else if (args[0] === "--list") {
  const themesById = new Map(themeStore.list().map((theme) => [theme.id, theme]));
  if (config.apiKey) {
    try {
      const data = await client.listThemes();
      for (const theme of data.themes || []) themesById.set(theme.id, { ...theme, ...themesById.get(theme.id) });
    } catch (error) {
      console.log(`⚠️ Cloud themes unavailable: ${error.message}`);
    }
  }
  const themes = [...themesById.values()];
  console.log(formatThemeList(themes));
  for (const theme of themes) console.log(`Apply: node ${process.argv[1]} --apply ${theme.id}`);
}

else if (args[0] === "--apply" && args[1]) {
  const localTheme = themeStore.findById(args[1]);
  if (!localTheme && !config.apiKey) {
    console.log("❌ Theme is not saved locally. Configure an API key to download it from your account.");
    process.exit(1);
  }
  let data;
  try {
    data = await resolveThemeForApply({ id: args[1], store: themeStore, client });
  } catch (error) {
    console.log(`❌ ${error.message}`);
    process.exit(1);
  }
  let backgroundBase64 = data.backgroundBase64 || null;
  if (!backgroundBase64 && data.backgroundPath && existsSync(data.backgroundPath)) {
    backgroundBase64 = readFileSync(data.backgroundPath).toString("base64");
  }
  if (!(await ensureCdp())) process.exit(1);
  const cdp = await cdpConnect();
  await injectTheme(cdp, data.css, backgroundBase64, data.backgroundMime || undefined, undefined, data.name, lightFixFor(data.colors));
  cdp.close();
  console.log(`✅ Applied: ${data.name}`);
}

else if (args[0] === "--image" && args[1]) {
  if (!config.apiKey) {
    console.log(`❌ Custom themes require an account.`);
    console.log(`\n   🆓 Free option: Register at ${config.serverUrl}/sign-up — get 10 bonus Credits toward your first theme`);
    console.log(`   Then get your API key at: ${config.serverUrl}/settings/apikeys`);
    console.log(`   And run: --key <your-api-key>\n`);
    console.log(`   Or try a free preset first: --presets`);
    process.exit(1);
  }
  const imgPath = resolve(args[1]);
  if (!existsSync(imgPath)) { console.log(`❌ Not found: ${imgPath}`); process.exit(1); }
  console.log(`Generating paid theme (${CUSTOM_THEME_CREDITS} Credits)...`);
  let generated;
  try {
    generated = await createPaidTheme({
      client,
      store: themeStore,
      imagePath: imgPath,
      themeName: args[2],
    });
  } catch (error) {
    console.log(`❌ ${error.message}`);
    console.log(`   Top up or manage your key: ${config.serverUrl}/settings/credits`);
    process.exit(1);
  }
  const theme = generated.theme;
  if (generated.recovered) console.log("Recovered the existing paid request with the same Idempotency-Key ✓");
  else console.log(`Credits before charge: ${generated.creditsBefore} ✓`);
  console.log(`Theme: ${theme.name} | Colors: ${theme.colors.join(", ")}`);

  if (!(await ensureCdp())) { console.log("⚠️ Saved locally. Apply later: --apply " + theme.id); process.exit(0); }
  console.log("Applying to Codex...");
  const backgroundBase64 = theme.backgroundPath ? readFileSync(theme.backgroundPath).toString("base64") : null;
  const cdp = await cdpConnect();
  await injectTheme(cdp, theme.css, backgroundBase64, theme.backgroundMime || undefined, undefined, theme.name, lightFixFor(theme.colors));
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
    --image <path> [name]  Generate + apply from image (${CUSTOM_THEME_CREDITS} Credits)
    --apply <id>           Apply a saved theme
    --list                 List your themes
    --check                Check credit balance

  🛠️ Utility:
    --remove               Remove current theme`);
}
