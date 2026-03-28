import {
    WatermarkEngine,
    detectWatermarkConfig,
    calculateWatermarkPosition
} from './core/watermarkEngine.js';
import { WatermarkWorkerClient, canUseWatermarkWorker } from './core/workerClient.js';
import { canvasToBlob } from './core/canvasBlob.js';
import JSZip from 'jszip';
import mediumZoom from 'medium-zoom';

// ─── State ──────────────────────────────────────────────────────────────────
let enginePromise = null;
let workerClient = null;
let imageQueue = [];
let doneCount = 0;
let skippedCount = 0;
let zoom = null;

// ─── DOM refs ────────────────────────────────────────────────────────────────
const uploadArea    = document.getElementById('uploadArea');
const fileInput     = document.getElementById('fileInput');
const singlePreview = document.getElementById('singlePreview');
const multiPreview  = document.getElementById('multiPreview');
const imageList     = document.getElementById('imageList');
const progressBar   = document.getElementById('progressBar');
const downloadAllBtn = document.getElementById('downloadAllBtn');
const resetBtnMulti  = document.getElementById('resetBtnMulti');
const originalImage  = document.getElementById('originalImage');
const processedImage = document.getElementById('processedImage');
const originalInfo   = document.getElementById('originalInfo');
const processedInfo  = document.getElementById('processedInfo');
const singleStatus   = document.getElementById('singleStatus');
const downloadBtn    = document.getElementById('downloadBtn');
const copyBtn        = document.getElementById('copyBtn');
const resetBtn       = document.getElementById('resetBtn');
const loadingOverlay = document.getElementById('loadingOverlay');
const statTotalVal   = document.getElementById('statTotalVal');
const statDoneVal    = document.getElementById('statDoneVal');
const statSkippedVal = document.getElementById('statSkippedVal');
const statSkipped    = document.getElementById('statSkipped');
const themeToggle    = document.getElementById('themeToggle');

// ─── Helpers ─────────────────────────────────────────────────────────────────
function loadImage(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function getEngine() {
    if (!enginePromise) {
        enginePromise = WatermarkEngine.create().catch((err) => {
            enginePromise = null;
            throw err;
        });
    }
    return enginePromise;
}

function disableWorker(reason) {
    if (!workerClient) return;
    console.warn('Worker fallback:', reason);
    workerClient.dispose();
    workerClient = null;
}

async function processImage(file, fallbackImg, options = {}) {
    if (workerClient) {
        try {
            return await workerClient.processBlob(file, options);
        } catch (err) {
            disableWorker(err);
        }
    }
    const engine = await getEngine();
    const canvas = await engine.removeWatermarkFromImage(fallbackImg, options);
    const blob = await canvasToBlob(canvas);
    return { blob, meta: canvas.__watermarkMeta ?? null };
}

function getWatermarkInfo(item) {
    if (!item?.originalImg) return null;
    const { width, height } = item.originalImg;
    const config = detectWatermarkConfig(width, height);
    const position = calculateWatermarkPosition(width, height, config);
    return { size: config.logoSize, position, config };
}

function fmtRes(img) {
    return `${img.width}×${img.height}`;
}

// ─── Dark mode ───────────────────────────────────────────────────────────────
function initTheme() {
    const isDark = localStorage.theme === 'dark' ||
        (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', isDark);
    themeToggle.addEventListener('click', () => {
        const dark = document.documentElement.classList.toggle('dark');
        localStorage.theme = dark ? 'dark' : 'light';
    });
}

// ─── Reset ────────────────────────────────────────────────────────────────────
function reset() {
    imageQueue.forEach(item => {
        if (item.originalUrl) URL.revokeObjectURL(item.originalUrl);
        if (item.processedUrl) URL.revokeObjectURL(item.processedUrl);
    });
    imageQueue = [];
    doneCount = 0;
    skippedCount = 0;
    fileInput.value = '';
    singlePreview.style.display = 'none';
    multiPreview.style.display = 'none';
    downloadAllBtn.style.display = 'none';
    uploadArea.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ─── Stats ────────────────────────────────────────────────────────────────────
function updateStats() {
    statTotalVal.textContent = imageQueue.length;
    statDoneVal.textContent = doneCount;
    statSkippedVal.textContent = skippedCount;
    statSkipped.style.display = skippedCount > 0 ? '' : 'none';

    const pct = imageQueue.length > 0
        ? Math.round(((doneCount + skippedCount) / imageQueue.length) * 100)
        : 0;
    progressBar.style.width = pct + '%';

    if (doneCount > 0) downloadAllBtn.style.display = '';
}

// ─── File handling ────────────────────────────────────────────────────────────
function handleFileSelect(e) {
    handleFiles(Array.from(e.target.files));
}

function handleFiles(files) {
    const valid = files.filter(f =>
        f.type.match('image/(jpeg|png|webp)') && f.size <= 20 * 1024 * 1024
    );
    if (valid.length === 0) return;

    reset();

    imageQueue = valid.map((file, i) => ({
        id: Date.now() + i,
        file,
        name: file.name,
        status: 'pending',
        originalImg: null,
        processedMeta: null,
        processedBlob: null,
        originalUrl: null,
        processedUrl: null,
    }));

    doneCount = 0;
    skippedCount = 0;

    if (valid.length === 1) {
        singlePreview.style.display = 'block';
        multiPreview.style.display = 'none';
        processSingle(imageQueue[0]);
    } else {
        singlePreview.style.display = 'none';
        multiPreview.style.display = 'block';
        imageList.innerHTML = '';
        updateStats();
        imageQueue.forEach(item => createCard(item));
        multiPreview.scrollIntoView({ behavior: 'smooth', block: 'start' });
        processQueue();
    }
}

// ─── Single image ─────────────────────────────────────────────────────────────
async function processSingle(item) {
    try {
        const img = await loadImage(item.file);
        item.originalImg = img;
        originalImage.src = img.src;
        originalInfo.textContent = fmtRes(img);

        singleStatus.innerHTML = '<span class="text-indigo-500 status-processing">Processing…</span>';
        singlePreview.scrollIntoView({ behavior: 'smooth', block: 'start' });

        const result = await processImage(item.file, img);
        item.processedMeta = result.meta;
        item.processedBlob = result.blob;
        item.processedUrl = URL.createObjectURL(result.blob);

        processedImage.src = item.processedUrl;
        processedImage.style.width = img.width + 'px';

        document.getElementById('processedOverlay').style.display = 'block';
        document.getElementById('sliderHandle').style.display = 'flex';
        processedInfo.style.display = '';

        const applied = result.meta?.applied !== false;
        const wInfo = getWatermarkInfo(item);
        originalInfo.textContent = fmtRes(img);
        processedInfo.textContent = applied && wInfo
            ? `Watermark removed (${wInfo.size}×${wInfo.size})`
            : 'No watermark detected';

        singleStatus.innerHTML = applied
            ? `<span class="text-emerald-600 dark:text-emerald-400 font-medium">✓ Watermark removed</span><br><span class="text-gray-400 text-xs">at (${result.meta.position.x}, ${result.meta.position.y}), ${wInfo?.size}×${wInfo?.size}px</span>`
            : `<span class="text-amber-600 dark:text-amber-400 font-medium">No watermark detected</span>`;

        copyBtn.style.display = 'flex';
        downloadBtn.style.display = 'flex';
        copyBtn.onclick = () => copyToClipboard(item, copyBtn);
        downloadBtn.onclick = () => downloadSingle(item);
    } catch (err) {
        singleStatus.innerHTML = `<span class="text-red-500">Error: ${err.message}</span>`;
        console.error(err);
    }
}

// ─── Multi image ──────────────────────────────────────────────────────────────
function createCard(item) {
    const el = document.createElement('div');
    el.id = `card-${item.id}`;
    el.className = 'flex items-center gap-3 bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 px-4 py-3 shadow-sm transition-colors';
    el.innerHTML = `
        <div class="w-12 h-12 flex-shrink-0 bg-gray-50 dark:bg-gray-800 rounded-lg overflow-hidden flex items-center justify-center">
            <img id="thumb-${item.id}" class="w-full h-full object-contain" data-zoomable src="" alt="" />
        </div>
        <div class="flex-1 min-w-0">
            <p class="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">${item.name}</p>
            <p id="cardRes-${item.id}" class="text-xs text-gray-400 mt-0.5"></p>
        </div>
        <div id="cardStatus-${item.id}" class="flex-shrink-0 flex items-center gap-2">
            <span class="text-xs text-gray-400">Pending</span>
        </div>
        <div class="flex-shrink-0 flex items-center gap-1.5" id="cardActions-${item.id}"></div>
    `;
    imageList.appendChild(el);
}

function setCardStatus(id, html) {
    const el = document.getElementById(`cardStatus-${id}`);
    if (el) el.innerHTML = html;
}

function setCardActions(id, html) {
    const el = document.getElementById(`cardActions-${id}`);
    if (el) el.innerHTML = html;
}

function setCardRes(id, text) {
    const el = document.getElementById(`cardRes-${id}`);
    if (el) el.textContent = text;
}

async function processQueue() {
    // Pre-load all thumbnails first
    await Promise.all(imageQueue.map(async item => {
        const img = await loadImage(item.file);
        item.originalImg = img;
        item.originalUrl = img.src;
        const thumb = document.getElementById(`thumb-${item.id}`);
        if (thumb) {
            thumb.src = img.src;
            zoom.attach(`#thumb-${item.id}`);
        }
        setCardRes(item.id, fmtRes(img));
    }));

    const CONCURRENCY = 4;
    for (let i = 0; i < imageQueue.length; i += CONCURRENCY) {
        await Promise.all(imageQueue.slice(i, i + CONCURRENCY).map(async item => {
            if (item.status !== 'pending') return;
            item.status = 'processing';
            setCardStatus(item.id,
                `<span class="inline-flex items-center gap-1 text-xs text-indigo-500 font-medium">
                    <span class="w-1.5 h-1.5 rounded-full bg-indigo-500 status-processing"></span> Processing
                </span>`
            );

            try {
                const result = await processImage(item.file, item.originalImg);
                item.processedMeta = result.meta;
                item.processedBlob = result.blob;
                item.processedUrl = URL.createObjectURL(result.blob);

                const thumb = document.getElementById(`thumb-${item.id}`);
                if (thumb) thumb.src = item.processedUrl;

                item.status = 'done';
                const applied = result.meta?.applied !== false;

                if (applied) {
                    doneCount++;
                    setCardStatus(item.id,
                        `<span class="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium bg-emerald-50 dark:bg-emerald-950/30 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg> Removed
                        </span>`
                    );
                } else {
                    skippedCount++;
                    setCardStatus(item.id,
                        `<span class="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 font-medium bg-amber-50 dark:bg-amber-950/30 px-2 py-0.5 rounded-full border border-amber-200 dark:border-amber-800">
                            No watermark
                        </span>`
                    );
                }

                setCardActions(item.id, `
                    <button onclick="window._copyCard(${item.id}, this)" class="p-1.5 text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors" title="Copy to clipboard">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
                    </button>
                    <button onclick="window._downloadCard(${item.id})" class="p-1.5 text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors" title="Download">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                    </button>
                `);

                updateStats();
            } catch (err) {
                item.status = 'error';
                setCardStatus(item.id, `<span class="text-xs text-red-500">Error</span>`);
                console.error(item.name, err);
            }
        }));
    }
}

// ─── Download ─────────────────────────────────────────────────────────────────
function downloadSingle(item) {
    const a = document.createElement('a');
    a.href = item.processedUrl;
    a.download = `unwatermarked_${item.name.replace(/\.[^.]+$/, '')}.png`;
    a.click();
}

async function downloadAll() {
    const ready = imageQueue.filter(i => i.processedBlob);
    if (ready.length === 0) return;
    const zip = new JSZip();
    ready.forEach(item => {
        zip.file(`unwatermarked_${item.name.replace(/\.[^.]+$/, '')}.png`, item.processedBlob);
    });
    const blob = await zip.generateAsync({ type: 'blob' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `gemini-unwatermarked-${Date.now()}.zip`;
    a.click();
}

async function copyToClipboard(item, btn) {
    if (!navigator.clipboard || !window.ClipboardItem) return;
    try {
        await navigator.clipboard.write([new ClipboardItem({ [item.processedBlob.type]: item.processedBlob })]);
        const origHTML = btn.innerHTML;
        btn.innerHTML = '<svg class="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>';
        setTimeout(() => { btn.innerHTML = origHTML; }, 2000);
    } catch { }
}

// Expose for inline onclick handlers in cards
window._copyCard = (id, btn) => {
    const item = imageQueue.find(i => i.id === id);
    if (item) copyToClipboard(item, btn);
};
window._downloadCard = (id) => {
    const item = imageQueue.find(i => i.id === id);
    if (item) downloadSingle(item);
};

// ─── Comparison slider ────────────────────────────────────────────────────────
function initSlider() {
    const container = document.getElementById('comparisonContainer');
    const overlay   = document.getElementById('processedOverlay');
    const handle    = document.getElementById('sliderHandle');
    let active = false;

    function move(e) {
        if (!active) return;
        const rect = container.getBoundingClientRect();
        const clientX = e.clientX ?? e.touches?.[0]?.clientX;
        if (clientX === undefined) return;
        const pct = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1) * 100;
        overlay.style.width = pct + '%';
        handle.style.left = pct + '%';
    }

    container.addEventListener('mousedown', (e) => { active = true; move(e); });
    window.addEventListener('mouseup', () => { active = false; });
    window.addEventListener('mousemove', move);
    container.addEventListener('touchstart', (e) => { active = true; move(e); }, { passive: true });
    window.addEventListener('touchend', () => { active = false; });
    window.addEventListener('touchmove', move, { passive: true });
}

// ─── Drag & drop ──────────────────────────────────────────────────────────────
function initDragDrop() {
    document.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('drop-zone-active');
    });
    document.addEventListener('dragleave', (e) => {
        if (e.clientX === 0 && e.clientY === 0)
            uploadArea.classList.remove('drop-zone-active');
    });
    document.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('drop-zone-active');
        if (e.dataTransfer.files?.length) handleFiles(Array.from(e.dataTransfer.files));
    });
    document.addEventListener('paste', (e) => {
        const files = Array.from(e.clipboardData.items)
            .filter(i => i.kind === 'file' && i.type.startsWith('image/'))
            .map(i => i.getAsFile());
        if (files.length) handleFiles(files);
    });
}

// ─── Init ─────────────────────────────────────────────────────────────────────
async function init() {
    initTheme();
    initDragDrop();
    initSlider();

    loadingOverlay.style.display = 'flex';

    if (canUseWatermarkWorker()) {
        try {
            workerClient = new WatermarkWorkerClient({ workerUrl: './workers/watermark-worker.js' });
        } catch { workerClient = null; }
    }

    if (!workerClient) {
        getEngine().catch(() => { });
    }

    loadingOverlay.style.display = 'none';
    document.body.classList.remove('loading');

    zoom = mediumZoom('[data-zoomable]', {
        margin: 24,
        background: 'rgba(0,0,0,0.7)',
        scrollOffset: 0,
    });

    // uploadArea.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileSelect);
    downloadAllBtn.addEventListener('click', downloadAll);
    resetBtn.addEventListener('click', reset);
    resetBtnMulti.addEventListener('click', reset);
    window.addEventListener('beforeunload', () => disableWorker('unload'));
}

init();
