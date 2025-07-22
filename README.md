# lmadmin Feature Usage Summary

A Python script for parsing and analyzing lmadmin debug log files to generate comprehensive feature usage reports.

## Overview

This tool processes lmadmin debug log files and extracts license feature usage information, including successful checkouts, denials, and unsupported feature requests. It generates a timestamped summary report showing usage patterns by date and feature.

## Features

- **Log File Parsing**: Processes lmadmin debug log files with multiple date formats
- **Usage Tracking**: Tracks feature checkouts (OUT), denials (DENIED), and unsupported requests (UNSUPPORTED)
- **User/Computer Mapping**: Associates usage with specific user@computer combinations
- **Date-based Reporting**: Organizes results by date for trend analysis
- **Automated Report Generation**: Creates timestamped text reports with usage summaries
- **GUI File Selection**: User-friendly file picker interface

## Requirements

- Python 3.6 or higher
- tkinter (usually included with Python)
- No additional dependencies required

## Installation

1. Clone or download the repository:
   ```bash
   git clone https://github.com/j-mathes/lmadmin-debug-log-reader.git
   cd lmadmin-debug-log-reader
   ```

2. Ensure Python 3.6+ is installed on your system

## Usage

### Basic Usage

Run the script and select a log file through the GUI:

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

### Vendor Daemon Configuration

By default, the script looks for entries from the "geoslope" vendor daemon. To use with different vendor daemons, modify line 22:

```python
log_pattern = re.compile(r"\((your_vendor_name)\) (OUT|IN|DENIED|UNSUPPORTED): \"(pkc_\w+)\"(?: \(PORT_AT_HOST_PLUS\s+\))? (\w+@\w+)")
```

Replace `geoslope` with your vendor daemon name.

## Output Format

The generated report includes:

### Usage Summary
```
Date: 2025-01-15
  Count: 5, Feature: pkc_feature_name
  Count: 2, DENIED: pkc_another_feature, (Licensed number of users already reached. (-4,342))
  Count: 1, UNSUPPORTED: pkc_unknown_feature, (No such feature exists. (-5,346))
```

### Report Sections
- **Count**: Number of successful feature checkouts
- **DENIED**: License denials due to insufficient available licenses
- **UNSUPPORTED**: Requests for non-existent features

## Example Log Entries

The script processes log entries like:
```
Start-Date: Mon Jan 15 2025 09:30:15
(geoslope) OUT: "pkc_slope_w" user@computer
(geoslope) DENIED: "pkc_slope_w" user2@computer2
(geoslope) UNSUPPORTED: "pkc_invalid_feature" user3@computer3
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

This software is provided under a permissive license. See the header comments in the source file for full license text.

## Contributing

Feel free to submit issues, feature requests, or pull requests to improve this tool.

## Author

Created by Jared Mathes using Microsoft 365 Copilot.

---

For questions or support, please open an issue in the repository.
