# 🎨 GptSkin — Theme Manager for Codex

Beautiful themes for your Codex desktop workspace. Free presets + custom AI-generated themes.

## Quick Install

```bash
# Clone into Codex skills directory
git clone https://github.com/WendongAI/gptskin-skill.git ~/.codex/skills/gptskin-theme
```

Or manually copy the `gptskin-theme` folder to `~/.codex/skills/`.

## Free Presets (No Account Needed)

6 built-in themes, zero setup:

```bash
# List all presets
node ~/.codex/skills/gptskin-theme/scripts/apply-theme.mjs --presets

# Apply one
node ~/.codex/skills/gptskin-theme/scripts/apply-theme.mjs --preset dark-void
```

| Preset | Style |
|--------|-------|
| `dark-void` | Deep dark with purple accents |
| `sunset-glow` | Warm orange and pink |
| `ocean-breeze` | Cool blues and teals |
| `forest-night` | Natural green on dark |
| `neon-cyber` | Cyberpunk neon pink and cyan |
| `minimal-light` | Clean minimal light |

## Custom Themes (Free to Start)

Generate themes from any image:

1. Register at [gptskin.vercel.app](https://gptskin.vercel.app/sign-up) — **free 10 Credits** (0.5 themes)
2. Get API Key at [gptskin.vercel.app/settings/apikeys](https://gptskin.vercel.app/settings/apikeys)
3. Configure:
   ```bash
   node ~/.codex/skills/gptskin-theme/scripts/apply-theme.mjs --key sk-your-key
   ```
4. Generate:
   ```bash
   node ~/.codex/skills/gptskin-theme/scripts/apply-theme.mjs --image ~/Desktop/photo.jpg "My Theme"
   ```

## Usage in Codex

Just talk to Codex naturally:

- "换个暗黑主题" → applies `dark-void`
- "I want sunset colors" → applies `sunset-glow`
- "用 ~/Desktop/wallpaper.jpg 做个主题" → generates custom theme

## Commands

```
--presets              List free preset themes
--preset <name>        Apply a free preset
--key <api-key>        Save API key (one-time)
--image <path> [name]  Generate custom theme from image
--apply <theme-id>     Apply a saved theme
--list                 List your themes
--check                Check credit balance
--remove               Remove current theme
```

## Pricing

| Pack | Price | Credits | Themes |
|------|-------|---------|--------|
| Free signup | $0 | 30 | 3 themes |
| Starter | $4.9 | 100 | 10 themes |
| Pro | $12.9 | 350 | 35 themes |
| Studio | $29.9 | 1,000 | 100 themes |

Credits never expire. One-time purchase, no subscription.

## How It Works

1. Preset themes: CSS generated locally, injected via Chrome DevTools Protocol
2. Custom themes: Image uploaded → AI extracts colors → CSS generated → injected into Codex
3. Codex must be running with `--remote-debugging-port=9223` (script handles this automatically)

## License

MIT
