# lmadmin Debug Log Reader

Tools for parsing and analyzing lmadmin debug log files.  Two independent tools are provided:

- **Web Viewer** (`index.html`) — interactive GUI with charts, filtering, and multiple report types
- **CLI Script** (`lmadmin_feature_usage_summary.py`) — original command-line report generator

## Overview

This repository contains two independent tools for analysing lmadmin debug log files.

---

## Web Viewer (`index.html`)

An interactive, browser-based GUI requiring no installation or server.

### Features

- **Load multiple log files** — drag & drop or use File menu; data accumulates across files
- **Interactive chart** — line, bar, or stacked-bar chart with dates on X-axis and counts on Y-axis
- **Three view modes** — visualise usage by Feature, User, or Computer
- **Breakdown mode** — when viewing by User or Computer, a **Breakdown** toolbar select appears:
  - **Consolidated** (default) — one series per user/computer, with the Features panel acting as a count filter
  - **By Feature** — series become individual features; the legend Series section becomes a Users/Computers filter so you can see exactly which features each user or computer checked out; each feature in the Features panel shows a colour swatch matching its chart series (grey swatch for features outside the current top-N)
- **Horizontal scroll** — when enabled the chart expands to show every date label; configurable minimum pixels per label
- **Summary cards** — instant totals for checkouts, unique features, users, computers, denials, expired features, and vendor-daemon exits
- **Date range filter** — zoom into any time period without reloading
- **Left panel — three real-time filter sections** (all changes apply instantly, no Apply button needed):
  - **Action** — independently toggle Checkouts, Denied, Unsupported, Warnings, Expired, Daemon Exits, and Lost Comm events; All / None buttons
  - **Series** — click any series to show/hide it on the chart; All / None buttons (in By Feature mode this becomes a Users/Computers filter)
  - **Features** — per-feature sub-filter (visible in User and Computer views); All / None buttons; expands dynamically from the bottom; filter panel stays visible when all items are deselected so you can re-select without losing context
- **Eight report types** (Report tab):
  - Feature Usage by Date *(matches original Python output)*
  - User Summary
  - Computer Summary
  - Feature Totals — sortable all-time table
  - Denial, Warning, Unsupported & Expired Report
  - Vendor Daemon Exit Events
  - Top Users by Checkout
  - Top Features by Checkout
  - **All Reports (Combined View)** — displays every report in one scrollable output
- **Export format** — choose **Plain Text (.txt)** or **Markdown (.md)** before generating or exporting
- **Rich external tooltip** — scrollable tooltip content with optional zero-value hiding; in Click to Pin mode, a pin icon and tiny Pinned/Unpinned indicator appear in the tooltip header
- **Export** — save any report to a file; "All Reports" triggers a separate download per type; export the chart via **File → Export Chart…** in PNG, JPEG, or SVG — SVG is true vector (scalable, editable in Inkscape/Illustrator); all formats include the full chart width (including any horizontally scrolled-off area) and the legend panel
- **Settings** (Settings tab):
  - Vendor daemon name (default: `geoslope`)
  - Feature prefix filter (default: `pkc_`) with an enable/disable toggle for vendors that do not use a consistent prefix
  - Light / dark theme
  - Customisable chart colour palette — configurable number of colours; add or remove swatches individually
  - Default chart type and Top N
  - Default visibility toggles for Warnings, Expired, Daemon Exits, and Lost Comm in the dashboard chart
  - Tooltip options: hide zero-value entries, interaction mode (Hover to Lock or Click to Pin), sticky-delay duration, and a pin-state indicator when using Click to Pin
  - Summary-card value font size (px) for all top dashboard cards, with a smaller default so full date ranges fit more reliably
  - Horizontal scroll on/off and minimum pixels per date label
  - Settings persisted to `localStorage`; importable/exportable as JSON

### Quick Start

1. Open `index.html` in a modern browser (Chrome, Edge, Firefox)
2. Go to **File → Load Log File(s)** or drag `.log` files onto the window
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
  parser.js         ← log-file parser (mirrors Python logic)
  reports.js        ← text report generators
  app.js            ← main controller, chart, settings
sample_logs/        ← place test log files here (not tracked by git)
```

### Supported Log Formats

Same formats as the Python script:
- `Start-Date: Mon Jan 15 2025 09:30:15 W. Pacific Standard Time`
- `Time: Mon Jan 15 2025 09:30:15 W. Pacific Standard Time`
- `TIMESTAMP 01/15/2025` (also supports single-digit month/day, e.g. `TIMESTAMP 2/7/2013`)

---

## CLI Script (`lmadmin_feature_usage_summary.py`)

### Requirements

- Python 3.6 or higher
- `tkinter` (included with standard Python on Windows)
- No additional dependencies required

### Installation

```bash
   git clone https://github.com/j-mathes/lmadmin-debug-log-reader.git
   cd lmadmin-debug-log-reader
   ```

### Usage

```bash
python lmadmin_feature_usage_summary.py
```

1. A file dialog will open
2. Select your lmadmin debug log file (*.log)
3. The script will process the file and generate a report
4. The report will be saved as `YYYY-MM-DD_HH-MM-SS_feature_report.txt`

### Supported Log Formats

The script recognizes these date patterns in log files:
- `Start-Date: Day Mon DD YYYY HH:MM:SS`
- `Time: Day Mon DD YYYY HH:MM:SS`
- `TIMESTAMP MM/DD/YYYY`

The parser recognizes these action entries:
- `OUT`, `IN`, `DENIED`, `UNSUPPORTED`
- `Warning: <feature> expires <date>`
- `EXPIRED:`
- `EXITING DUE TO SIGNAL <signal> Exit reason <reason>`
- `Lost communications with lmgrd.`

For `EXPIRED:` lines, repeated entries for the same feature at the same timestamp are collapsed into a single reported event.
For vendor-daemon shutdown lines, the web viewer recognizes these signal/exit-reason mappings and records them as separate daemon-exit timeline events: `25/2`, `27/4`, `28/5`, `32/9`, `51/28`, and `65/42`.

### Vendor Daemon Configuration

By default, the script looks for entries from the `geoslope` vendor daemon. To use a different vendor daemon, update the parser regex patterns in `parse_log_file()`:

```python
log_pattern = re.compile(r"\((your_vendor_name)\) (OUT|IN|DENIED|UNSUPPORTED): \"(pkc_\w+)\"(?: \(PORT_AT_HOST_PLUS\s+\))? (\w+@\w+)")
expired_pattern = re.compile(r"\((your_vendor_name)\) EXPIRED:\s+(?:\"([^\"]+)\"|(\S+))")
```

Replace `your_vendor_name` with your vendor daemon name.

## Output Format

The generated report includes:

### Usage Summary
```
Date: 2025-01-15
  Count: 5, Feature: pkc_feature_name
  Count: 2, DENIED: pkc_another_feature, (Licensed number of users already reached. (-4,342))
  Count: 1, UNSUPPORTED: pkc_unknown_feature, (No such feature exists. (-5,346))
  Count: 1, EXPIRED: pkc_legacy_feature, (Feature license is expired.)
```

### Report Sections
- **Count**: Number of successful feature checkouts
- **DENIED**: License denials due to insufficient available licenses
- **UNSUPPORTED**: Requests for non-existent features
- **EXPIRED**: Requests for features with expired licenses

## Example Log Entries

The script processes log entries like:
```
Start-Date: Mon Jan 15 2025 09:30:15
(geoslope) OUT: "pkc_slope_w" user@computer
(geoslope) DENIED: "pkc_slope_w" user2@computer2
(geoslope) UNSUPPORTED: "pkc_invalid_feature" user3@computer3
(geoslope) EXPIRED: pkc_legacy_feature
```

## Error Handling

- **File Access Errors**: Gracefully handles missing or inaccessible files
- **Parsing Errors**: Continues processing when encountering malformed log lines
- **Date Format Issues**: Supports multiple date formats commonly found in lmadmin logs

## Output Files

Reports are saved with the format: `YYYY-MM-DD_HH-MM-SS_feature_report.txt`

Each report includes:
- Generation timestamp
- Source log file path
- Detailed usage breakdown by date and feature

## Troubleshooting

### Common Issues

1. **No file selected**: Make sure to select a valid log file in the file dialog
2. **Empty report**: Check that your log file contains the expected vendor daemon name
3. **Date parsing errors**: Verify your log file uses supported date formats

### Log File Requirements

- File must be readable text format
- Should contain lmadmin debug output
- Must include recognizable date stamps
- Should contain vendor daemon entries in expected format

## License

Copyright (c) 2026 Jared Mathes

This project is licensed under the [Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International License](https://creativecommons.org/licenses/by-nc-sa/4.0/).

[![CC BY-NC-SA 4.0](https://licensebuttons.net/l/by-nc-sa/4.0/88x31.png)](https://creativecommons.org/licenses/by-nc-sa/4.0/)

You are free to share and adapt this work for non-commercial purposes, provided you give appropriate credit and distribute your contributions under the same license. See the [LICENSE](LICENSE) file for full details.

## Contributing

Feel free to submit issues, feature requests, or pull requests to improve this tool.

## Author

Created by Jared Mathes

---

For questions or support, please open an issue in the repository.
