---
name: gptskin-theme
description: Create, apply, remove, and reapply Codex desktop themes on macOS or Windows from a user image, an image Codex generates from natural-language instructions, or a bundled free preset. Use when a user asks to skin, theme, restyle, customize, or change the appearance of Codex, including requests such as "make Codex cyberpunk", "use this image as my Codex theme", "换主题", or "应用皮肤".
---

# GptSkin Theme Manager

Keep the product boundary explicit:

- Use `https://gptskin.best` only for accounts, API keys, Credits, compilation, and durable theme artifacts.
- Generate or receive the source image in Codex, then run the bundled script.
- Apply CSS and the background to the Codex desktop app locally. The website never applies a theme to the device.

## Route the request

1. If the user supplied an image, use the paid image flow.
2. If the user supplied only a visual description, treat natural language only as the interaction trigger. Invoke Codex imagegen to create one local PNG or WebP, then pass that local path to the single paid `--image` flow.
3. Use a free preset only when the user explicitly asks for a preset/free option or names one.
4. If the user only says "change theme", show both choices: free presets or a custom 20-Credit theme.

## Prepare once

Run commands from this skill folder. Install its WebSocket dependency after cloning:

```bash
npm install
```

For a custom theme, have the user create an account and API key:

- Sign up: `https://gptskin.best/sign-up`
- API key: `https://gptskin.best/settings/apikeys`

Do not ask the user to paste a secret key into chat. Ask them to run this locally:

```bash
node scripts/apply-theme.mjs --key <api-key>
```

The script validates the key before saving it and stores valid configuration with mode `0600`.

## Enter the image flow from natural language

1. Restate the visual direction briefly and invoke Codex imagegen to create a local landscape image. Prefer 16:10, low visual noise near the center, and enough contrast for UI overlays.
2. Tell the user that compilation costs exactly 20 Credits and obtain confirmation before the paid command if they have not already approved it.
3. Run:

```bash
node scripts/apply-theme.mjs --check
node scripts/apply-theme.mjs --image /absolute/path/generated-theme.png "Theme Name"
```

The command uploads the image with a verified PNG/JPEG/WebP MIME type and receives an opaque `uploadKey`. It persists that key and a deterministic Idempotency-Key before compilation, so retrying the same image and name after a lost response reuses the original paid request. After completion it fetches the application payload, requires full Codex token CSS, verifies `backgroundSha256`, saves a local reusable copy, and applies it. It does not download the archival ZIP in this flow.

If Codex must restart with local CDP enabled, tell the user and get confirmation before running the apply command.

## Use a supplied image

Use the same paid path without generating another image:

```bash
node scripts/apply-theme.mjs --image /absolute/path/user-image.webp "Theme Name"
```

Never claim success unless the command prints the theme's full ID and confirms application or local saving.

## Reapply a purchased theme

List themes, preserving the complete ID:

```bash
node scripts/apply-theme.mjs --list
node scripts/apply-theme.mjs --apply <full-theme-id>
```

Prefer the local saved artifact. Use the authenticated cloud artifact only when the full ID is not present locally.

## Free presets

```bash
node scripts/apply-theme.mjs --presets
node scripts/apply-theme.mjs --preset aurora-borealis
```

Available presets: `aurora-borealis`, `snow-peak`, `city-lights`, `dark-void`, `sunset-glow`, and `minimal-light` — all with scenic backgrounds.

## Other commands

```text
--try "#accent,#secondary,#background" [image]  Apply a no-charge local preview
--check                                         Check Credit balance
--remove                                        Remove the injected theme
```

On Windows, set `CODEX_APP_PATH` to `Codex.exe` if automatic discovery fails. On macOS, set it to the Codex `.app` path. CDP binds to loopback on a port in the `19100` range; explain that any local process can attempt to connect while it is enabled. Injection proceeds only when one unique loopback page target matches known Codex, ChatGPT, or OpenAI features; otherwise it fails closed.

If a paid request fails after compilation starts, inspect `--list` before retrying so a completed theme is not purchased twice.
