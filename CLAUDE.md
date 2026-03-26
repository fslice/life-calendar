# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Birthday countdown wallpaper generator deployed on Vercel. Users enter their birthday on a landing page, get a unique URL, and set up an iOS Shortcut to auto-update their iPhone lock screen daily with a snake-shaped progress bar counting down to their next birthday.

## Architecture

- **`life-calendar-clean/`** — all source code lives here
  - **`public/index.html`** — static landing page (vanilla HTML/CSS/JS). Collects birthday input and generates the wallpaper API URL. Also shows iPhone Shortcuts setup instructions.
  - **`api/wallpaper.jsx`** — Vercel Edge Function that generates the wallpaper image. Uses `@vercel/og` (Satori) to render JSX to a 1170×2532 PNG (iPhone resolution). Computes days remaining, builds a snake-grid layout of small colored blocks, and overlays countdown text at the bottom.
  - **`fonts/`** — IBM Plex Mono font files (400 and 500 weights) loaded at runtime by the edge function.

## Key Technical Details

- The API endpoint is `GET /api/wallpaper?birthday=YYYY-MM-DD`. It returns a PNG image with 1-hour cache headers.
- The snake grid uses a boustrophedon (alternating left-right) layout. Each row has `snakeH=3` vertical connector segments. Grid parameters (segment size, gap, margins) are hardcoded in `wallpaper.jsx`.
- Color scheme: `#E8593C` (coral red) for elapsed days, `#e0dbd4` for remaining days, `#f5f2ed` background.
- Fonts are fetched at module level (outside the handler) for reuse across invocations.

## Development

```bash
cd life-calendar-clean
npm install
npx vercel dev    # local dev server with edge function support
```

No build step, test suite, or linter is configured.
