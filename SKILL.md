---
name: gptskin-theme
description: |
  GptSkin: beautiful themes for Codex workspace.
  FREE: 6 built-in preset themes — zero setup needed.
  PAID: Custom themes from any image — free registration gives 10 Credits.
  Trigger: user asks to change theme, apply theme, generate theme, customize Codex,
  "换主题", "应用主题", "主题", "dark mode", "sunset", "ocean", "make Codex look better".
  Smart detection: if user sends a message starting with "sk-" → auto-save as API key.
allowed-tools:
  - Bash
---

# GptSkin — Codex Theme Manager

## Script location

```
~/.codex/skills/gptskin-theme/scripts/apply-theme.mjs
```

## Decision flow

1. User provides image path → custom theme (needs API key)
2. User asks for style/mood → match to free preset
3. User says "change theme" → show presets, let choose
4. User sends "sk-xxx" → auto-save as API key

## Step-by-step interaction

### When user asks for a theme without image:

Show available free presets and apply the best match:

```bash
node ~/.codex/skills/gptskin-theme/scripts/apply-theme.mjs --presets
node ~/.codex/skills/gptskin-theme/scripts/apply-theme.mjs --preset <best-match>
```

Presets: dark-void, sunset-glow, ocean-breeze, forest-night, neon-cyber, minimal-light

### When user provides an image path:

1. Check if API key exists (run --check)
2. If no key, tell user:
   "自定义主题需要 GptSkin 账号，注册免费送 10 Credits。
   👉 注册: https://gptskin.vercel.app/sign-up
   注册后获取 API Key: https://gptskin.vercel.app/settings/apikeys
   把 API Key 发给我就行。"
3. When user sends "sk-xxx" → save key:
   ```bash
   node ~/.codex/skills/gptskin-theme/scripts/apply-theme.mjs --key <api-key>
   ```
4. Then generate:
   ```bash
   node ~/.codex/skills/gptskin-theme/scripts/apply-theme.mjs --image /path/to/photo.jpg "Theme Name"
   ```

### When user sends a message starting with "sk-":

Auto-detect and save:
```bash
node ~/.codex/skills/gptskin-theme/scripts/apply-theme.mjs --key <the-key>
```

## All commands

```bash
--presets              List free preset themes
--preset <name>        Apply a free preset (no account needed)
--key <api-key>        Save API key (one-time)
--image <path> [name]  Generate custom theme from image
--apply <theme-id>     Apply a saved custom theme
--list                 List saved custom themes
--check                Check credit balance
--remove               Remove current theme
```
