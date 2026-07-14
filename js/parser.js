'use strict';

/* ═══════════════════════════════════════════════════════════════════════════
   lmadmin Debug Log Reader — parser.js
   Copyright (c) 2026 Jared Mathes
   Licensed under CC BY-NC-SA 4.0 — https://creativecommons.org/licenses/by-nc-sa/4.0/
   ═══════════════════════════════════════════════════════════════════════════ */

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

    DAEMON_EXIT_LOOKUP: {
        '25:2': {
            title: 'No Valid Hostids',
            explanation: 'The vendor daemon is shutting down because it cannot find a valid host ID on the server to lock the licenses to. This can be caused by missing or unsupported network adapters.'
        },
        '27:4': {
            title: 'No features to serve',
            explanation: 'The vendor daemon started, read the license file, but found no valid FEATURE or INCREMENT lines to manage, so it is shutting down as it has no work to do.'
        },
        '28:5': {
            title: 'Lost connection to lmgrd (heartbeat timeout)',
            explanation: 'The vendor daemon lost its network connection to the main lmgrd process. This is often due to a firewall, network issue, or lmgrd crashing.'
        },
        '32:9': {
            title: 'Another server was running',
            explanation: 'The vendor daemon detected that another instance of itself for the same vendor was already running and is shutting down to prevent conflicts.'
        },
        '51:28': {
            title: 'Unsupported Virtual Environment',
            explanation: 'The license file is configured for a specific type of virtual machine using a special HOSTID such as VM_UUID. This error means the server is either not a virtual machine or is running in a virtual environment that is not supported or does not match the license requirements.'
        },
        '65:42': {
            title: 'Trusted storage binding change detected',
            explanation: 'This is a critical error for activation-based licenses. It means a fundamental characteristic of the machine has changed and the license is no longer trusted.'
        }
    },

    /**
     * Parse raw log file content into an array of event objects.
     *
     * @param {string}  content      - Raw text of the log file
     * @param {string}  vendorDaemon - Daemon name to match, e.g. "geoslope"
    * @param {string}  sourceFile   - Filename label attached to each event
    * @returns {Array<{date, feature, user, computer, userComputer, action, sourceFile}>}
     */
    parse(content, vendorDaemon, sourceFile, options = {}) {
        const events  = [];
        const lines   = content.split(/\r?\n/);
        let   curDate = null;
        const expiredSeen = new Set();
        const warningSeen = new Set();
        const versionMismatchSeen = new Set();
        const dedupeVersionMismatch = options.dedupeVersionMismatch !== false;

        // Date pattern group 1/2: "Start-Date: Mon Jan 15 2025 09:30:15 W. …"
        //                                  or  "Time: …"
        // Date pattern group 3:   "TIMESTAMP 01/15/2025"
        const dateRe = /(?:Start-Date:|Time:)\s+(.+?)\s+W\.|TIMESTAMP\s+(\d{1,2}\/\d{1,2}\/\d{4})/;

        const daemon    = this._escRx(vendorDaemon || 'geoslope');
        const userLogRe = new RegExp(
            `\\(${daemon}\\)\\s+(OUT|IN|DENIED|UNSUPPORTED):\\s+"([^"]+)"` +
            `(?:\\s+\\(PORT_AT_HOST_PLUS\\s*\\))?\\s+(\\w+@\\w+)`
        );
        const expiredRe = new RegExp(
            `\\(${daemon}\\)\\s+EXPIRED:\\s+(?:"([^"]+)"|(\\S+))`
        );
        const warningRe = new RegExp(
            `\\(${daemon}\\)\\s+Warning:\\s+(.+?)\\s+expires\\s+(\\S+)`,
            'i'
        );
        const lostCommRe = new RegExp(
            `\\(${daemon}\\)\\s+Lost communications with lmgrd\\.?`,
            'i'
        );
        const versionMismatchRe = new RegExp(
            `\\(${daemon}\\)\\s+Request denied:\\s+Client\\s+\\(([^)]+)\\)\\s+newer than Vendor Daemon\\s+\\(([^)]+)\\)`
        );
        const daemonExitRe = new RegExp(
            `\\(${daemon}\\)\\s+EXITING DUE TO SIGNAL\\s+(\\d+)\\s+Exit reason\\s+(\\d+)`
        );

        for (const line of lines) {
            const dm = dateRe.exec(line);
            if (dm) {
                curDate = dm[1] ? this._parseDateTime(dm[1])
                                : this._parseMDY(dm[2]);
                continue;
            }
            if (!curDate) continue;
            const lm = userLogRe.exec(line);
            if (lm) {
                const [, action, feature, userComputer] = lm;
                const atIdx   = userComputer.indexOf('@');
                const user     = atIdx >= 0 ? userComputer.slice(0, atIdx)     : userComputer;
                const computer = atIdx >= 0 ? userComputer.slice(atIdx + 1)    : '';

                events.push({ date: curDate, feature, user, computer, userComputer, action, sourceFile });
                continue;
            }

            const em = expiredRe.exec(line);
            if (em) {
                const feature = em[1] || em[2];
                const rawTime = this._extractTime(line);
                if (rawTime) {
                    const dedupeKey = `${sourceFile || ''}|${curDate}|${rawTime}|${feature}`;
                    if (expiredSeen.has(dedupeKey)) continue;
                    expiredSeen.add(dedupeKey);
                }

                events.push({
                    date: curDate,
                    feature,
                    user: '',
                    computer: '',
                    userComputer: '',
                    action: 'EXPIRED',
                    sourceFile,
                    category: 'usage'
                });
                continue;
            }

            const wm = warningRe.exec(line);
            if (wm) {
                const feature = wm[1].trim();
                const warningExpiresOn = wm[2];
                const rawTime = this._extractTime(line);
                if (rawTime) {
                    const dedupeKey = `${sourceFile || ''}|${curDate}|${rawTime}|${feature}|${warningExpiresOn}`;
                    if (warningSeen.has(dedupeKey)) continue;
                    warningSeen.add(dedupeKey);
                }

                events.push({
                    date: curDate,
                    feature,
                    user: 'Vendor Daemon',
                    computer: vendorDaemon || 'Vendor Daemon',
                    userComputer: vendorDaemon ? `Vendor Daemon@${vendorDaemon}` : 'Vendor Daemon',
                    action: 'WARNING',
                    sourceFile,
                    category: 'warning',
                    warningExpiresOn,
                    rawMessage: line.trim()
                });
                continue;
            }

            const lc = lostCommRe.exec(line);
            if (lc) {
                events.push({
                    date: curDate,
                    feature: 'Lost Comm',
                    user: 'Vendor Daemon',
                    computer: vendorDaemon || 'Vendor Daemon',
                    userComputer: vendorDaemon ? `Vendor Daemon@${vendorDaemon}` : 'Vendor Daemon',
                    action: 'LOST_COMM',
                    sourceFile,
                    category: 'lost-comm',
                    title: 'Lost communications with lmgrd.',
                    explanation: 'The vendor daemon lost communication with lmgrd.',
                    rawMessage: line.trim()
                });
                continue;
            }

            const vm = versionMismatchRe.exec(line);
            if (vm) {
                const clientVersion = vm[1];
                const daemonVersion = vm[2];
                const rawTime = this._extractTime(line);
                if (dedupeVersionMismatch && rawTime) {
                    const dedupeKey = `${sourceFile || ''}|${curDate}|${rawTime}|${clientVersion}|${daemonVersion}`;
                    if (versionMismatchSeen.has(dedupeKey)) continue;
                    versionMismatchSeen.add(dedupeKey);
                }
                events.push({
                    date: curDate,
                    feature: 'Version Mismatch',
                    user: 'Vendor Daemon',
                    computer: vendorDaemon || 'Vendor Daemon',
                    userComputer: vendorDaemon ? `Vendor Daemon@${vendorDaemon}` : 'Vendor Daemon',
                    action: 'VERSION_MISMATCH',
                    sourceFile,
                    category: 'version-mismatch',
                    clientVersion,
                    daemonVersion,
                    title: 'Version Mismatch: Client Newer Than Vendor Daemon',
                    explanation: `The client (v${clientVersion}) is newer than the vendor daemon (v${daemonVersion}). The vendor daemon must be upgraded to serve this client.`,
                    rawMessage: line.trim()
                });
                continue;
            }

            const dx = daemonExitRe.exec(line);
            if (!dx) continue;

            const signalCode = dx[1];
            const exitReason = dx[2];
            const lookupKey = `${signalCode}:${exitReason}`;
            const known = this.DAEMON_EXIT_LOOKUP[lookupKey];
            const title = known?.title || `Signal ${signalCode} / Exit ${exitReason}`;

            events.push({
                date: curDate,
                feature: `Signal ${signalCode} / Exit ${exitReason}`,
                user: 'Vendor Daemon',
                computer: vendorDaemon || 'Vendor Daemon',
                userComputer: vendorDaemon ? `Vendor Daemon@${vendorDaemon}` : 'Vendor Daemon',
                action: 'DAEMON_EXIT',
                sourceFile,
                category: 'daemon-exit',
                signalCode,
                exitReason,
                title,
                explanation: known?.explanation || 'Vendor daemon exit event captured from the debug log.',
                rawMessage: line.trim()
            });
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

    /**
     * Extract and normalize leading HH:MM:SS timestamp from a log line.
     * Handles variants like "14:42:01" and "14:42: 01".
     */
    _extractTime(line) {
        const m = /^\s*(\d{1,2}):(\d{2}):\s?(\d{2})/.exec(line);
        if (!m) return '';
        return `${m[1].padStart(2, '0')}:${m[2]}:${m[3]}`;
    },

    _escRx(s) {
        return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
};
