# Bulk Gemini Watermark Remover

> **Attribution notice:** The core watermark removal engine in this project was **not created by me**. All credit for the original algorithm and implementation goes to the authors of [gemini-watermark-remover](https://github.com/GargantuaX/gemini-watermark-remover) — see [Credits](#credits) below.

A bulk-focused web UI and CLI tool for removing watermarks from Google Gemini AI-generated images. Drop in dozens of images at once and download them clean — everything runs locally in your browser, nothing is uploaded.

---

## What this adds on top of the original

- **Bulk Web UI** — drag & drop multiple images, live progress cards, download all as ZIP
- **Node.js CLI** — process entire folders from the command line
- Indigo-themed, English-only interface
- Parallel processing (4 images at a time in browser, 4 concurrent in CLI)

---

## Quick start

### Web UI

```bash
npm install
node build.js           # starts dev server at http://localhost:4173
```

Drop images onto the page. Works in any modern browser. For production:

```bash
node build.js --prod    # builds to dist/
npx serve dist          # serve dist/ with any static server
```

### CLI

```bash
node build.js --prod                                           # build first
node dist/cli.js --input ./images --output ./cleaned          # process a folder
node dist/cli.js img1.jpg img2.png --output ./cleaned         # specific files
node dist/cli.js --help
```

**Requirements:** Node.js 18+, `@napi-rs/canvas` (installed via `npm install`).

---

## How it works

The watermark removal uses **reverse alpha blending** — a mathematical technique that recovers the exact original pixels without any AI or guessing. A detailed write-up by the original author is available here:

> [Removing Gemini AI Watermarks: A Deep Dive into Reverse Alpha Blending](https://allenkuo.medium.com/removing-gemini-ai-watermarks-a-deep-dive-into-reverse-alpha-blending-bbbd83af2a3f)

---

## Credits

Original watermark removal engine, algorithm, and core implementation:

| | |
|---|---|
| **Repository** | https://github.com/GargantuaX/gemini-watermark-remover |
| **Authors** | Jad (2025), AllenK / Kwyshell (2024) |
| **License** | MIT |

This project copies and builds on top of the source code from that repository. The core files under `src/core/`, `src/workers/`, and `src/assets/` are taken directly from the original without modification.

---

## License

MIT — see [LICENSE](./LICENSE).

The original copyright notices from [gemini-watermark-remover](https://github.com/GargantuaX/gemini-watermark-remover) are preserved in the LICENSE file and must remain in any copies or derivatives.
