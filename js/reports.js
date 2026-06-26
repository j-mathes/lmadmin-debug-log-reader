'use strict';

/**
 * Reports — generates text-based reports from parsed event data.
 * All functions accept the full events array and return a formatted string.
 */
const Reports = {

    /**
     * Main entry point.
     * @param {string} type      - Report type key
     * @param {Array}  events    - All parsed events
     * @param {string} sourceStr - Comma-separated list of loaded filenames
     * @returns {string}
     */
    generate(type, events, sourceStr) {
        const now = new Date().toLocaleString();
        const lines = [
            'lmadmin Feature Usage Report',
            `Generated : ${now}`,
            `Source    : ${sourceStr || 'No files loaded'}`,
            `Events    : ${events.length.toLocaleString()} total`,
            '\u2550'.repeat(72),
            ''
        ];

        switch (type) {
            case 'feature-by-date':  lines.push(this.featureByDate(events));   break;
            case 'user-summary':     lines.push(this.userSummary(events));      break;
            case 'computer-summary': lines.push(this.computerSummary(events));  break;
            case 'feature-totals':   lines.push(this.featureTotals(events));    break;
            case 'denial-report':    lines.push(this.denialReport(events));     break;
            case 'top-users':        lines.push(this.topUsers(events));         break;
            case 'top-features':     lines.push(this.topFeatures(events));      break;
            default:                 lines.push('Unknown report type.');
        }

        return lines.join('\n');
    },

    /* ─── Feature Usage by Date ─────────────────────────────────────────── */
    featureByDate(events) {
        const byDate = {};
        for (const e of events) {
            if (!byDate[e.date]) byDate[e.date] = {};
            if (!byDate[e.date][e.feature]) byDate[e.date][e.feature] = { OUT: 0, DENIED: 0, UNSUPPORTED: 0 };
            const cell = byDate[e.date][e.feature];
            if (cell[e.action] !== undefined) cell[e.action]++;
        }

        const out = [];
        for (const date of Object.keys(byDate).sort()) {
            out.push(`Date: ${date}`);
            const usageLines = [], deniedLines = [], unsuppLines = [];
            for (const feat of Object.keys(byDate[date]).sort()) {
                const c = byDate[date][feat];
                if (c.OUT        > 0) usageLines.push(`  Count: ${c.OUT}, Feature: ${feat}`);
                if (c.DENIED     > 0) deniedLines.push(`  Count: ${c.DENIED}, DENIED: ${feat}, (Licensed number of users already reached. (-4,342))`);
                if (c.UNSUPPORTED > 0) unsuppLines.push(`  Count: ${c.UNSUPPORTED}, UNSUPPORTED: ${feat}, (No such feature exists. (-5,346))`);
            }
            out.push(...usageLines, ...deniedLines, ...unsuppLines, '');
        }
        return out.join('\n') || 'No events found.';
    },

    /* ─── User Summary ──────────────────────────────────────────────────── */
    userSummary(events) {
        const byUser = {};
        for (const e of events) {
            if (e.action !== 'OUT') continue;
            if (!byUser[e.user]) byUser[e.user] = {};
            byUser[e.user][e.feature] = (byUser[e.user][e.feature] || 0) + 1;
        }
        const out = [];
        for (const user of Object.keys(byUser).sort()) {
            const feats = byUser[user];
            const total = Object.values(feats).reduce((a, b) => a + b, 0);
            out.push(`User: ${user}  (total checkouts: ${total})`);
            for (const feat of Object.keys(feats).sort()) {
                out.push(`  ${feat}: ${feats[feat]}`);
            }
            out.push('');
        }
        return out.join('\n') || 'No checkout events found.';
    },

    /* ─── Computer Summary ──────────────────────────────────────────────── */
    computerSummary(events) {
        const byComp = {};
        for (const e of events) {
            if (e.action !== 'OUT') continue;
            if (!byComp[e.computer]) byComp[e.computer] = {};
            byComp[e.computer][e.feature] = (byComp[e.computer][e.feature] || 0) + 1;
        }
        const out = [];
        for (const comp of Object.keys(byComp).sort()) {
            const feats = byComp[comp];
            const total = Object.values(feats).reduce((a, b) => a + b, 0);
            out.push(`Computer: ${comp}  (total checkouts: ${total})`);
            for (const feat of Object.keys(feats).sort()) {
                out.push(`  ${feat}: ${feats[feat]}`);
            }
            out.push('');
        }
        return out.join('\n') || 'No checkout events found.';
    },

    /* ─── Feature Totals (all-time table) ───────────────────────────────── */
    featureTotals(events) {
        const totals = {};
        for (const e of events) {
            if (!totals[e.feature]) {
                totals[e.feature] = { OUT: 0, DENIED: 0, UNSUPPORTED: 0, users: new Set(), computers: new Set() };
            }
            const t = totals[e.feature];
            if (t[e.action] !== undefined) t[e.action]++;
            if (e.action === 'OUT') { t.users.add(e.user); t.computers.add(e.computer); }
        }

        const SEP = '\u2500';
        const header = `${'Feature'.padEnd(38)}${'Checkouts'.padStart(10)}${'Denied'.padStart(8)}${'Unsupport'.padStart(10)}${'Users'.padStart(7)}${'Computers'.padStart(10)}`;
        const rows = [header, SEP.repeat(83)];

        const sorted = Object.entries(totals).sort((a, b) => b[1].OUT - a[1].OUT);
        for (const [feat, c] of sorted) {
            rows.push(
                `${feat.padEnd(38)}` +
                `${String(c.OUT).padStart(10)}` +
                `${String(c.DENIED).padStart(8)}` +
                `${String(c.UNSUPPORTED).padStart(10)}` +
                `${String(c.users.size).padStart(7)}` +
                `${String(c.computers.size).padStart(10)}`
            );
        }
        return rows.join('\n');
    },

    /* ─── Denial & Unsupported Report ──────────────────────────────────── */
    denialReport(events) {
        const relevant = events.filter(e => e.action === 'DENIED' || e.action === 'UNSUPPORTED');
        if (relevant.length === 0) return 'No denial or unsupported events found.';

        const byDate = {};
        for (const e of relevant) {
            if (!byDate[e.date]) byDate[e.date] = [];
            byDate[e.date].push(e);
        }

        const out = [];
        for (const date of Object.keys(byDate).sort()) {
            out.push(`Date: ${date}`);
            for (const e of byDate[date]) {
                const reason = e.action === 'DENIED'
                    ? 'Licensed number of users already reached. (-4,342)'
                    : 'No such feature exists. (-5,346)';
                out.push(`  ${e.action}: ${e.feature}  by ${e.userComputer}  [${reason}]`);
            }
            out.push('');
        }
        return out.join('\n');
    },

    /* ─── Top Users ─────────────────────────────────────────────────────── */
    topUsers(events, n = 30) {
        const counts = {};
        for (const e of events) {
            if (e.action !== 'OUT') continue;
            counts[e.user] = (counts[e.user] || 0) + 1;
        }
        const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, n);
        if (sorted.length === 0) return 'No checkout events found.';

        const SEP = '\u2500';
        const rows = [
            `${'Rank'.padEnd(6)}${'User'.padEnd(34)}${'Checkouts'.padStart(10)}`,
            SEP.repeat(50)
        ];
        sorted.forEach(([user, cnt], i) =>
            rows.push(`${String(i + 1).padEnd(6)}${user.padEnd(34)}${String(cnt).padStart(10)}`)
        );
        return rows.join('\n');
    },

    /* ─── Top Features ──────────────────────────────────────────────────── */
    topFeatures(events, n = 30) {
        const counts = {};
        for (const e of events) {
            if (e.action !== 'OUT') continue;
            counts[e.feature] = (counts[e.feature] || 0) + 1;
        }
        const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, n);
        if (sorted.length === 0) return 'No checkout events found.';

        const SEP = '\u2500';
        const rows = [
            `${'Rank'.padEnd(6)}${'Feature'.padEnd(38)}${'Checkouts'.padStart(10)}`,
            SEP.repeat(54)
        ];
        sorted.forEach(([feat, cnt], i) =>
            rows.push(`${String(i + 1).padEnd(6)}${feat.padEnd(38)}${String(cnt).padStart(10)}`)
        );
        return rows.join('\n');
    }
};
