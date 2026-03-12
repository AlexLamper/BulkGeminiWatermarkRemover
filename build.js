import * as esbuild from 'esbuild';
import { cpSync, rmSync, existsSync, mkdirSync, watch, statSync, createReadStream } from 'node:fs';
import { createServer } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { extname, join, normalize, resolve } from 'node:path';

const isProd = process.env.NODE_ENV === 'production' || process.argv.includes('--prod');

const copyAssetsPlugin = {
    name: 'copy-assets',
    setup(build) {
        build.onEnd(() => {
            try {
                cpSync('public', 'dist', { recursive: true });
            } catch (err) {
                console.error('Asset copy failed:', err);
            }
        });
    },
};

const commonConfig = {
    bundle: true,
    loader: { '.png': 'dataurl' },
    minify: isProd,
    logLevel: 'info',
};

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
};

const findAvailablePort = (startPort) => new Promise((res, rej) => {
    const tryPort = (port, remaining) => {
        const probe = createNetServer();
        probe.once('error', (err) => {
            probe.close();
            if (err.code === 'EADDRINUSE' && remaining > 0) return tryPort(port + 1, remaining - 1);
            rej(err);
        });
        probe.once('listening', () => probe.close(() => res(port)));
        probe.listen(port);
    };
    tryPort(startPort, 20);
});

async function serveDevDist(rootDir = 'dist', defaultPort = 4173) {
    const distRoot = resolve(rootDir);
    const port = await findAvailablePort(Number(process.env.PORT || defaultPort));

    const server = createServer((req, res) => {
        let urlPath = '/';
        try { urlPath = decodeURIComponent((req.url || '/').split('?')[0]); } catch {
            res.writeHead(400); res.end('Bad Request'); return;
        }
        const requestPath = urlPath === '/' ? '/index.html' : urlPath;
        const fsPath = resolve(join(distRoot, normalize(requestPath)));

        if (!fsPath.startsWith(distRoot)) { res.writeHead(403); res.end('Forbidden'); return; }

        const ext = extname(fsPath).toLowerCase();
        const isSpaRoute = ext === '';
        let targetPath = fsPath;
        const targetExists = existsSync(targetPath);
        const targetIsDir = targetExists && statSync(targetPath).isDirectory();
        if ((!targetExists || targetIsDir) && isSpaRoute) targetPath = resolve(join(distRoot, 'index.html'));
        if (!existsSync(targetPath)) { res.writeHead(404); res.end('Not Found'); return; }

        res.writeHead(200, { 'Content-Type': MIME_TYPES[extname(targetPath).toLowerCase()] || 'application/octet-stream' });
        createReadStream(targetPath).pipe(res);
    });

    server.listen(port, () => console.log(`Dev server: http://localhost:${port}`));
    const shutdown = () => server.close(() => process.exit(0));
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}

console.log(`Building [${isProd ? 'PRODUCTION' : 'DEVELOPMENT'}]...`);

if (existsSync('dist')) rmSync('dist', { recursive: true });
mkdirSync('dist/workers', { recursive: true });

// Web app
const webCtx = await esbuild.context({
    ...commonConfig,
    entryPoints: ['src/app.js'],
    outfile: 'dist/app.js',
    platform: 'browser',
    target: ['es2020'],
    sourcemap: !isProd,
    plugins: [copyAssetsPlugin],
});

// Web worker
const workerCtx = await esbuild.context({
    ...commonConfig,
    entryPoints: ['src/workers/watermarkWorker.js'],
    outfile: 'dist/workers/watermark-worker.js',
    platform: 'browser',
    format: 'esm',
    target: ['es2020'],
    sourcemap: !isProd,
});

// CLI (Node.js bundle)
await esbuild.build({
    ...commonConfig,
    entryPoints: ['cli.js'],
    outfile: 'dist/cli.js',
    platform: 'node',
    format: 'esm',
    target: ['node18'],
    external: ['@napi-rs/canvas'],
    minify: false,
    sourcemap: false,
});
console.log('CLI build complete: dist/cli.js');

if (isProd) {
    await Promise.all([webCtx.rebuild(), workerCtx.rebuild()]);
    console.log('Build complete!');
    process.exit(0);
} else {
    await Promise.all([webCtx.watch(), workerCtx.watch()]);
    watch('public', { recursive: true }, () => {
        try { cpSync('public', 'dist', { recursive: true }); } catch { }
    });
    await serveDevDist('dist');
    console.log('Watching for changes...');
}
