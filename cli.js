/**
 * CLI entry point for bulk Gemini watermark removal.
 *
 * Usage (after build):
 *   node dist/cli.js --input ./images --output ./cleaned
 *   node dist/cli.js --input ./images           (output defaults to ./output)
 *   node dist/cli.js img1.jpg img2.png --output ./cleaned
 *
 * Run build first:
 *   node build.js --prod
 */

import { createCanvas, loadImage } from '@napi-rs/canvas';
import { parseArgs } from 'node:util';
import { readdir, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname, basename, resolve } from 'node:path';

// ── Canvas polyfill (must happen before engine is used) ─────────────────────
// watermarkEngine.js uses OffscreenCanvas & document.createElement('canvas').
// These checks happen lazily inside function bodies, so assigning after
// the static imports is fine.
globalThis.OffscreenCanvas = createCanvas;

// ── Engine (static imports are hoisted, but canvas calls are lazy) ──────────
// esbuild inlines bg_48.png / bg_96.png as data URLs via the dataurl loader.
import { WatermarkEngine } from './src/core/watermarkEngine.js';
import BG_48_PATH from './src/assets/bg_48.png';
import BG_96_PATH from './src/assets/bg_96.png';

// ── Constants ────────────────────────────────────────────────────────────────
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const CONCURRENCY = 4;

// ── ANSI colours ─────────────────────────────────────────────────────────────
const c = {
    reset:  '\x1b[0m',
    dim:    '\x1b[2m',
    green:  '\x1b[32m',
    yellow: '\x1b[33m',
    red:    '\x1b[31m',
    cyan:   '\x1b[36m',
    bold:   '\x1b[1m',
};

function pad(n, total) { return String(n).padStart(String(total).length, ' '); }

// ── Helpers ───────────────────────────────────────────────────────────────────
async function collectInputFiles(inputDir, extraFiles) {
    const files = [...extraFiles];
    if (inputDir) {
        const entries = await readdir(inputDir, { withFileTypes: true });
        for (const e of entries) {
            if (e.isFile() && IMAGE_EXTS.has(extname(e.name).toLowerCase())) {
                files.push(join(inputDir, e.name));
            }
        }
    }
    return [...new Set(files.map(f => resolve(f)))];
}

async function processFile(engine, filePath, outputDir, idx, total) {
    const name = basename(filePath);
    const prefix = `${c.dim}[${pad(idx + 1, total)}/${total}]${c.reset} ${name}`;

    let image;
    try {
        image = await loadImage(filePath);
    } catch (err) {
        console.log(`${prefix} ${c.red}✗ failed to load${c.reset} — ${err.message}`);
        return 'error';
    }

    let canvas;
    try {
        canvas = await engine.removeWatermarkFromImage(image);
    } catch (err) {
        console.log(`${prefix} ${c.red}✗ engine error${c.reset} — ${err.message}`);
        return 'error';
    }

    const meta = canvas.__watermarkMeta;
    const applied = meta?.applied !== false;

    const outName = `unwatermarked_${basename(filePath, extname(filePath))}.png`;
    const outPath = join(outputDir, outName);

    try {
        const buffer = await canvas.encode('png');
        await writeFile(outPath, buffer);
    } catch (err) {
        console.log(`${prefix} ${c.red}✗ save error${c.reset} — ${err.message}`);
        return 'error';
    }

    if (applied) {
        const pos = meta?.position;
        const detail = pos ? ` ${c.dim}(${meta.size}×${meta.size} @ ${pos.x},${pos.y})${c.reset}` : '';
        console.log(`${prefix} ${c.green}✓ watermark removed${c.reset}${detail}`);
        return 'done';
    } else {
        console.log(`${prefix} ${c.yellow}– no watermark detected${c.reset}`);
        return 'skipped';
    }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
    const { values, positionals } = parseArgs({
        args: process.argv.slice(2),
        options: {
            input:  { type: 'string',  short: 'i' },
            output: { type: 'string',  short: 'o', default: './output' },
            help:   { type: 'boolean', short: 'h', default: false },
        },
        allowPositionals: true,
        strict: false,
    });

    if (values.help) {
        console.log(`
${c.bold}Bulk Gemini Watermark Remover — CLI${c.reset}

Usage:
  node dist/cli.js [options] [files...]

Options:
  -i, --input  <dir>    Input directory containing images
  -o, --output <dir>    Output directory (default: ./output)
  -h, --help            Show this help

Examples:
  node dist/cli.js --input ./screenshots --output ./cleaned
  node dist/cli.js img1.jpg img2.png --output ./cleaned
  node dist/cli.js --input ./images
`);
        process.exit(0);
    }

    const inputFiles = await collectInputFiles(values.input, positionals);
    if (inputFiles.length === 0) {
        console.error(`${c.red}No image files found.${c.reset} Use --input <dir> or pass file paths.`);
        process.exit(1);
    }

    const outputDir = resolve(values.output);
    if (!existsSync(outputDir)) await mkdir(outputDir, { recursive: true });

    console.log(`\n${c.bold}Bulk Gemini Watermark Remover${c.reset}`);
    console.log(`${c.dim}Input:${c.reset}  ${inputFiles.length} image${inputFiles.length !== 1 ? 's' : ''}`);
    console.log(`${c.dim}Output:${c.reset} ${outputDir}\n`);

    // Initialise engine once — loads bg captures using @napi-rs/canvas
    process.stdout.write('Initialising engine… ');
    const [bg48, bg96] = await Promise.all([
        loadImage(BG_48_PATH),
        loadImage(BG_96_PATH),
    ]);
    const engine = new WatermarkEngine({ bg48, bg96 });
    console.log(`${c.green}ready${c.reset}\n`);

    // Process files in batches of CONCURRENCY
    let done = 0, skipped = 0, errors = 0;
    for (let i = 0; i < inputFiles.length; i += CONCURRENCY) {
        const batch = inputFiles.slice(i, i + CONCURRENCY);
        const results = await Promise.all(
            batch.map((f, j) => processFile(engine, f, outputDir, i + j, inputFiles.length))
        );
        for (const r of results) {
            if (r === 'done')    done++;
            else if (r === 'skipped') skipped++;
            else                 errors++;
        }
    }

    console.log(`\n${c.bold}Done${c.reset} — ${c.green}${done} removed${c.reset}, ${c.yellow}${skipped} no watermark${c.reset}, ${errors > 0 ? c.red : ''}${errors} error${errors !== 1 ? 's' : ''}${c.reset}`);
    console.log(`${c.dim}Saved to: ${outputDir}${c.reset}\n`);
}

main().catch(err => {
    console.error(`\n${c.red}Fatal error:${c.reset}`, err.message);
    process.exit(1);
});
