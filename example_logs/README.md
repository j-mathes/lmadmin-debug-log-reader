# lmadmin Log Generator

Generates anonymized lmadmin debug log files for testing and demonstration.
The script parses one or more real log files to learn the feature vocabulary and
vendor daemon name, then produces a new synthetic log over a chosen date range
with all usernames and computer names replaced by generic identifiers.

## Files in this folder

| File | Description |
|---|---|
| `log_generator.py` | The generator script |
| `demo_geoslope.log` | Pre-generated example log (2025-01-06 → 2025-03-28) |

## Requirements

- Python 3.8 or higher
- `tkinter` — included with standard Python on Windows; needed for GUI mode only

## Usage

### Interactive GUI (default)

```bash
python log_generator.py
```

Opens a window where you can:
1. **Add source log files** — the script reads feature names and the vendor daemon
   name from them. Leave the list empty to use the built-in geoslope defaults.
2. **Set the date range** — start and end dates in `YYYY-MM-DD` format.
3. **Tune options** — events per workday, number of anonymized users, denial
   probability, unsupported-event probability, and whether to include weekends.
4. Click **Generate & Save…** to write the result to a file of your choice.

### Demo mode

```bash
python log_generator.py --demo
```

Generates (or regenerates) `demo_geoslope.log` in this folder using a fixed
random seed for reproducible output. Automatically reads any `.log` files found
in the project's `sample_logs/` folder to derive features.

### CLI / batch mode

```bash
python log_generator.py --cli [options]
```

All options can be combined freely:

| Option | Default | Description |
|---|---|---|
| `--source FILE …` | *(none)* | One or more source log files to parse for features |
| `--start YYYY-MM-DD` | `2025-01-06` | First day of the generated log |
| `--end YYYY-MM-DD` | `2025-03-28` | Last day of the generated log |
| `--output FILE` | `generated.log` | Output file path |
| `--users N` | `8` | Number of anonymized users to generate |
| `--density N` | `40` | Target events per workday (scales by weekday activity) |
| `--weekends` | off | Include Saturday/Sunday entries |
| `--denied-pct PCT` | `6.0` | Percentage of events that are DENIED |
| `--unsup-pct PCT` | `2.0` | Percentage of events that are UNSUPPORTED |
| `--seed N` | `42` | Random seed for reproducible output |

**Example — generate a 6-month log from real source files:**

```bash
python log_generator.py --cli \
  --source ../sample_logs/geoslope.log \
  --start 2025-01-01 \
  --end 2025-06-30 \
  --output ../sample_logs/my_test.log \
  --users 12 \
  --density 60
```

## What the generator produces

Each day in the output contains:

- An **SLOG header** block with a `Start-Date:` timestamp (the date anchor
  recognized by the web viewer and the Python CLI script)
- A mix of **OUT** (checkout) and **IN** (check-in) events, paired realistically
- **DENIED** events at the configured rate, simulating license-capacity exhaustion
- **UNSUPPORTED** events for non-existent feature names
- End-of-day automatic check-ins for any features still outstanding at 17:45

Activity volume scales by weekday: Tuesday–Thursday are busiest; Friday and
Monday are lighter; weekends are minimal (when enabled).

## Anonymization

| Original data | Replaced with |
|---|---|
| Usernames | `user1`, `user2`, … `userN` |
| Computer names | `WORKSTATION-A01`, `LAPTOP-L01`, etc. |
| Feature names | **Preserved** — they are technical product codes, not PII |
| Vendor daemon | **Preserved** — detected from source files |

## License

Copyright (c) 2026 Jared Mathes

This project is licensed under the [Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International License](https://creativecommons.org/licenses/by-nc-sa/4.0/).

See the [LICENSE](../LICENSE) file in the project root for full details.
