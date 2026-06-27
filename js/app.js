'use strict';

/* ═══════════════════════════════════════════════════════════════════════════
   lmadmin Debug Log Reader — app.js
   Copyright (c) 2026 Jared Mathes
   Licensed under CC BY-NC-SA 4.0 — https://creativecommons.org/licenses/by-nc-sa/4.0/
   ═══════════════════════════════════════════════════════════════════════════ */

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
        '#edc948','#b07aa1','#ff9da7','#9c755f','#bab0ac',
        '#1f77b4','#ff7f0e','#2ca02c','#d62728','#9467bd',
        '#8c564b','#e377c2','#7f7f7f','#bcbd22','#17becf'
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
        const rawN = parseInt(el('s-top-n').value, 10);
        State.settings.topN             = Number.isNaN(rawN) ? 10 : rawN;
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
                `<label>${i + 1}</label>` +
                `<button class="swatch-remove" title="Remove">&times;</button>`;
            div.querySelector('.swatch-remove').addEventListener('click', () => {
                if (State.settings.colors.length <= 1) return;
                // Capture current edited values before splicing
                State.settings.colors = Array.from(
                    document.querySelectorAll('#color-palette input[type="color"]')
                ).map(inp => inp.value);
                State.settings.colors.splice(i, 1);
                this._renderPalette();
            });
            container.appendChild(div);
        });
    },

    addColor() {
        // Save current edits, then append a new color cycling through the defaults
        State.settings.colors = Array.from(
            document.querySelectorAll('#color-palette input[type="color"]')
        ).map(inp => inp.value);
        const pool = DEFAULTS.colors;
        State.settings.colors.push(pool[State.settings.colors.length % pool.length]);
        this._renderPalette();
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
            if (pending === 0) {
                setDateRangeFromData();
                refreshAll();
            }
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
                : `${dates[0]} \u2013 ${dates[dates.length - 1]}`;
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
    const actions = new Set();
    if (el('act-out')?.checked !== false)         actions.add('OUT');
    if (el('act-denied')?.checked !== false)      actions.add('DENIED');
    if (el('act-unsupported')?.checked !== false) actions.add('UNSUPPORTED');

    const from   = el('date-from').value;
    const to     = el('date-to').value;
    const pfx    = State.settings.featurePrefix;
    const viewBy = el('view-by').value;

    const splitByFeature = (viewBy === 'user' || viewBy === 'computer') &&
        el('split-feature')?.value === 'split';

    // Feature sub-filter — only active when viewing by user or computer
    let activeFeatures = null;
    if (viewBy === 'user' || viewBy === 'computer') {
        const cbs = document.querySelectorAll('#feature-filter-checks input[type="checkbox"]');
        if (cbs.length) {
            activeFeatures = new Set(Array.from(cbs).filter(c => c.checked).map(c => c.value));
        }
    }

    // User/computer sub-filter — only active in split-by-feature mode
    let activeUC = null;
    if (splitByFeature) {
        const cbs = document.querySelectorAll('#uc-filter-checks input[type="checkbox"]');
        if (cbs.length) {
            activeUC = new Set(Array.from(cbs).filter(c => c.checked).map(c => c.value));
        }
    }

    return State.events.filter(e => {
        if (!actions.has(e.action))                              return false;
        if (from && e.date < from)                               return false;
        if (to   && e.date > to)                                 return false;
        if (pfx  && !e.feature.startsWith(pfx))                 return false;
        if (activeFeatures && !activeFeatures.has(e.feature))   return false;
        if (activeUC) {
            if (!activeUC.has(viewBy === 'user' ? e.user : e.computer)) return false;
        }
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

    // Feature breakdown per date+group for tooltip (user/computer views only)
    const featureBreakdown = {};
    if (viewBy === 'user' || viewBy === 'computer') {
        const groupSet = new Set(groups);
        for (const e of events) {
            if (!groupSet.has(e[viewBy])) continue;
            if (!featureBreakdown[e.date])          featureBreakdown[e.date] = {};
            if (!featureBreakdown[e.date][e[viewBy]]) featureBreakdown[e.date][e[viewBy]] = {};
            const bd = featureBreakdown[e.date][e[viewBy]];
            bd[e.feature] = (bd[e.feature] || 0) + 1;
        }
    }

    const datasets = groups.map(g => ({
        label: g,
        data : allDates.map(d => matrix[g][d] || 0)
    }));

    return { labels: allDates, datasets, featureBreakdown };
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
        el('chart-legend').innerHTML = '';
        return;
    }

    const events = getChartEvents();

    if (events.length === 0) {
        emptyMsg.textContent = 'No data matches the current filters.';
        emptyEl.classList.remove('hidden');
        canvas.style.display = 'none';
        resetCanvas();
        destroyChart();
        // Preserve the legend so the user can re-select filters; only clear it
        // when there is genuinely no data loaded at all.
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

    // Show/hide Breakdown control; reset it when leaving user/computer view
    const isUCView = viewBy === 'user' || viewBy === 'computer';
    const splitGrp = el('tb-split-group');
    if (splitGrp) splitGrp.style.display = isUCView ? '' : 'none';
    if (!isUCView) { const sf = el('split-feature'); if (sf) sf.value = 'consolidated'; }
    const splitByFeature = isUCView && el('split-feature')?.value === 'split';
    const effectiveViewBy = splitByFeature ? 'feature' : viewBy;

    const { labels, datasets, featureBreakdown } = buildChartData(events, effectiveViewBy, topN);

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
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        title: ctx => `Date: ${ctx[0].label}`,
                        label: ctx => {
                            const group = ctx.dataset.label;
                            const total = ctx.raw;
                            if (splitByFeature || viewBy !== 'user' && viewBy !== 'computer') {
                                return ` ${group}: ${total}`;
                            }
                            const bd = featureBreakdown[ctx.label]?.[group];
                            if (!bd) return ` ${group}: ${total}`;
                            const lines = [` ${group}: ${total}`];
                            Object.entries(bd)
                                .sort((a, b) => b[1] - a[1])
                                .forEach(([feat, cnt]) => lines.push(`   \u2514 ${feat}: ${cnt}`));
                            return lines;
                        }
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
    renderLegend();
}

function renderLegend() {
    const panel = el('chart-legend');

    // Capture action state before wiping the panel
    const actState = {
        out:         el('act-out')?.checked ?? true,
        denied:      el('act-denied')?.checked ?? true,
        unsupported: el('act-unsupported')?.checked ?? true,
    };

    // Capture feature filter state before wiping the panel
    const prevFeatChecked = new Set(
        Array.from(document.querySelectorAll('#feature-filter-checks input:checked')).map(c => c.value)
    );
    const prevFeatAll = new Set(
        Array.from(document.querySelectorAll('#feature-filter-checks input')).map(c => c.value)
    );

    // Determine split mode and capture UC filter state before wiping
    const viewBy = el('view-by').value;
    const splitByFeature = (viewBy === 'user' || viewBy === 'computer') &&
        el('split-feature')?.value === 'split';
    const prevUCChecked = new Set(
        Array.from(document.querySelectorAll('#uc-filter-checks input:checked')).map(c => c.value)
    );
    const prevUCAll = new Set(
        Array.from(document.querySelectorAll('#uc-filter-checks input')).map(c => c.value)
    );

    panel.innerHTML = '';
    if (!State.chart) return;

    // Helper: build a section header with All / None buttons
    function makeHeader(titleText, onAll, onNone) {
        const hdr = document.createElement('div');
        hdr.className = 'legend-section-header';
        const title = document.createElement('span');
        title.className = 'legend-section-title';
        title.textContent = titleText;
        const btns = document.createElement('div');
        btns.className = 'legend-all-btns';
        ['All', 'None'].forEach((label, idx) => {
            const btn = document.createElement('button');
            btn.className = 'legend-all-btn';
            btn.textContent = label;
            btn.addEventListener('click', idx === 0 ? onAll : onNone);
            btns.appendChild(btn);
        });
        hdr.appendChild(title);
        hdr.appendChild(btns);
        return hdr;
    }

    // ── Action section ────────────────────────────────────────────────
    const actionSection = document.createElement('div');
    actionSection.className = 'legend-section legend-action-section';

    const actionList = document.createElement('div');
    actionList.className = 'legend-list';

    [
        { id: 'act-out',         label: 'Checkouts',   key: 'out'         },
        { id: 'act-denied',      label: 'Denied',      key: 'denied'      },
        { id: 'act-unsupported', label: 'Unsupported', key: 'unsupported' },
    ].forEach(({ id, label, key }) => {
        const lbl = document.createElement('label');
        lbl.className = 'legend-check';
        const cb = document.createElement('input');
        cb.type    = 'checkbox';
        cb.id      = id;
        cb.checked = actState[key];
        cb.addEventListener('change', renderChart);
        lbl.appendChild(cb);
        lbl.appendChild(document.createTextNode(' ' + label));
        actionList.appendChild(lbl);
    });

    actionSection.appendChild(makeHeader('Action',
        () => { actionList.querySelectorAll('input').forEach(cb => cb.checked = true);  renderChart(); },
        () => { actionList.querySelectorAll('input').forEach(cb => cb.checked = false); renderChart(); }
    ));
    actionSection.appendChild(actionList);

    const actionDivider = document.createElement('div');
    actionDivider.className = 'legend-section-divider';
    panel.appendChild(actionSection);
    panel.appendChild(actionDivider);

    // ── Series section (scrollable) ────────────────────────────────────
    const seriesSection = document.createElement('div');
    seriesSection.className = 'legend-section legend-series-section';

    const seriesList = document.createElement('div');
    seriesList.className = 'legend-list';
    const seriesItems = [];

    if (splitByFeature) {
        // Split mode: Series section becomes a user/computer filter panel
        seriesList.id = 'uc-filter-checks';
        const pfxUC = State.settings.featurePrefix;
        const ucKey = viewBy === 'user' ? 'user' : 'computer';
        const allUC = [...new Set(
            State.events
                .filter(e => !pfxUC || e.feature.startsWith(pfxUC))
                .map(e => e[ucKey])
        )].sort();
        allUC.forEach(ucVal => {
            const checked = !prevUCAll.has(ucVal) || prevUCChecked.has(ucVal);
            const lbl = document.createElement('label');
            lbl.className = 'legend-check';
            const cb = document.createElement('input');
            cb.type    = 'checkbox';
            cb.value   = ucVal;
            cb.checked = checked;
            cb.addEventListener('change', renderChart);
            lbl.appendChild(cb);
            lbl.appendChild(document.createTextNode(' ' + ucVal));
            seriesList.appendChild(lbl);
        });
        const ucTitle = viewBy === 'user' ? 'Users' : 'Computers';
        seriesSection.appendChild(makeHeader(ucTitle,
            () => { seriesList.querySelectorAll('input').forEach(cb => cb.checked = true);  renderChart(); },
            () => { seriesList.querySelectorAll('input').forEach(cb => cb.checked = false); renderChart(); }
        ));
    } else {
        // Normal mode: click to show/hide each dataset
        State.chart.data.datasets.forEach((ds, i) => {
            const item = document.createElement('div');
            item.className = 'legend-item';
            if (!State.chart.isDatasetVisible(i)) item.classList.add('series-hidden');
            seriesItems.push(item);

            const swatch = document.createElement('span');
            swatch.className = 'legend-swatch';
            swatch.style.background = ds.borderColor;

            const lbl = document.createElement('span');
            lbl.textContent = ds.label;
            lbl.title = ds.label;

            item.appendChild(swatch);
            item.appendChild(lbl);
            item.addEventListener('click', () => {
                if (!State.chart) return;
                const nowVisible = State.chart.isDatasetVisible(i);
                State.chart.setDatasetVisibility(i, !nowVisible);
                State.chart.update();
                item.classList.toggle('series-hidden', nowVisible);
            });
            seriesList.appendChild(item);
        });
        seriesSection.appendChild(makeHeader('Series',
            () => {
                if (!State.chart) return;
                State.chart.data.datasets.forEach((_, i) => State.chart.setDatasetVisibility(i, true));
                State.chart.update();
                seriesItems.forEach(it => it.classList.remove('series-hidden'));
            },
            () => {
                if (!State.chart) return;
                State.chart.data.datasets.forEach((_, i) => State.chart.setDatasetVisibility(i, false));
                State.chart.update();
                seriesItems.forEach(it => it.classList.add('series-hidden'));
            }
        ));
    }
    seriesSection.appendChild(seriesList);
    panel.appendChild(seriesSection);

    // ── Feature section (bottom, expands upward, user/computer views only) ─
    if (viewBy === 'user' || viewBy === 'computer') {
        const featSection = document.createElement('div');
        featSection.className = 'legend-section legend-feature-section';

        const divider = document.createElement('div');
        divider.className = 'legend-section-divider';

        const featList = document.createElement('div');
        featList.id = 'feature-filter-checks';
        featList.className = 'legend-list';

        // Populate features, preserving previous checked state
        const pfx = State.settings.featurePrefix;
        const features = [...new Set(
            State.events
                .filter(e => !pfx || e.feature.startsWith(pfx))
                .map(e => e.feature)
        )].sort();

        // In split mode the features are the chart series — map name → color for swatches
        const featColorMap = {};
        if (splitByFeature && State.chart) {
            State.chart.data.datasets.forEach(ds => { featColorMap[ds.label] = ds.borderColor; });
        }

        features.forEach(feat => {
            const checked = !prevFeatAll.has(feat) || prevFeatChecked.has(feat);
            const lbl = document.createElement('label');
            lbl.className = 'legend-check';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.value = feat;
            cb.checked = checked;
            cb.addEventListener('change', renderChart);
            lbl.appendChild(cb);
            if (splitByFeature) {
                const sw = document.createElement('span');
                sw.className = 'legend-swatch';
                sw.style.background = featColorMap[feat] || 'var(--border)';
                lbl.appendChild(sw);
            }
            lbl.appendChild(document.createTextNode(' ' + feat));
            featList.appendChild(lbl);
        });

        featSection.appendChild(divider);
        featSection.appendChild(makeHeader('Features',
            () => { featList.querySelectorAll('input').forEach(cb => cb.checked = true); renderChart(); },
            () => { featList.querySelectorAll('input').forEach(cb => cb.checked = false); renderChart(); }
        ));
        featSection.appendChild(featList);
        panel.appendChild(featSection);
    }
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
                `lmadmin-report-${key}-${ts}.${ext}`
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
    downloadBlob(new Blob([text], { type: 'text/plain' }), `lmadmin-report-${type}-${ts}.${ext}`);
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

function openExportChartModal() {
    if (!State.chart) { toast('No chart to export.'); return; }
    el('export-chart-modal').style.display = 'flex';
}

function closeExportChartModal() {
    el('export-chart-modal').style.display = 'none';
}

function exportChart(format) {
    closeExportChartModal();
    if (!State.chart) return;

    const ts        = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    const viewBy    = el('view-by').value;
    const chartType = el('chart-type').value;
    const stem      = `lmadmin-chart-${viewBy}-${chartType}-${ts}`;
    const a = document.createElement('a');

    if (format === 'svg') {
        const svgStr = buildVectorSVG();
        const blob = new Blob([svgStr], { type: 'image/svg+xml' });
        a.href     = URL.createObjectURL(blob);
        a.download = `${stem}.svg`;
    } else {
        // PNG / JPEG — composite canvas with manually drawn legend
        const chartCanvas = State.chart.canvas;
        const bs = getComputedStyle(document.body);
        const bgCard    = bs.getPropertyValue('--bg-card').trim();
        const textColor = bs.getPropertyValue('--text').trim();
        const mutedClr  = bs.getPropertyValue('--text-muted').trim();
        const borderClr = bs.getPropertyValue('--border').trim();

        const LEGEND_W = 180, PAD = 10, LINE_H = 22, HDR_H = 24, DIV_H = 9;
        const FONT     = '12px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif';
        const HDR_FONT = 'bold 10px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif';

        const featCbs = [...document.querySelectorAll('#feature-filter-checks input')];
        const hasFeat = featCbs.length > 0;
        const legendH = 4 + HDR_H + 3*LINE_H + DIV_H
            + HDR_H + State.chart.data.datasets.length * LINE_H
            + (hasFeat ? DIV_H + HDR_H + featCbs.length * LINE_H : 0) + 8;

        const totalW = LEGEND_W + 1 + chartCanvas.width;
        const totalH = Math.max(chartCanvas.height, legendH);
        const off = document.createElement('canvas');
        off.width = totalW; off.height = totalH;
        const ctx = off.getContext('2d');

        ctx.fillStyle = format === 'jpeg' ? '#ffffff' : bgCard;
        ctx.fillRect(0, 0, totalW, totalH);
        ctx.drawImage(chartCanvas, LEGEND_W + 1, 0);
        ctx.fillStyle = borderClr; ctx.fillRect(LEGEND_W, 0, 1, totalH);

        let y = 4;
        function secTitle(label) {
            ctx.font = HDR_FONT; ctx.fillStyle = mutedClr;
            ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
            ctx.fillText(label, PAD, y + HDR_H / 2); y += HDR_H;
        }
        function divLine() {
            ctx.fillStyle = borderClr; ctx.fillRect(0, y + 2, LEGEND_W, 1); y += DIV_H;
        }
        function checkRow(label, checked) {
            const bx = PAD, by = y + (LINE_H - 11) / 2;
            ctx.lineWidth = 1; ctx.strokeStyle = checked ? textColor : mutedClr;
            ctx.strokeRect(bx+0.5, by+0.5, 10, 10);
            if (checked) { ctx.fillStyle = textColor; ctx.fillRect(bx+2.5, by+2.5, 6, 6); }
            ctx.font = FONT; ctx.fillStyle = checked ? textColor : mutedClr;
            ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
            ctx.save(); ctx.beginPath();
            ctx.rect(PAD+15, y, LEGEND_W-PAD-19, LINE_H); ctx.clip();
            ctx.fillText(label, PAD+15, y+LINE_H/2); ctx.restore(); y += LINE_H;
        }

        secTitle('Action');
        checkRow('Checkouts',   el('act-out')?.checked         ?? true);
        checkRow('Denied',      el('act-denied')?.checked      ?? true);
        checkRow('Unsupported', el('act-unsupported')?.checked ?? true);
        divLine();
        secTitle('Series');
        State.chart.data.datasets.forEach((ds, i) => {
            const visible = State.chart.isDatasetVisible(i);
            ctx.globalAlpha = visible ? 1 : 0.35;
            const sw = 12, sh = 12, sr = 2, sx = PAD, sy = y + (LINE_H-sh)/2;
            ctx.fillStyle = ds.borderColor;
            ctx.beginPath();
            ctx.moveTo(sx+sr,sy); ctx.lineTo(sx+sw-sr,sy);
            ctx.arcTo(sx+sw,sy,sx+sw,sy+sr,sr); ctx.lineTo(sx+sw,sy+sh-sr);
            ctx.arcTo(sx+sw,sy+sh,sx+sw-sr,sy+sh,sr); ctx.lineTo(sx+sr,sy+sh);
            ctx.arcTo(sx,sy+sh,sx,sy+sh-sr,sr); ctx.lineTo(sx,sy+sr);
            ctx.arcTo(sx,sy,sx+sr,sy,sr); ctx.closePath(); ctx.fill();
            ctx.font = FONT; ctx.fillStyle = textColor;
            ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
            ctx.save(); ctx.beginPath();
            ctx.rect(PAD+17, y, LEGEND_W-PAD-21, LINE_H); ctx.clip();
            ctx.fillText(ds.label, PAD+17, y+LINE_H/2); ctx.restore();
            ctx.globalAlpha = 1; y += LINE_H;
        });
        if (hasFeat) {
            divLine(); secTitle('Features');
            featCbs.forEach(cb => checkRow(cb.value, cb.checked));
        }

        if (format === 'jpeg') {
            a.href = off.toDataURL('image/jpeg', 0.95);
            a.download = `${stem}.jpg`;
        } else {
            a.href = off.toDataURL('image/png');
            a.download = `${stem}.png`;
        }
    }

    a.click();
    if (a.href.startsWith('blob:')) URL.revokeObjectURL(a.href);
}

// Build a true vector SVG from Chart.js rendered geometry + legend state
function buildVectorSVG() {
    const chart = State.chart;
    const CW = chart.canvas.width, CH = chart.canvas.height;
    const ca = chart.chartArea;
    const bs = getComputedStyle(document.body);
    const bgCard    = bs.getPropertyValue('--bg-card').trim();
    const textClr   = bs.getPropertyValue('--text').trim();
    const mutedClr  = bs.getPropertyValue('--text-muted').trim();
    const borderClr = bs.getPropertyValue('--border').trim();
    const gridClr   = State.settings.theme === 'dark'
        ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';

    const LEGEND_W = 180, PAD = 10, LINE_H = 22, HDR_H = 24, DIV_H = 9;
    const SANS = 'ui-sans-serif,system-ui,-apple-system,sans-serif';
    const f  = v => Number(v).toFixed(1);       // coordinate helper
    const te = s => escHtml(String(s ?? ''));    // text/attribute escape

    const featCbs = [...document.querySelectorAll('#feature-filter-checks input')];
    const hasFeat = featCbs.length > 0;
    const legendH = 4 + HDR_H + 3*LINE_H + DIV_H
        + HDR_H + chart.data.datasets.length * LINE_H
        + (hasFeat ? DIV_H + HDR_H + featCbs.length * LINE_H : 0) + 8;

    const totalW = LEGEND_W + 1 + CW;
    const totalH = Math.max(CH, legendH);

    const p = [];
    p.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}" viewBox="0 0 ${totalW} ${totalH}">`);
    p.push(`<defs>`);
    p.push(`  <clipPath id="ca"><rect x="${f(ca.left)}" y="${f(ca.top)}" width="${f(ca.right-ca.left)}" height="${f(ca.bottom-ca.top)}"/></clipPath>`);
    p.push(`  <clipPath id="lg"><rect x="0" y="0" width="${LEGEND_W}" height="${totalH}"/></clipPath>`);
    p.push(`</defs>`);
    p.push(`<rect width="${totalW}" height="${totalH}" fill="${te(bgCard)}"/>`);
    p.push(`<line x1="${LEGEND_W}" y1="0" x2="${LEGEND_W}" y2="${totalH}" stroke="${te(borderClr)}" stroke-width="1"/>`);

    // ── Legend ──────────────────────────────────────────────────────────────
    let ly = 4;
    p.push(`<g clip-path="url(#lg)">`);

    function lgTitle(label) {
        p.push(`<text x="${PAD}" y="${f(ly+HDR_H/2)}" font-size="10" font-weight="700" font-family="${SANS}" fill="${te(mutedClr)}" dominant-baseline="middle" letter-spacing="0.06em">${te(label.toUpperCase())}</text>`);
        ly += HDR_H;
    }
    function lgDiv() {
        p.push(`<line x1="0" y1="${f(ly+2)}" x2="${LEGEND_W}" y2="${f(ly+2)}" stroke="${te(borderClr)}" stroke-width="1"/>`);
        ly += DIV_H;
    }
    function lgCheck(label, checked) {
        const bx = PAD, by = ly + (LINE_H-11)/2;
        p.push(`<rect x="${f(bx+0.5)}" y="${f(by+0.5)}" width="10" height="10" fill="none" stroke="${te(checked ? textClr : mutedClr)}" stroke-width="1"/>`);
        if (checked) p.push(`<rect x="${f(bx+2.5)}" y="${f(by+2.5)}" width="6" height="6" fill="${te(textClr)}"/>`);
        p.push(`<text x="${bx+15}" y="${f(ly+LINE_H/2)}" font-size="12" font-family="${SANS}" fill="${te(checked ? textClr : mutedClr)}" dominant-baseline="middle">${te(label)}</text>`);
        ly += LINE_H;
    }

    lgTitle('Action');
    lgCheck('Checkouts',   el('act-out')?.checked         ?? true);
    lgCheck('Denied',      el('act-denied')?.checked      ?? true);
    lgCheck('Unsupported', el('act-unsupported')?.checked ?? true);
    lgDiv();

    lgTitle('Series');
    chart.data.datasets.forEach((ds, i) => {
        const vis = chart.isDatasetVisible(i), op = vis ? '1' : '0.35';
        p.push(`<rect x="${PAD}" y="${f(ly+(LINE_H-12)/2)}" width="12" height="12" rx="2" fill="${te(ds.borderColor)}" opacity="${op}"/>`);
        p.push(`<text x="${PAD+17}" y="${f(ly+LINE_H/2)}" font-size="12" font-family="${SANS}" fill="${te(textClr)}" dominant-baseline="middle" opacity="${op}">${te(ds.label)}</text>`);
        ly += LINE_H;
    });

    if (hasFeat) { lgDiv(); lgTitle('Features'); featCbs.forEach(cb => lgCheck(cb.value, cb.checked)); }
    p.push(`</g>`);

    // ── Chart (translated right of legend) ──────────────────────────────────
    p.push(`<g transform="translate(${LEGEND_W+1},0)">`);

    const xScale = chart.scales.x;
    const yScale = chart.scales.y;

    // Y grid lines and tick labels
    yScale.ticks.forEach((tick, idx) => {
        const py = yScale.getPixelForTick(idx);
        if (py < ca.top-1 || py > ca.bottom+1) return;
        p.push(`<line x1="${f(ca.left)}" y1="${f(py)}" x2="${f(ca.right)}" y2="${f(py)}" stroke="${gridClr}" stroke-width="1"/>`);
        const lbl = Array.isArray(tick.label) ? tick.label[0] : (tick.label ?? String(tick.value ?? ''));
        p.push(`<text x="${f(ca.left-6)}" y="${f(py)}" font-size="11" font-family="${SANS}" fill="${te(mutedClr)}" dominant-baseline="middle" text-anchor="end">${te(lbl)}</text>`);
    });

    // Y axis title
    const ytx = f(ca.left-44), yty = f((ca.top+ca.bottom)/2);
    p.push(`<text x="${ytx}" y="${yty}" font-size="11" font-family="${SANS}" fill="${te(mutedClr)}" dominant-baseline="middle" text-anchor="middle" transform="rotate(-90,${ytx},${yty})">Count</text>`);

    // X tick labels (rotated −45°)
    xScale.ticks.forEach((tick, idx) => {
        const px = xScale.getPixelForTick(idx);
        if (px < ca.left-1 || px > ca.right+1) return;
        const lbl = Array.isArray(tick.label)
            ? tick.label[0]
            : (tick.label ?? String(chart.data.labels[tick.value] ?? ''));
        const ty = ca.bottom + 6;
        p.push(`<text x="${f(px)}" y="${f(ty)}" font-size="11" font-family="${SANS}" fill="${te(mutedClr)}" text-anchor="end" transform="rotate(-45,${f(px)},${f(ty)})">${te(lbl)}</text>`);
    });

    // Axis border lines
    p.push(`<line x1="${f(ca.left)}" y1="${f(ca.bottom)}" x2="${f(ca.right)}" y2="${f(ca.bottom)}" stroke="${te(borderClr)}" stroke-width="1"/>`);
    p.push(`<line x1="${f(ca.left)}" y1="${f(ca.top)}" x2="${f(ca.left)}" y2="${f(ca.bottom)}" stroke="${te(borderClr)}" stroke-width="1"/>`);

    // Dataset geometry — clipped to chart area
    p.push(`<g clip-path="url(#ca)">`);
    const jsType = chart.config.type;

    chart.data.datasets.forEach((ds, i) => {
        if (!chart.isDatasetVisible(i)) return;
        const meta = chart.getDatasetMeta(i);

        if (jsType === 'bar') {
            // Chart.js already computed stacked positions; getProps reflects that
            meta.data.forEach(bar => {
                if (!bar || bar.hidden) return;
                const pr = bar.getProps(['x','y','base','width'], true);
                if (!pr) return;
                p.push(`<rect x="${f(pr.x-pr.width/2)}" y="${f(Math.min(pr.y,pr.base))}" width="${f(Math.max(0,pr.width))}" height="${f(Math.abs(pr.base-pr.y))}" fill="${te(ds.backgroundColor)}" stroke="${te(ds.borderColor)}" stroke-width="${ds.borderWidth||1}"/>`);
            });
        } else {
            // Line — cubic-bezier path using Chart.js control points for tension
            const pts = meta.data.filter(pt => !pt.skip && !pt.hidden);
            if (pts.length < 2) return;

            let d = '';
            pts.forEach((pt, j) => {
                const pr = pt.getProps(['x','y','cp1x','cp1y','cp2x','cp2y'], true);
                if (!pr) return;
                if (j === 0) {
                    d += `M ${f(pr.x)},${f(pr.y)}`;
                } else {
                    const pv = pts[j-1].getProps(['x','y','cp2x','cp2y'], true);
                    if (pv?.cp2x != null && pr.cp1x != null) {
                        // Cubic bezier matching Chart.js tension curve exactly
                        d += ` C ${f(pv.cp2x)},${f(pv.cp2y)} ${f(pr.cp1x)},${f(pr.cp1y)} ${f(pr.x)},${f(pr.y)}`;
                    } else {
                        d += ` L ${f(pr.x)},${f(pr.y)}`;
                    }
                }
            });

            // Fill area (skipped when fill:false, which is our line-chart default)
            if (ds.fill !== false) {
                const base = f(yScale.getPixelForValue(0));
                const fp = pts[0].getProps(['x'], true);
                const lp = pts[pts.length-1].getProps(['x'], true);
                p.push(`<path d="${d} L ${f(lp.x)},${base} L ${f(fp.x)},${base} Z" fill="${te(ds.backgroundColor)}" stroke="none"/>`);
            }
            p.push(`<path d="${d}" fill="none" stroke="${te(ds.borderColor)}" stroke-width="${ds.borderWidth||2}" stroke-linejoin="round" stroke-linecap="round"/>`);

            // Data point circles
            if (ds.pointRadius !== 0) {
                pts.forEach(pt => {
                    const pr = pt.getProps(['x','y'], true);
                    if (!pr) return;
                    p.push(`<circle cx="${f(pr.x)}" cy="${f(pr.y)}" r="${ds.pointRadius||3}" fill="${te(ds.borderColor)}" stroke="${te(bgCard)}" stroke-width="1.5"/>`);
                });
            }
        }
    });

    p.push(`</g>`); // dataset clip
    p.push(`</g>`); // chart translate
    p.push(`</svg>`);
    return p.join('\n');
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
    el('menu-export-chart').addEventListener('click', openExportChartModal);
    el('export-chart-cancel').addEventListener('click', closeExportChartModal);
    el('export-chart-modal').addEventListener('click', e => { if (e.target === el('export-chart-modal')) closeExportChartModal(); });
    ['png', 'jpeg', 'svg'].forEach(fmt => el(`export-fmt-${fmt}`).addEventListener('click', () => exportChart(fmt)));

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
    el('split-feature').addEventListener('change', renderChart);
    el('reset-btn').addEventListener('click', () => {
        el('act-out').checked         = true;
        el('act-denied').checked      = true;
        el('act-unsupported').checked = true;
        // Clear feature filter so all features default to checked on next render
        const ffc = el('feature-filter-checks');
        if (ffc) ffc.innerHTML = '';
        const ucfc = el('uc-filter-checks');
        if (ucfc) ucfc.innerHTML = '';
        el('split-feature').value = 'consolidated';
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
    el('add-color-btn').addEventListener('click', () => Settings.addColor());

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
