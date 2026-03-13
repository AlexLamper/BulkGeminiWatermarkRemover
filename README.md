# Bulk Gemini Watermark Remover

> **Attribution notice:** The core watermark removal engine in this project was **not created by me**. All credit for the original algorithm and implementation goes to the authors of [gemini-watermark-remover](https://github.com/GargantuaX/gemini-watermark-remover) - see [Credits](#credits) below.

A bulk-focused web UI and CLI tool for removing watermarks from Google Gemini AI-generated images. Drop in dozens of images at once and download them clean - everything runs locally in your browser, meaning nothing is uploaded to the cloud. Therefore it's also very fast.

---

## Legal Disclaimer

This tool is provided for **personal and educational use only**.

Removing watermarks may have legal implications depending on your jurisdiction and how you intend to use the resulting images. You are solely responsible for ensuring your use of this tool complies with applicable laws, terms of service, and intellectual property rights.

The author does not condone or encourage the misuse of this tool for copyright infringement, misrepresentation, or any other unlawful purpose.

> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY CLAIM, DAMAGES, OR OTHER LIABILITY ARISING FROM THE USE OF THIS SOFTWARE.

---

## What this adds on top of the original

- **Bulk Web UI** — drag & drop multiple images, live progress cards, download all as ZIP
- **Node.js CLI** — process entire folders from the command line
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

The watermark removal uses **reverse alpha blending** - a mathematical technique that recovers the exact original pixels without any AI or guessing. The method and calibrated watermark masks were originally developed by Allen Kuo ([@allenk](https://github.com/allenk)). A detailed write-up is available here:

> [Removing Gemini AI Watermarks: A Deep Dive into Reverse Alpha Blending](https://allenkuo.medium.com/removing-gemini-ai-watermarks-a-deep-dive-into-reverse-alpha-blending-bbbd83af2a3f)

---

## Credits

I don't own ANY of this work, and don't claim any right to the original watermark removal engine, algorithm, and core implementation:

| | |
|---|---|
| **Repository** | https://github.com/GargantuaX/gemini-watermark-remover |
| **Authors** | Jad (2025), AllenK / Kwyshell (2024) |
| **License** | MIT |

The reverse alpha blending method and calibrated watermark masks are based on the original work by **AllenK (Kwyshell)**, © 2024, licensed under MIT. This project copies and builds on top of the source code from that repository. The core files under `src/core/`, `src/workers/`, and `src/assets/` are taken directly from the original without modification.

---

## Disclaimer

> **USE AT YOUR OWN RISK**

This tool modifies image files. While it is designed to work reliably, unexpected results may occur due to:

- Variations in Gemini's watermark implementation across image types or sizes
- Corrupted or unusual image formats
- Edge cases not covered by the original testing

The author assumes no responsibility for any data loss, image corruption, or unintended modifications. By using this tool, you acknowledge that you understand these risks.

**Note:** If you experience processing errors in the browser, try disabling any canvas fingerprinting protection extensions (e.g. Canvas Fingerprint Defender) - these can interfere with the canvas-based image processing. See [issue #3](https://github.com/GargantuaX/gemini-watermark-remover/issues/3).

---

## License

MIT - see [LICENSE](./LICENSE).

The original copyright notices from [gemini-watermark-remover](https://github.com/GargantuaX/gemini-watermark-remover) are preserved in the LICENSE file and must remain in any copies or derivatives.
