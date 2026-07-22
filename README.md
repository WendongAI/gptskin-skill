# 🎨 GptSkin — Theme Manager for Codex

Beautiful themes for your Codex desktop workspace. Free presets + custom image-backed themes.

## Quick Install

```bash
# Clone into Codex skills directory
git clone https://github.com/WendongAI/gptskin-skill.git ~/.codex/skills/gptskin-theme
cd ~/.codex/skills/gptskin-theme
npm install
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
| `aurora-borealis` | Aurora landscape with green and violet |
| `snow-peak` | Calm alpine light |
| `city-lights` | Neon city at night |
| `minimal-light` | Clean minimal light |

## Custom Themes

Each custom theme costs **20 Credits**. Generate one from your image or describe a visual direction in one sentence and let Codex create the source image first:

1. Register at [gptskin.best](https://gptskin.best/sign-up) — the 10-Credit signup bonus counts toward the first theme
2. Get API Key at [gptskin.best/settings/apikeys](https://gptskin.best/settings/apikeys)
3. Configure it in your own terminal so the key is not pasted into chat:
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
- "Make Codex feel like a quiet neon Tokyo night" → Codex generates a local image, then runs the same paid `--image` flow

For custom prose, image generation happens in Codex. GptSkin's website handles the account, Credits, compilation, and durable artifacts; this Skill applies the resulting theme locally to the Codex desktop app.

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

`--list` prints the complete theme ID. Copy that exact ID into `--apply`; locally saved themes can be reapplied without downloading them again.

## Pricing

| Pack | Price | Credits |
|------|-------|---------|
| Signup bonus | $0 | 10 (valid 30 days) |
| Starter | $9.9 | 100 |
| Pro | $19.9 | 500 |
| Studio | $49 | 1,500 |

Each custom theme costs 20 Credits. Paid credits never expire. One-time purchase, no subscription.

## How It Works

1. Preset themes: CSS generated locally and injected through Chrome DevTools Protocol (CDP)
2. Custom themes: local image → authenticated `uploadKey` → one stable Idempotency-Key → 20-Credit compile → verified CSS/background SHA → local saved copy → local application
3. The website never applies a theme to your computer
4. The script supports macOS and Windows and launches Codex with a loopback CDP port in the `19100` range

If a network response is lost, rerun the same image path and theme name. The persisted request identity lets the server return the original result without a second charge. The normal apply path does not download the archival ZIP.

If app discovery fails, set `CODEX_APP_PATH` to the Codex `.app` path on macOS or to `Codex.exe` on Windows. Because local CDP can be reached by other processes on the same computer while enabled, only run the Skill on a trusted machine. The injector accepts only one uniquely identified Codex/ChatGPT/OpenAI page with a loopback WebSocket; ambiguous or unrelated Electron pages are rejected.

## License

MIT
