'use strict';

/* ═══════════════════════════════════════════════════════════════════════════
   app.js — main controller for lmadmin Log Viewer
   ═══════════════════════════════════════════════════════════════════════════ */

// ── Defaults ─────────────────────────────────────────────────────────────────
const DEFAULTS = {
    vendorDaemon     : 'geoslope',
    featurePrefix    : 'pkc_',
    theme            : 'light',
    chartType        : 'line',
    viewBy           : 'feature',
    topN             : 10,
    chartScroll      : true,
    chartMinColWidth : 40,
    colors: [
        '#4e79a7','#f28e2b','#e15759','#76b7b2','#59a14f',
        '#edc948','#b07aa1','#ff9da7','#9c755f','#bab0ac'
    ]
};

const STORAGE_KEY = 'lmadmin-viewer-settings';

// ── State ─────────────────────────────────────────────────────────────────────
const State = {
    events  : [],   // flat array of all parsed events; each has .sourceFile
    loaded  : [],   // { name, count } — display list of loaded files
    settings: { ...DEFAULTS },
    chart   : null,
};

// ── DOM helper ────────────────────────────────────────────────────────────────
const el = id => document.getElementById(id);

// ═══════════════════════════════════════════════════════════════════════════════
// Settings
// ═══════════════════════════════════════════════════════════════════════════════
const Settings = {
    load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) State.settings = Object.assign({}, DEFAULTS, JSON.parse(raw));
        } catch { /* ignore */ }
        this._applyToUI();
    },

    save() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(State.settings));
    },

    readFromUI() {
        State.settings.vendorDaemon  = el('s-vendor').value.trim()  || DEFAULTS.vendorDaemon;
        State.settings.featurePrefix = el('s-prefix').value.trim();
        State.settings.theme         = el('s-theme').value;
        State.settings.chartType        = el('s-chart-type').value;
        State.settings.viewBy           = el('s-view-by').value;
        State.settings.topN             = parseInt(el('s-top-n').value, 10) || 10;
        State.settings.chartScroll      = el('s-chart-scroll').value === 'true';
        State.settings.chartMinColWidth = parseInt(el('s-chart-min-col-width').value, 10) || 40;
        State.settings.colors        = Array.from(
            document.querySelectorAll('#color-palette input[type="color"]')
        ).map(i => i.value);
    },

    _applyToUI() {
        document.body.className     = `theme-${State.settings.theme}`;
        el('s-vendor').value        = State.settings.vendorDaemon;
        el('s-prefix').value        = State.settings.featurePrefix;
        el('s-theme').value         = State.settings.theme;
        el('s-chart-type').value         = State.settings.chartType;
        el('s-view-by').value            = State.settings.viewBy;
        el('s-top-n').value              = String(State.settings.topN);
        el('s-chart-scroll').value       = String(State.settings.chartScroll);
        el('s-chart-min-col-width').value = String(State.settings.chartMinColWidth);
        // Sync chart toolbar defaults
        el('view-by').value         = State.settings.viewBy;
        el('chart-type').value      = State.settings.chartType;
        el('top-n').value           = String(State.settings.topN);
        this._renderPalette();
    },

    _renderPalette() {
        const container = el('color-palette');
        container.innerHTML = '';
        State.settings.colors.forEach((color, i) => {
            const div = document.createElement('div');
            div.className = 'color-swatch';
            div.innerHTML =
                `<input type="color" value="${color}" title="Series ${i + 1}">` +
                `<label>${i + 1}</label>`;
            container.appendChild(div);
        });
    },

    exportJSON() {
        downloadBlob(
            new Blob([JSON.stringify(State.settings, null, 2)], { type: 'application/json' }),
            'lmadmin-viewer-settings.json'
        );
    },

    importJSON(file) {
        readFileText(file).then(text => {
            try {
                State.settings = Object.assign({}, DEFAULTS, JSON.parse(text));
                this._applyToUI();
                this.save();
                showSaveStatus('Settings imported.');
                toast('Settings imported successfully.');
            } catch {
                toast('Error: could not parse settings JSON.');
            }
        });
    },

    reset() {
        State.settings = { ...DEFAULTS };
        this._applyToUI();
        this.save();
        showSaveStatus('Reset to defaults.');
        toast('Settings reset to defaults.');
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// File loading
// ═══════════════════════════════════════════════════════════════════════════════
function loadFiles(fileList) {
    const files   = Array.from(fileList);
    let   pending = files.length;
    if (!pending) return;

    files.forEach(file => {
        readFileText(file).then(text => {
            const evts = LogParser.parse(text, State.settings.vendorDaemon, file.name);
            State.events.push(...evts);

            // Update or add to loaded list
            const existing = State.loaded.find(f => f.name === file.name);
            if (existing) {
                existing.count += evts.length;
            } else {
                State.loaded.push({ name: file.name, count: evts.length });
            }

            pending--;
            if (pending === 0) {
                setDateRangeFromData();
                refreshAll();
                toast(`Loaded ${files.length} file${files.length > 1 ? 's' : ''} · ${State.events.length.toLocaleString()} total events`);
            }
        }).catch(() => {
            pending--;
            toast(`Could not read: ${file.name}`);
        });
    });
}

function removeFile(name) {
    State.events = State.events.filter(e => e.sourceFile !== name);
    State.loaded = State.loaded.filter(f => f.name !== name);
    setDateRangeFromData();
    refreshAll();
    toast(`Removed: ${name}`);
}

function clearAll() {
    State.events = [];
    State.loaded = [];
    el('date-from').value = '';
    el('date-to').value   = '';
    refreshAll();
    toast('All data cleared.');
}

// ═══════════════════════════════════════════════════════════════════════════════
// UI refresh helpers
// ═══════════════════════════════════════════════════════════════════════════════
function refreshAll() {
    updateStats();
    updateFilesList();
    updateHeaderStatus();
    renderChart();
}

function updateStats() {
    const pfx  = State.settings.featurePrefix;
    const evts = pfx
        ? State.events.filter(e => e.feature.startsWith(pfx))
        : State.events;

    const out       = evts.filter(e => e.action === 'OUT');
    const features  = new Set(evts.map(e => e.feature));
    const users     = new Set(out.map(e => e.user));
    const computers = new Set(out.map(e => e.computer));
    const denied    = evts.filter(e => e.action === 'DENIED');
    const dates     = [...new Set(evts.map(e => e.date))].sort();

    el('stat-checkouts').textContent = out.length.toLocaleString();
    el('stat-features').textContent  = features.size;
    el('stat-users').textContent     = users.size;
    el('stat-computers').textContent = computers.size;
    el('stat-denied').textContent    = denied.length.toLocaleString();

    if (dates.length > 0) {
        el('stat-range').textContent =
            dates[0] === dates[dates.length - 1]
                ? dates[0]
                : `${dates[0]}\u2013${dates[dates.length - 1]}`;
    } else {
        el('stat-range').textContent = '\u2014';
    }
}

function updateFilesList() {
    const list = el('files-list');
    list.innerHTML = '';
    el('file-count').textContent = State.loaded.length;

    State.loaded.forEach(({ name, count }) => {
        const tag = document.createElement('span');
        tag.className = 'file-tag';
        tag.innerHTML =
            `\uD83D\uDCC4 ${escHtml(name)} ` +
            `<span class="file-tag-count">(${count.toLocaleString()})</span>` +
            `<button class="file-tag-remove" title="Remove">&#215;</button>`;
        tag.querySelector('.file-tag-remove').addEventListener('click', () => removeFile(name));
        list.appendChild(tag);
    });
}

function updateHeaderStatus() {
    const n = State.loaded.length;
    const e = State.events.length;
    el('header-status').textContent = n === 0
        ? 'No data loaded'
        : `${n} file${n > 1 ? 's' : ''} loaded \u00B7 ${e.toLocaleString()} events`;
}

function setDateRangeFromData() {
    if (State.events.length === 0) {
        el('date-from').value = '';
        el('date-to').value   = '';
        return;
    }
    const dates = [...new Set(State.events.map(e => e.date))].sort();
    el('date-from').value = dates[0];
    el('date-to').value   = dates[dates.length - 1];
}

// ═══════════════════════════════════════════════════════════════════════════════
// Chart
// ═══════════════════════════════════════════════════════════════════════════════
function getChartEvents() {
    const action = el('action-filter').value;
    const from   = el('date-from').value;
    const to     = el('date-to').value;
    const pfx    = State.settings.featurePrefix;

    return State.events.filter(e => {
        if (e.action !== action)                        return false;
        if (from && e.date < from)                      return false;
        if (to   && e.date > to)                        return false;
        if (pfx  && !e.feature.startsWith(pfx))         return false;
        return true;
    });
}

function buildChartData(events, viewBy, topN) {
    // Determine top-N groups by total count across the whole date range
    const totalByGroup = {};
    for (const e of events) {
        const k = e[viewBy];
        totalByGroup[k] = (totalByGroup[k] || 0) + 1;
    }
    let groups = Object.entries(totalByGroup)
        .sort((a, b) => b[1] - a[1])
        .map(([k]) => k);
    if (topN > 0) groups = groups.slice(0, topN);

    const allDates = [...new Set(events.map(e => e.date))].sort();

    // Count per group per date
    const matrix = {};
    for (const g of groups) matrix[g] = {};
    for (const e of events) {
        if (!matrix[e[viewBy]]) continue;
        matrix[e[viewBy]][e.date] = (matrix[e[viewBy]][e.date] || 0) + 1;
    }

    const datasets = groups.map(g => ({
        label: g,
        data : allDates.map(d => matrix[g][d] || 0)
    }));

    return { labels: allDates, datasets };
}

function renderChart() {
    const emptyEl  = el('empty-state');
    const emptyMsg = el('empty-msg');
    const canvas   = el('main-chart');
    const wrap     = el('chart-wrap');

    function resetCanvas() {
        canvas.style.width  = '';
        canvas.style.height = '';
    }

    // No files loaded at all
    if (State.events.length === 0) {
        emptyMsg.innerHTML = 'Drop log files here or use <strong>File &#9660; &rarr; Load Log File(s)</strong>';
        emptyEl.classList.remove('hidden');
        canvas.style.display = 'none';
        resetCanvas();
        destroyChart();
        return;
    }

    const events = getChartEvents();

    if (events.length === 0) {
        emptyMsg.textContent = 'No data matches the current filters.';
        emptyEl.classList.remove('hidden');
        canvas.style.display = 'none';
        resetCanvas();
        destroyChart();
        return;
    }

    emptyEl.classList.add('hidden');
    canvas.style.display = 'block';

    const viewBy    = el('view-by').value;
    const chartType = el('chart-type').value;
    const topN      = parseInt(el('top-n').value, 10);
    const isDark    = State.settings.theme === 'dark';
    const stacked   = chartType === 'bar-stacked';
    const jsType    = stacked ? 'bar' : chartType;

    const { labels, datasets } = buildChartData(events, viewBy, topN);

    const jsDsets = datasets.map((ds, i) => {
        const hex = State.settings.colors[i % State.settings.colors.length];
        return {
            label          : ds.label,
            data           : ds.data,
            borderColor    : hex,
            backgroundColor: jsType === 'line' ? hexAlpha(hex, .12) : hexAlpha(hex, .78),
            borderWidth    : jsType === 'line' ? 2 : 1,
            fill           : jsType === 'line' ? false : undefined,
            tension        : 0.3,
            pointRadius    : jsType === 'line' ? 3 : undefined,
            pointHoverRadius: jsType === 'line' ? 5 : undefined,
        };
    });

    const grid  = isDark ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.07)';
    const tick  = isDark ? '#8b949e' : '#656d76';

    const config = {
        type: jsType,
        data: { labels, datasets: jsDsets },
        options: {
            responsive        : true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: {
                    position: 'bottom',
                    labels  : { boxWidth: 12, padding: 14, color: tick, font: { size: 11 } }
                },
                tooltip: {
                    callbacks: {
                        title: ctx => `Date: ${ctx[0].label}`
                    }
                }
            },
            scales: {
                x: {
                    stacked: stacked,
                    grid   : { color: grid },
                    ticks  : { color: tick, maxRotation: 45, maxTicksLimit: State.settings.chartScroll ? labels.length : 20, font: { size: 11 } }
                },
                y: {
                    stacked  : stacked,
                    beginAtZero: true,
                    grid     : { color: grid },
                    ticks    : { color: tick, precision: 0, font: { size: 11 } },
                    title    : { display: true, text: 'Count', color: tick, font: { size: 11 } }
                }
            }
        }
    };

    // Scroll mode: disable Chart.js responsive resizing and size the canvas
    // explicitly so chart-wrap's overflow-x:auto can trigger a scrollbar.
    const useScroll = State.settings.chartScroll && labels.length > 1;
    if (useScroll) {
        const desiredW = Math.max(
            wrap.clientWidth,
            labels.length * State.settings.chartMinColWidth
        );
        const wrapH = Math.max(wrap.clientHeight, 260);
        config.options.responsive = false;
        destroyChart();
        canvas.style.width  = desiredW + 'px';
        canvas.style.height = wrapH + 'px';
        canvas.width        = desiredW;
        canvas.height       = wrapH;
    } else {
        config.options.responsive = true;
        destroyChart();
        resetCanvas();
    }

    State.chart = new Chart(canvas, config);
}

function destroyChart() {
    if (State.chart) { State.chart.destroy(); State.chart = null; }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Report tab
// ═══════════════════════════════════════════════════════════════════════════════

function generateReport() {
    const type      = el('report-type').value;
    const format    = el('export-format').value;
    const pfx       = State.settings.featurePrefix;
    const events    = pfx
        ? State.events.filter(e => e.feature.startsWith(pfx))
        : State.events;
    const sourceStr = State.loaded.map(f => f.name).join(', ') || 'No files loaded';
    el('report-out').textContent = Reports.generate(type, events, sourceStr, format);
}

function exportReport() {
    const type   = el('report-type').value;
    const format = el('export-format').value;
    const ext    = format === 'markdown' ? 'md' : 'txt';
    const ts     = new Date().toISOString().slice(0, 19).replace(/:/g, '-');

    if (type === 'all') {
        if (State.events.length === 0) { toast('No data loaded.'); return; }
        const pfx       = State.settings.featurePrefix;
        const events    = pfx
            ? State.events.filter(e => e.feature.startsWith(pfx))
            : State.events;
        const sourceStr = State.loaded.map(f => f.name).join(', ') || 'No files loaded';
        // Stagger downloads 350 ms apart — simultaneous triggers get blocked by browsers.
        Reports.TYPES.forEach(({ key }, i) =>
            setTimeout(() => downloadBlob(
                new Blob([Reports.generate(key, events, sourceStr, format)], { type: 'text/plain' }),
                `${ts}_${key}.${ext}`
            ), i * 350)
        );
        toast(`Exporting ${Reports.TYPES.length} .${ext} files\u2026`);
        return;
    }

    const text = el('report-out').textContent;
    if (!text || text.startsWith('Select a report type')) {
        toast('Generate a report first.');
        return;
    }
    downloadBlob(new Blob([text], { type: 'text/plain' }), `${ts}_${type}.${ext}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Utility
// ═══════════════════════════════════════════════════════════════════════════════
function readFileText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = e => resolve(e.target.result);
        reader.onerror = () => reject(new Error('FileReader error'));
        reader.readAsText(file);
    });
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href     = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportChartPNG() {
    if (!State.chart) { toast('No chart to export.'); return; }
    const a = document.createElement('a');
    a.href     = State.chart.toBase64Image('image/png', 1.0);
    a.download = `lmadmin-chart-${new Date().toISOString().slice(0,10)}.png`;
    a.click();
}

function toast(msg) {
    const t = el('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._tid);
    t._tid = setTimeout(() => t.classList.remove('show'), 3200);
}

function showSaveStatus(msg) {
    const s = el('save-status');
    s.textContent = `\u2713 ${msg}`;
    clearTimeout(s._tid);
    s._tid = setTimeout(() => { s.textContent = ''; }, 3000);
}

function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text)
            .then(() => toast('Copied to clipboard.'))
            .catch(() => fallbackCopy(text));
    } else {
        fallbackCopy(text);
    }
}

function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); toast('Copied to clipboard.'); }
    catch { toast('Could not copy — please copy manually.'); }
    document.body.removeChild(ta);
}

function hexAlpha(hex, a) {
    const r = parseInt(hex.slice(1,3),16);
    const g = parseInt(hex.slice(3,5),16);
    const b = parseInt(hex.slice(5,7),16);
    return `rgba(${r},${g},${b},${a})`;
}

function escHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ═══════════════════════════════════════════════════════════════════════════════
// Event listeners
// ═══════════════════════════════════════════════════════════════════════════════
function initListeners() {

    // ── Tab switching ──────────────────────────────────────────────────────
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
            btn.classList.add('active');
            el(`tab-${btn.dataset.tab}`).classList.remove('hidden');
            if (btn.dataset.tab === 'dashboard') renderChart();
        });
    });

    // ── File menu ──────────────────────────────────────────────────────────
    el('file-menu-btn').addEventListener('click', e => {
        e.stopPropagation();
        el('file-dropdown').classList.toggle('open');
    });
    document.addEventListener('click', () => el('file-dropdown').classList.remove('open'));

    el('menu-load').addEventListener('click', () => el('file-input').click());
    el('menu-clear').addEventListener('click', () => {
        if (State.events.length === 0) return;
        if (confirm('Clear all loaded log data?')) clearAll();
    });
    el('menu-export-report').addEventListener('click', exportReport);
    el('menu-export-chart').addEventListener('click', exportChartPNG);

    // ── Log file input ─────────────────────────────────────────────────────
    el('file-input').addEventListener('change', e => {
        if (e.target.files.length) loadFiles(e.target.files);
        e.target.value = '';
    });

    // ── Drag & drop onto the dashboard ────────────────────────────────────
    const dash = el('tab-dashboard');
    dash.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
    dash.addEventListener('drop', e => {
        e.preventDefault();
        if (e.dataTransfer.files.length) loadFiles(e.dataTransfer.files);
    });

    // ── Chart toolbar ──────────────────────────────────────────────────────
    el('apply-btn').addEventListener('click', renderChart);
    el('reset-btn').addEventListener('click', () => {
        el('action-filter').value = 'OUT';
        el('view-by').value       = State.settings.viewBy;
        el('chart-type').value    = State.settings.chartType;
        el('top-n').value         = String(State.settings.topN);
        setDateRangeFromData();
        renderChart();
    });

    // ── Report tab ─────────────────────────────────────────────────────────
    el('generate-btn').addEventListener('click', generateReport);
    el('export-report-btn').addEventListener('click', exportReport);
    el('copy-btn').addEventListener('click', () => copyToClipboard(el('report-out').textContent));

    // ── Settings tab ───────────────────────────────────────────────────────
    el('s-theme').addEventListener('change', e => {
        // Live preview theme change without saving
        document.body.className = `theme-${e.target.value}`;
    });

    el('save-settings-btn').addEventListener('click', () => {
        Settings.readFromUI();
        Settings.save();
        Settings._applyToUI();
        showSaveStatus('Settings saved.');
        toast('Settings saved.');
        if (State.chart) renderChart(); // re-render with new colors/theme
    });

    el('export-settings-btn').addEventListener('click', () => Settings.exportJSON());

    el('import-settings-file').addEventListener('change', e => {
        if (e.target.files[0]) Settings.importJSON(e.target.files[0]);
        e.target.value = '';
    });

    el('reset-settings-btn').addEventListener('click', () => {
        if (confirm('Reset all settings to defaults?')) Settings.reset();
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Init
// ═══════════════════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
    Settings.load();
    initListeners();
    renderChart();   // shows empty state immediately
});
