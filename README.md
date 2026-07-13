# lmadmin Debug Log Reader

> **Live demo:** [https://j-mathes.github.io/lmadmin-debug-log-reader/](https://j-mathes.github.io/lmadmin-debug-log-reader/)

Two independent tools for parsing and analysing lmadmin debug log files:

- **Web Viewer** (`index.html`) — interactive browser-based GUI with charts, filtering, and reports
- **CLI Script** (`lmadmin_feature_usage_summary.py`) — command-line report generator

---

## Web Viewer

Open `index.html` directly in a browser — no installation or server required.

### Features

- **Load multiple log files** — drag & drop or use File menu; data accumulates across files
- **Interactive chart** — line, bar, or stacked-bar chart; view usage by Feature, User, or Computer
- **Breakdown mode** — when viewing by User or Computer:
  - **Consolidated** — one series per user/computer; Features panel acts as a count filter
  - **By Feature** — one series per feature; legend becomes a Users/Computers filter
- **Summary cards** — totals for checkouts, unique features, users, computers, denials, expired features, and daemon exits
- **Date range filter** — zoom into any time period without reloading
- **Linked hover** — hovering a Series entry highlights the matching chart series and vice versa
- **Real-time filters** (left panel, no Apply button needed):
  - **Action** — toggle Checkouts, Denied, Unsupported, Warnings, Expired, Daemon Exits, and Lost Comm; All / None buttons
  - **Series** — show/hide individual series; All / None buttons
  - **Features** — per-feature sub-filter in User and Computer views; All / None buttons
- **Nine reports** (Report tab): Feature Usage by Date, User Summary, Computer Summary, Feature Totals, Denial/Warning/Unsupported/Expired, Vendor Daemon Exit Events, Top Users by Checkout, Top Features by Checkout, and All Reports Combined
- **Export** — reports as plain text or Markdown; chart as PNG, JPEG, or SVG via **File → Export Chart…**
- **Settings** (Settings tab):
  - Vendor daemon name (default: `geoslope`) and feature prefix filter (default: `pkc_`) with an enable/disable toggle
  - Light / dark theme and customisable colour palette
  - Default chart type, Top N, and action visibility toggles
  - Tooltip options: hide zero values, hover-lock vs. click-to-pin, sticky delay
  - Summary card font size and horizontal scroll settings
  - Settings persisted to `localStorage`; importable/exportable as JSON

### Quick Start

1. Open `index.html` in Chrome, Edge, or Firefox
2. Use **File → Load Log File(s)** or drag `.log` files onto the window
3. The chart and summary cards populate immediately
4. Use the left panel to filter by Action, toggle series, or narrow by Feature — all changes are real-time
5. Use the toolbar dropdowns (View By, Chart Type, Top N, date range) and click **Apply** to redraw
6. Switch to the **Report** tab to generate and export text reports
7. Switch to **Settings** to configure the vendor daemon or appearance

### File Layout

```
index.html          ← entry point
css/
  styles.css        ← all styling, light/dark themes
js/
  parser.js         ← log-file parser
  reports.js        ← text report generators
  app.js            ← main controller, chart, settings
sample_logs/        ← place test log files here (not tracked by git)
```

### Supported Log Formats

- `Start-Date: Mon Jan 15 2025 09:30:15 W. Pacific Standard Time`
- `Time: Mon Jan 15 2025 09:30:15 W. Pacific Standard Time`
- `TIMESTAMP 01/15/2025` (also supports single-digit month/day, e.g. `TIMESTAMP 2/7/2013`)

---

## CLI Script

### Requirements

- Python 3.6+
- `tkinter` (included with standard Python on Windows)

### Usage

```bash
python lmadmin_feature_usage_summary.py
```

A file dialog opens — select your `.log` file. The report is saved as `YYYY-MM-DD_HH-MM-SS_feature_report.txt` and contains a breakdown by date and feature of checkouts, denials, unsupported requests, and expired features.

### Supported Log Formats

- `Start-Date: Day Mon DD YYYY HH:MM:SS`
- `Time: Day Mon DD YYYY HH:MM:SS`
- `TIMESTAMP MM/DD/YYYY`

Recognised actions: `OUT`, `IN`, `DENIED`, `UNSUPPORTED`, `EXPIRED:`

> **Note:** The web viewer also handles warning lines, vendor-daemon exit messages, and lost-communication events, which the CLI script does not.

### Vendor Daemon Configuration

The script defaults to the `geoslope` vendor daemon. To target a different daemon, update the regex patterns in `parse_log_file()`:

```python
log_pattern = re.compile(r"\((your_vendor_name)\) (OUT|IN|DENIED|UNSUPPORTED): \"(pkc_\w+)\"(?: \(PORT_AT_HOST_PLUS\s+\))? (\w+@\w+)")
expired_pattern = re.compile(r"\((your_vendor_name)\) EXPIRED:\s+(?:\"([^\"]+)\"|(\S+))")
```

Replace `your_vendor_name` with your vendor daemon name.

---

## License

Copyright (c) 2026 Jared Mathes

This project is licensed under the [Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International License](https://creativecommons.org/licenses/by-nc-sa/4.0/).

[![CC BY-NC-SA 4.0](https://licensebuttons.net/l/by-nc-sa/4.0/88x31.png)](https://creativecommons.org/licenses/by-nc-sa/4.0/)
