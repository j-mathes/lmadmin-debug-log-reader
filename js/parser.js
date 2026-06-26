'use strict';

/**
 * LogParser — mirrors the logic of lmadmin_feature_usage_summary.py
 *
 * Supported log date formats:
 *   "Start-Date: Mon Jan 15 2025 09:30:15 W. Pacific Standard Time"
 *   "Time: Mon Jan 15 2025 09:30:15 W. Pacific Standard Time"
 *   "TIMESTAMP 01/15/2025"
 *
 * Supported log entry format:
 *   (daemon) ACTION: "feature_name" [optional (PORT_AT_HOST_PLUS )] user@computer
 */
const LogParser = {

    /**
     * Parse raw log file content into an array of event objects.
     *
     * @param {string}  content      - Raw text of the log file
     * @param {string}  vendorDaemon - Daemon name to match, e.g. "geoslope"
     * @param {string}  sourceFile   - Filename label attached to each event
     * @returns {Array<{date, feature, user, computer, userComputer, action, sourceFile}>}
     */
    parse(content, vendorDaemon, sourceFile) {
        const events  = [];
        const lines   = content.split(/\r?\n/);
        let   curDate = null;

        // Date pattern group 1/2: "Start-Date: Mon Jan 15 2025 09:30:15 W. …"
        //                                  or  "Time: …"
        // Date pattern group 3:   "TIMESTAMP 01/15/2025"
        const dateRe = /(?:Start-Date:|Time:)\s+(.+?)\s+W\.|TIMESTAMP\s+(\d{2}\/\d{2}\/\d{4})/;

        const daemon    = this._escRx(vendorDaemon || 'geoslope');
        const logRe     = new RegExp(
            `\\(${daemon}\\)\\s+(OUT|IN|DENIED|UNSUPPORTED):\\s+"([^"]+)"` +
            `(?:\\s+\\(PORT_AT_HOST_PLUS\\s*\\))?\\s+(\\w+@\\w+)`
        );

        for (const line of lines) {
            const dm = dateRe.exec(line);
            if (dm) {
                curDate = dm[1] ? this._parseDateTime(dm[1])
                                : this._parseMDY(dm[2]);
                continue;
            }
            if (!curDate) continue;
            const lm = logRe.exec(line);
            if (!lm) continue;

            const [, action, feature, userComputer] = lm;
            const atIdx   = userComputer.indexOf('@');
            const user     = atIdx >= 0 ? userComputer.slice(0, atIdx)     : userComputer;
            const computer = atIdx >= 0 ? userComputer.slice(atIdx + 1)    : '';

            events.push({ date: curDate, feature, user, computer, userComputer, action, sourceFile });
        }

        return events;
    },

    /**
     * Parse "Mon Jan 15 2025 09:30:15" → "2025-01-15"
     * new Date() handles this format across modern browsers.
     */
    _parseDateTime(str) {
        const d = new Date(str);
        if (isNaN(d.getTime())) return null;
        const y  = d.getFullYear();
        const m  = String(d.getMonth() + 1).padStart(2, '0');
        const dy = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${dy}`;
    },

    /**
     * Parse "01/15/2025" (MM/DD/YYYY) → "2025-01-15"
     */
    _parseMDY(str) {
        const [mm, dd, yyyy] = str.split('/');
        return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
    },

    _escRx(s) {
        return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
};
