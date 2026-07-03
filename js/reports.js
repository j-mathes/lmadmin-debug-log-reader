'use strict';

/* ═══════════════════════════════════════════════════════════════════════════
   lmadmin Debug Log Reader — reports.js
   Copyright (c) 2026 Jared Mathes
   Licensed under CC BY-NC-SA 4.0 — https://creativecommons.org/licenses/by-nc-sa/4.0/
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Reports — generates plain-text or Markdown reports from parsed event data.
 *
 * Every public method accepts an optional `format` argument: 'text' (default)
 * or 'markdown'.  The top-level generate() method also handles type 'all',
 * which concatenates every report type into a single combined document.
 *
 * Reports.TYPES is the canonical ordered list of report descriptors, shared
 * with app.js for the "export all as separate files" feature.
 */
const Reports = {

    /** Ordered list of every individual report type. */
    TYPES: [
        { key: 'feature-by-date',  label: 'Feature Usage by Date'      },
        { key: 'user-summary',     label: 'User Summary'                },
        { key: 'computer-summary', label: 'Computer Summary'            },
        { key: 'feature-totals',   label: 'Feature Totals (All Time)'   },
        { key: 'denial-report',    label: 'Denial, Unsupported & Expired Report' },
        { key: 'top-users',        label: 'Top Users by Checkout'       },
        { key: 'top-features',     label: 'Top Features by Checkout'    },
    ],

    /**
     * Main entry point.
     * @param {string} type      - Report type key, or 'all'
     * @param {Array}  events    - All parsed events
     * @param {string} sourceStr - Comma-separated list of loaded filenames
     * @param {string} [format]  - 'text' (default) or 'markdown'
     * @returns {string}
     */
    generate(type, events, sourceStr, format = 'text') {
        const isMd  = format === 'markdown';
        const now   = new Date().toLocaleString();
        const src   = sourceStr || 'No files loaded';
        const count = events.length.toLocaleString();

        const header = isMd
            ? [ '# lmadmin Feature Usage Report', '',
                `**Generated:** ${now}  `,
                `**Source:** ${src}  `,
                `**Events:** ${count} total  `,
                '', '---', '' ].join('\n')
            : [ 'lmadmin Feature Usage Report',
                `Generated : ${now}`,
                `Source    : ${src}`,
                `Events    : ${count} total`,
                '\u2550'.repeat(72), '' ].join('\n');

        const body = type === 'all'
            ? this._all(events, format)
            : this._body(type, events, format);

        return header + body;
    },

    /* ── Combined "all" view ────────────────────────────────────────────────── */

    _all(events, format) {
        const isMd = format === 'markdown';
        return this.TYPES.map(({ key, label }) => {
            const divider = isMd
                ? `## ${label}\n\n`
                : `\n${'─'.repeat(72)}\n${label}\n${'─'.repeat(72)}\n\n`;
            return divider + this._body(key, events, format) + '\n';
        }).join('\n');
    },

    _body(type, events, format) {
        switch (type) {
            case 'feature-by-date':  return this.featureByDate(events, format);
            case 'user-summary':     return this.userSummary(events, format);
            case 'computer-summary': return this.computerSummary(events, format);
            case 'feature-totals':   return this.featureTotals(events, format);
            case 'denial-report':    return this.denialReport(events, format);
            case 'top-users':        return this.topUsers(events, format);
            case 'top-features':     return this.topFeatures(events, format);
            default:                 return 'Unknown report type.';
        }
    },

    /* ── Feature Usage by Date ─────────────────────────────────────────────── */

    featureByDate(events, format = 'text') {
        const byDate = {};
        for (const e of events) {
            if (!byDate[e.date]) byDate[e.date] = {};
            if (!byDate[e.date][e.feature])
                byDate[e.date][e.feature] = { OUT: 0, DENIED: 0, UNSUPPORTED: 0, EXPIRED: 0 };
            const c = byDate[e.date][e.feature];
            if (c[e.action] !== undefined) c[e.action]++;
        }
        const dates = Object.keys(byDate).sort();
        if (!dates.length) return 'No events found.';

        if (format === 'markdown') {
            const parts = [];
            for (const date of dates) {
                parts.push(`### ${date}\n`);
                parts.push('| Feature | Checkouts | Denied | Unsupported | Expired |');
                parts.push('|:---|---:|---:|---:|---:|');
                for (const feat of Object.keys(byDate[date]).sort()) {
                    const c = byDate[date][feat];
                    if (c.OUT + c.DENIED + c.UNSUPPORTED + c.EXPIRED > 0)
                        parts.push(`| \`${feat}\` | ${c.OUT} | ${c.DENIED} | ${c.UNSUPPORTED} | ${c.EXPIRED} |`);
                }
                parts.push('');
            }
            return parts.join('\n');
        }

        const out = [];
        for (const date of dates) {
            out.push(`Date: ${date}`);
            const usageL = [], deniedL = [], unsuppL = [], expiredL = [];
            for (const feat of Object.keys(byDate[date]).sort()) {
                const c = byDate[date][feat];
                if (c.OUT        > 0) usageL.push(`  Count: ${c.OUT}, Feature: ${feat}`);
                if (c.DENIED     > 0) deniedL.push(`  Count: ${c.DENIED}, DENIED: ${feat}, (Licensed number of users already reached. (-4,342))`);
                if (c.UNSUPPORTED > 0) unsuppL.push(`  Count: ${c.UNSUPPORTED}, UNSUPPORTED: ${feat}, (No such feature exists. (-5,346))`);
                if (c.EXPIRED    > 0) expiredL.push(`  Count: ${c.EXPIRED}, EXPIRED: ${feat}, (Feature license is expired.)`);
            }
            out.push(...usageL, ...deniedL, ...unsuppL, ...expiredL, '');
        }
        return out.join('\n');
    },

    /* ── User Summary ──────────────────────────────────────────────────────── */

    userSummary(events, format = 'text') {
        const byUser = {};
        for (const e of events) {
            if (e.action !== 'OUT') continue;
            if (!byUser[e.user]) byUser[e.user] = {};
            byUser[e.user][e.feature] = (byUser[e.user][e.feature] || 0) + 1;
        }
        const users = Object.keys(byUser).sort();
        if (!users.length) return 'No checkout events found.';

        if (format === 'markdown') {
            const parts = [];
            for (const user of users) {
                const feats = byUser[user];
                const total = Object.values(feats).reduce((a, b) => a + b, 0);
                parts.push(`### ${user} \u2014 ${total} checkouts\n`);
                parts.push('| Feature | Count |');
                parts.push('|:---|---:|');
                for (const feat of Object.keys(feats).sort())
                    parts.push(`| \`${feat}\` | ${feats[feat]} |`);
                parts.push('');
            }
            return parts.join('\n');
        }

        const out = [];
        for (const user of users) {
            const feats = byUser[user];
            const total = Object.values(feats).reduce((a, b) => a + b, 0);
            out.push(`User: ${user}  (total checkouts: ${total})`);
            for (const feat of Object.keys(feats).sort())
                out.push(`  ${feat}: ${feats[feat]}`);
            out.push('');
        }
        return out.join('\n');
    },

    /* ── Computer Summary ──────────────────────────────────────────────────── */

    computerSummary(events, format = 'text') {
        const byComp = {};
        for (const e of events) {
            if (e.action !== 'OUT') continue;
            if (!byComp[e.computer]) byComp[e.computer] = {};
            byComp[e.computer][e.feature] = (byComp[e.computer][e.feature] || 0) + 1;
        }
        const comps = Object.keys(byComp).sort();
        if (!comps.length) return 'No checkout events found.';

        if (format === 'markdown') {
            const parts = [];
            for (const comp of comps) {
                const feats = byComp[comp];
                const total = Object.values(feats).reduce((a, b) => a + b, 0);
                parts.push(`### ${comp} \u2014 ${total} checkouts\n`);
                parts.push('| Feature | Count |');
                parts.push('|:---|---:|');
                for (const feat of Object.keys(feats).sort())
                    parts.push(`| \`${feat}\` | ${feats[feat]} |`);
                parts.push('');
            }
            return parts.join('\n');
        }

        const out = [];
        for (const comp of comps) {
            const feats = byComp[comp];
            const total = Object.values(feats).reduce((a, b) => a + b, 0);
            out.push(`Computer: ${comp}  (total checkouts: ${total})`);
            for (const feat of Object.keys(feats).sort())
                out.push(`  ${feat}: ${feats[feat]}`);
            out.push('');
        }
        return out.join('\n');
    },

    /* ── Feature Totals (All Time) ─────────────────────────────────────────── */

    featureTotals(events, format = 'text') {
        const totals = {};
        for (const e of events) {
            if (!totals[e.feature])
                totals[e.feature] = { OUT: 0, DENIED: 0, UNSUPPORTED: 0, EXPIRED: 0,
                                      users: new Set(), computers: new Set() };
            const t = totals[e.feature];
            if (t[e.action] !== undefined) t[e.action]++;
            if (e.action === 'OUT') { t.users.add(e.user); t.computers.add(e.computer); }
        }
        const sorted = Object.entries(totals).sort((a, b) => b[1].OUT - a[1].OUT);
        if (!sorted.length) return 'No events found.';

        if (format === 'markdown') {
            const rows = [
                '| Feature | Checkouts | Denied | Unsupported | Expired | Unique Users | Computers |',
                '|:---|---:|---:|---:|---:|---:|---:|',
            ];
            for (const [feat, c] of sorted)
                rows.push(`| \`${feat}\` | ${c.OUT} | ${c.DENIED} | ${c.UNSUPPORTED} | ${c.EXPIRED} | ${c.users.size} | ${c.computers.size} |`);
            return rows.join('\n');
        }

        const SEP = '\u2500';
        const hdr = `${'Feature'.padEnd(32)}${'Checkouts'.padStart(10)}${'Denied'.padStart(8)}${'Unsupport'.padStart(10)}${'Expired'.padStart(9)}${'Users'.padStart(7)}${'Computers'.padStart(10)}`;
        const rows = [hdr, SEP.repeat(86)];
        for (const [feat, c] of sorted)
            rows.push(`${feat.padEnd(32)}${String(c.OUT).padStart(10)}${String(c.DENIED).padStart(8)}${String(c.UNSUPPORTED).padStart(10)}${String(c.EXPIRED).padStart(9)}${String(c.users.size).padStart(7)}${String(c.computers.size).padStart(10)}`);
        return rows.join('\n');
    },

    /* ── Denial, Unsupported & Expired Report ──────────────────────────────── */

    denialReport(events, format = 'text') {
        const relevant = events.filter(e =>
            e.action === 'DENIED' || e.action === 'UNSUPPORTED' || e.action === 'EXPIRED'
        );
        if (!relevant.length) return 'No denial, unsupported, or expired events found.';

        const byDate = {};
        for (const e of relevant) {
            if (!byDate[e.date]) byDate[e.date] = [];
            byDate[e.date].push(e);
        }

        if (format === 'markdown') {
            const parts = [];
            for (const date of Object.keys(byDate).sort()) {
                parts.push(`### ${date}\n`);
                parts.push('| Action | Feature | User@Computer |');
                parts.push('|:---|:---|:---|');
                for (const e of byDate[date])
                    parts.push(`| **${e.action}** | \`${e.feature}\` | ${e.userComputer} |`);
                parts.push('');
            }
            return parts.join('\n');
        }

        const out = [];
        for (const date of Object.keys(byDate).sort()) {
            out.push(`Date: ${date}`);
            for (const e of byDate[date]) {
                const reason = e.action === 'DENIED'
                    ? 'Licensed number of users already reached. (-4,342)'
                    : e.action === 'UNSUPPORTED'
                        ? 'No such feature exists. (-5,346)'
                        : 'Feature license is expired.';
                const actor = e.userComputer ? `  by ${e.userComputer}` : '';
                out.push(`  ${e.action}: ${e.feature}${actor}  [${reason}]`);
            }
            out.push('');
        }
        return out.join('\n');
    },

    /* ── Top Users ─────────────────────────────────────────────────────────── */

    topUsers(events, format = 'text', n = 30) {
        const counts = {};
        for (const e of events) {
            if (e.action !== 'OUT') continue;
            counts[e.user] = (counts[e.user] || 0) + 1;
        }
        const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, n);
        if (!sorted.length) return 'No checkout events found.';

        if (format === 'markdown') {
            const rows = ['| Rank | User | Checkouts |', '|---:|:---|---:|'];
            sorted.forEach(([user, cnt], i) => rows.push(`| ${i + 1} | ${user} | ${cnt} |`));
            return rows.join('\n');
        }

        const SEP = '\u2500';
        const rows = [`${'Rank'.padEnd(6)}${'User'.padEnd(34)}${'Checkouts'.padStart(10)}`, SEP.repeat(50)];
        sorted.forEach(([user, cnt], i) =>
            rows.push(`${String(i + 1).padEnd(6)}${user.padEnd(34)}${String(cnt).padStart(10)}`));
        return rows.join('\n');
    },

    /* ── Top Features ──────────────────────────────────────────────────────── */

    topFeatures(events, format = 'text', n = 30) {
        const counts = {};
        for (const e of events) {
            if (e.action !== 'OUT') continue;
            counts[e.feature] = (counts[e.feature] || 0) + 1;
        }
        const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, n);
        if (!sorted.length) return 'No checkout events found.';

        if (format === 'markdown') {
            const rows = ['| Rank | Feature | Checkouts |', '|---:|:---|---:|'];
            sorted.forEach(([feat, cnt], i) => rows.push(`| ${i + 1} | \`${feat}\` | ${cnt} |`));
            return rows.join('\n');
        }

        const SEP = '\u2500';
        const rows = [`${'Rank'.padEnd(6)}${'Feature'.padEnd(38)}${'Checkouts'.padStart(10)}`, SEP.repeat(54)];
        sorted.forEach(([feat, cnt], i) =>
            rows.push(`${String(i + 1).padEnd(6)}${feat.padEnd(38)}${String(cnt).padStart(10)}`));
        return rows.join('\n');
    },
};
