#!/usr/bin/env python3
# Copyright (c) 2025 — Jared Mathes
# Permission to use, copy, modify, and/or distribute this software for any
# purpose with or without fee is hereby granted.
# THE SOFTWARE IS PROVIDED "AS IS" WITHOUT WARRANTY OF ANY KIND.
"""
lmadmin Log Generator
Parses real lmadmin debug log files, learns the feature vocabulary and vendor
daemon name, then generates a new anonymized log over a user-specified date
range.  All usernames and computer names are replaced with generic identifiers.

Usage
-----
  Interactive GUI:   python log_generator.py
  Demo mode:         python log_generator.py --demo
  CLI mode:          python log_generator.py --cli --start 2025-01-01 --end 2025-03-31
                       [--source file1.log file2.log] [--output out.log]
                       [--users 8] [--density 40] [--weekends]
                       [--denied-pct 6] [--unsup-pct 2] [--seed 42]
"""

from __future__ import annotations
import argparse
import os
import random
import re
import sys
from collections import Counter
from datetime import datetime, timedelta

# ── Constants ─────────────────────────────────────────────────────────────────
_WDAY   = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
           'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
_TZ     = "W. Europe Standard Time"

# Default feature set — used when no source log files are provided.
_DEFAULT_FEATURES: dict[str, int] = {
    'pkc_geostudio': 50,
    'pkc_slopew':    30,
    'pkc_seepw':     20,
    'pkc_temp':      12,
    'pkc_ctransw':    7,
    'pkc_settle3d':   4,
}

_UNSUPPORTED_POOL = ['pkc_basic', 'pkc_legacy', 'pkc_premium_plus']

# Activity multiplier per weekday (Mon=0 … Sun=6)
_DAY_MULT = [0.80, 1.00, 1.00, 0.95, 0.70, 0.25, 0.12]


# ── Log parsing ───────────────────────────────────────────────────────────────

def parse_source_logs(
    file_paths: list[str],
) -> tuple[dict[str, int], str]:
    """Return ``(feature_counter, vendor_daemon_name)`` from source logs."""
    features = Counter()
    vendor   = 'geoslope'
    log_re   = re.compile(r'\((\w[\w-]*)\)\s+(OUT|DENIED):\s+"([^"]+)"')

    for path in file_paths:
        try:
            with open(path, encoding='utf-8', errors='replace') as fh:
                for line in fh:
                    m = log_re.search(line)
                    if m:
                        vendor = m.group(1)
                        features[m.group(3)] += 1
        except OSError:
            pass

    return dict(features) if features else dict(_DEFAULT_FEATURES), vendor


# ── Generation helpers ────────────────────────────────────────────────────────

def _fmt_date(dt: datetime) -> str:
    """Format as lmadmin Start-Date / Time value."""
    return (f"{_WDAY[dt.weekday()]} {_MONTHS[dt.month - 1]} "
            f"{dt.day:02d} {dt.year} "
            f"{dt.hour:02d}:{dt.minute:02d}:{dt.second:02d}")


def _build_user_computers(n: int) -> list[str]:
    """Return n anonymized 'userN@HOST' strings."""
    pairs = []
    for i in range(n):
        user = f"user{i + 1}"
        # Every fourth user gets a laptop; rest get workstations.
        if i % 4 == 0:
            host = f"LAPTOP-L{(i // 4) + 1:02d}"
        else:
            host = f"WORKSTATION-{chr(65 + (i // 3))}{(i % 3) + 1:02d}"
        pairs.append(f"{user}@{host}")
    return pairs


def _generate_day(
    lines: list[str],
    vendor: str,
    day: datetime,
    uc_list: list[str],
    feat_list: list[str],
    feat_norm_weights: list[float],
    density: int,
    denied_prob: float,
    unsup_prob: float,
) -> None:
    """Append one day's worth of log entries (header + events) to ``lines``."""
    # --- SLOG header ---
    hdr_ts = day.replace(hour=8, minute=30, second=0)
    hdr    = _fmt_date(hdr_ts)
    lines += [
        f" 8:30:00 ({vendor}) (@{vendor}-SLOG@) ===============================================",
        f" 8:30:00 ({vendor}) (@{vendor}-SLOG@) === Vendor Daemon ===",
        f" 8:30:00 ({vendor}) (@{vendor}-SLOG@) Vendor daemon: {vendor}",
        f" 8:30:00 ({vendor}) (@{vendor}-SLOG@) Start-Date: {hdr} {_TZ}",
        f" 8:30:00 ({vendor}) (@{vendor}-SLOG@) ===============================================",
    ]

    # --- number of events for the day ---
    mult     = _DAY_MULT[day.weekday()]
    n_events = max(4, int(density * mult * random.uniform(0.75, 1.30)))

    # Random minute-offsets within working hours 08:00–18:00
    event_mins = sorted(random.randint(8 * 60, 18 * 60) for _ in range(n_events))

    active: dict[str, list[str]] = {}   # uc -> [outstanding features]

    for t_min in event_mins:
        h, m, s = t_min // 60, t_min % 60, random.randint(0, 59)
        ts   = f"{h:2d}:{m:02d}:{s:02d}"
        uc   = random.choice(uc_list)
        roll = random.random()

        if roll < unsup_prob:
            feat = random.choice(_UNSUPPORTED_POOL)
            lines.append(
                f"{ts} ({vendor}) UNSUPPORTED: \"{feat}\""
                f" (PORT_AT_HOST_PLUS   ) {uc}  (No such feature exists. (-5,346))"
            )

        elif roll < unsup_prob + denied_prob:
            feat = random.choices(feat_list, weights=feat_norm_weights)[0]
            lines.append(
                f"{ts} ({vendor}) DENIED: \"{feat}\" {uc} "
                f" (Licensed number of users already reached. (-4,342))"
            )

        else:
            # 35 % chance of checking IN something already outstanding
            if active.get(uc) and random.random() < 0.35:
                feat = random.choice(active[uc])
                active[uc].remove(feat)
                if not active[uc]:
                    del active[uc]
                lines.append(f"{ts} ({vendor}) IN: \"{feat}\" {uc}  ")
            else:
                feat = random.choices(feat_list, weights=feat_norm_weights)[0]
                active.setdefault(uc, []).append(feat)
                lines.append(f"{ts} ({vendor}) OUT: \"{feat}\" {uc}  ")

    # End-of-day: check in any remaining outstanding features
    for uc, feats in active.items():
        for feat in feats:
            ts = f"17:{random.randint(45, 59):02d}:{random.randint(0, 59):02d}"
            lines.append(f"{ts} ({vendor}) IN: \"{feat}\" {uc}  ")

    lines.append("")   # blank line between days


def generate_log(
    feature_weights: dict[str, int],
    vendor_daemon: str,
    start_date: datetime,
    end_date: datetime,
    n_users: int       = 8,
    entries_per_day: int = 40,
    include_weekends: bool = False,
    denied_prob: float = 0.06,
    unsup_prob: float  = 0.02,
) -> str:
    """Return the complete generated log as a string."""
    feat_list    = list(feature_weights.keys())
    raw_w        = [feature_weights[f] for f in feat_list]
    total_w      = sum(raw_w)
    feat_norm_w  = [w / total_w for w in raw_w]

    uc_list = _build_user_computers(n_users)
    lines: list[str] = []
    current = start_date

    while current <= end_date:
        if not include_weekends and current.weekday() >= 5:
            current += timedelta(days=1)
            continue
        _generate_day(lines, vendor_daemon, current, uc_list,
                      feat_list, feat_norm_w,
                      entries_per_day, denied_prob, unsup_prob)
        current += timedelta(days=1)

    return "\n".join(lines)


# ── GUI ───────────────────────────────────────────────────────────────────────

def run_gui() -> None:
    try:
        import tkinter as tk
        from tkinter import ttk, filedialog, messagebox
    except ImportError:
        print("tkinter is not available. Use --cli mode.", file=sys.stderr)
        sys.exit(1)

    class App:
        def __init__(self, root: tk.Tk) -> None:
            self.root = root
            root.title("lmadmin Log Generator")
            root.resizable(False, False)
            self._file_paths: list[str] = []
            self._build_ui()

        def _build_ui(self) -> None:
            root = self.root
            PAD = {'padx': 8, 'pady': 5}

            # ── Source files ─────────────────────────────────────────────────
            f_src = ttk.LabelFrame(root, text="Source Log Files  (optional)", padding=8)
            f_src.grid(row=0, column=0, sticky='nsew', **PAD)

            self._listbox = tk.Listbox(f_src, height=5, width=62,
                                       selectmode=tk.EXTENDED,
                                       font=('Consolas', 9))
            sb = ttk.Scrollbar(f_src, orient='vertical',
                                command=self._listbox.yview)
            self._listbox.configure(yscrollcommand=sb.set)
            self._listbox.grid(row=0, column=0, sticky='nsew')
            sb.grid(row=0, column=1, sticky='ns')

            btn_row = ttk.Frame(f_src)
            btn_row.grid(row=1, column=0, sticky='w', pady=(5, 0))
            ttk.Button(btn_row, text="Add Files…",
                       command=self._add_files).pack(side='left', padx=(0, 4))
            ttk.Button(btn_row, text="Remove Selected",
                       command=self._remove_selected).pack(side='left', padx=(0, 4))
            ttk.Button(btn_row, text="Clear All",
                       command=self._clear_all).pack(side='left')

            ttk.Label(f_src,
                      text="If no files are selected, built-in default "
                           "geoslope features are used.",
                      foreground='gray', font=('', 8),
                      ).grid(row=2, column=0, sticky='w', pady=(3, 0))

            # ── Date range ───────────────────────────────────────────────────
            f_dates = ttk.LabelFrame(root, text="Date Range", padding=8)
            f_dates.grid(row=1, column=0, sticky='ew', **PAD)

            today = datetime.now()
            def_start = today.replace(month=1, day=1).strftime('%Y-%m-%d')
            def_end   = today.strftime('%Y-%m-%d')

            self.sv_start = tk.StringVar(value=def_start)
            self.sv_end   = tk.StringVar(value=def_end)

            ttk.Label(f_dates, text="Start (YYYY-MM-DD):").grid(
                row=0, column=0, sticky='w')
            ttk.Entry(f_dates, textvariable=self.sv_start, width=14).grid(
                row=0, column=1, sticky='w', padx=(6, 0))

            ttk.Label(f_dates, text="End (YYYY-MM-DD):").grid(
                row=1, column=0, sticky='w', pady=(5, 0))
            ttk.Entry(f_dates, textvariable=self.sv_end, width=14).grid(
                row=1, column=1, sticky='w', padx=(6, 0), pady=(5, 0))

            # ── Options ──────────────────────────────────────────────────────
            f_opt = ttk.LabelFrame(root, text="Options", padding=8)
            f_opt.grid(row=2, column=0, sticky='ew', **PAD)

            self.sv_density = tk.IntVar(value=40)
            self.sv_users   = tk.IntVar(value=8)
            self.sv_denied  = tk.DoubleVar(value=6.0)
            self.sv_unsup   = tk.DoubleVar(value=2.0)
            self.bv_wkends  = tk.BooleanVar(value=False)

            rows = [
                ("Events per workday:",              self.sv_density, 10,  300, 1,   '%.0f'),
                ("Number of anonymized users:",      self.sv_users,    2,   30, 1,   '%.0f'),
                ("Denial probability (%):",          self.sv_denied,   0,   50, 0.5, '%.1f'),
                ("Unsupported event probability (%):", self.sv_unsup,  0,   20, 0.5, '%.1f'),
            ]
            for r, (lbl, var, lo, hi, inc, fmt) in enumerate(rows):
                ttk.Label(f_opt, text=lbl).grid(
                    row=r, column=0, sticky='w',
                    pady=(0 if r == 0 else 4, 0))
                ttk.Spinbox(f_opt, from_=lo, to=hi, increment=inc,
                            textvariable=var, width=8,
                            format=fmt).grid(
                    row=r, column=1, sticky='w',
                    padx=(8, 0), pady=(0 if r == 0 else 4, 0))

            ttk.Checkbutton(f_opt, text="Include weekend entries",
                            variable=self.bv_wkends).grid(
                row=len(rows), column=0, columnspan=2,
                sticky='w', pady=(7, 0))

            # ── Status + button ───────────────────────────────────────────────
            self.sv_status = tk.StringVar(value="Ready. "
                "Add source files (optional), set the date range, then click Generate.")
            ttk.Label(root, textvariable=self.sv_status,
                      foreground='gray', wraplength=450,
                      ).grid(row=3, column=0, sticky='w', padx=8, pady=(4, 0))

            ttk.Button(root, text="Generate & Save…",
                       command=self._generate,
                       ).grid(row=4, column=0, sticky='w', padx=8, pady=8)

            root.columnconfigure(0, weight=1)

        # ── File list helpers ─────────────────────────────────────────────────
        def _add_files(self) -> None:
            paths = filedialog.askopenfilenames(
                title="Select source lmadmin log files",
                filetypes=[
                    ("Log files", "*.log *.txt *.debug"),
                    ("All files", "*.*"),
                ],
            )
            existing = set(self._listbox.get(0, tk.END))
            for p in paths:
                if p not in existing:
                    self._listbox.insert(tk.END, p)
                    existing.add(p)

        def _remove_selected(self) -> None:
            for i in reversed(self._listbox.curselection()):
                self._listbox.delete(i)

        def _clear_all(self) -> None:
            self._listbox.delete(0, tk.END)

        # ── Generate ──────────────────────────────────────────────────────────
        def _generate(self) -> None:
            from tkinter import messagebox  # local to allow lazy import
            # Validate dates
            try:
                start = datetime.strptime(self.sv_start.get().strip(), '%Y-%m-%d')
                end   = datetime.strptime(self.sv_end.get().strip(),   '%Y-%m-%d')
            except ValueError:
                messagebox.showerror("Invalid date",
                                     "Both dates must be in YYYY-MM-DD format.")
                return
            if end < start:
                messagebox.showerror("Invalid range",
                                     "End date must be on or after start date.")
                return

            # Parse source files
            source_files = list(self._listbox.get(0, tk.END))
            if source_files:
                self.sv_status.set("Parsing source files…")
                self.root.update()
                feature_weights, vendor = parse_source_logs(source_files)
            else:
                feature_weights, vendor = dict(_DEFAULT_FEATURES), 'geoslope'

            self.sv_status.set("Generating log entries…")
            self.root.update()

            content = generate_log(
                feature_weights  = feature_weights,
                vendor_daemon    = vendor,
                start_date       = start,
                end_date         = end,
                n_users          = int(self.sv_users.get()),
                entries_per_day  = int(self.sv_density.get()),
                include_weekends = bool(self.bv_wkends.get()),
                denied_prob      = float(self.sv_denied.get()) / 100.0,
                unsup_prob       = float(self.sv_unsup.get())  / 100.0,
            )

            out_path = filedialog.asksaveasfilename(
                title="Save generated log file",
                defaultextension=".log",
                initialfile=(
                    f"generated_{start.strftime('%Y%m%d')}"
                    f"_{end.strftime('%Y%m%d')}.log"
                ),
                filetypes=[
                    ("Log files", "*.log"),
                    ("Text files", "*.txt"),
                    ("All files", "*.*"),
                ],
            )
            if not out_path:
                self.sv_status.set("Save cancelled.")
                return

            try:
                os.makedirs(os.path.dirname(os.path.abspath(out_path)),
                            exist_ok=True)
                with open(out_path, 'w', encoding='utf-8') as fh:
                    fh.write(content)
                n_lines = content.count('\n')
                self.sv_status.set(
                    f"Done!  {n_lines:,} lines saved to: "
                    f"{os.path.basename(out_path)}"
                )
            except OSError as exc:
                messagebox.showerror("Save error", str(exc))
                self.sv_status.set("Error: could not save file.")

    root = tk.Tk()
    App(root)
    root.mainloop()


# ── Demo / CLI modes ──────────────────────────────────────────────────────────

def run_demo() -> None:
    """Generate a reproducible demo log in the same folder as this script."""
    script_dir  = os.path.dirname(os.path.abspath(__file__))
    example_dir = script_dir                                   # script lives here
    out_path    = os.path.join(example_dir, 'demo_geoslope.log')

    # Try to pick up features from sample_logs/ which sits next to example_logs/
    project_dir = os.path.dirname(script_dir)
    sample_dir  = os.path.join(project_dir, 'sample_logs')
    source_logs = [
        os.path.join(sample_dir, f)
        for f in os.listdir(sample_dir)
        if f.lower().endswith('.log')
    ] if os.path.isdir(sample_dir) else []

    if source_logs:
        feature_weights, vendor = parse_source_logs(source_logs)
        # Supplement with any default features not found in sources
        for feat, wt in _DEFAULT_FEATURES.items():
            if feat not in feature_weights:
                feature_weights[feat] = wt
    else:
        feature_weights, vendor = dict(_DEFAULT_FEATURES), 'geoslope'

    random.seed(42)   # reproducible output
    content = generate_log(
        feature_weights  = feature_weights,
        vendor_daemon    = vendor,
        start_date       = datetime(2025, 1, 6),
        end_date         = datetime(2025, 3, 28),
        n_users          = 9,
        entries_per_day  = 52,
        include_weekends = False,
        denied_prob      = 0.07,
        unsup_prob       = 0.025,
    )

    os.makedirs(example_dir, exist_ok=True)
    with open(out_path, 'w', encoding='utf-8') as fh:
        fh.write(content)
    n_lines = content.count('\n')
    print(f"Demo log written to:  {out_path}")
    print(f"Lines generated:      {n_lines:,}")


def run_cli(args: argparse.Namespace) -> None:
    source_files = args.source or []
    if source_files:
        feature_weights, vendor = parse_source_logs(source_files)
    else:
        feature_weights, vendor = dict(_DEFAULT_FEATURES), 'geoslope'

    try:
        start = datetime.strptime(args.start, '%Y-%m-%d')
        end   = datetime.strptime(args.end,   '%Y-%m-%d')
    except ValueError as exc:
        print(f"Date error: {exc}", file=sys.stderr)
        sys.exit(1)

    random.seed(args.seed)
    content = generate_log(
        feature_weights  = feature_weights,
        vendor_daemon    = vendor,
        start_date       = start,
        end_date         = end,
        n_users          = args.users,
        entries_per_day  = args.density,
        include_weekends = args.weekends,
        denied_prob      = args.denied_pct / 100.0,
        unsup_prob       = args.unsup_pct  / 100.0,
    )

    out = args.output
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    with open(out, 'w', encoding='utf-8') as fh:
        fh.write(content)
    print(f"Log written: {out}  ({content.count(chr(10)):,} lines)")


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == '__main__':
    ap = argparse.ArgumentParser(
        description='Generate anonymized lmadmin debug log files.',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__.split('\n\nUsage')[1] if '\n\nUsage' in __doc__ else ''
    )
    ap.add_argument('--demo',    action='store_true',
                    help='Generate demo log to the example_logs/ folder and exit')
    ap.add_argument('--cli',     action='store_true',
                    help='CLI mode — skip GUI')
    ap.add_argument('--source',  nargs='+', metavar='FILE',
                    help='Source log files to derive features from')
    ap.add_argument('--start',   default='2025-01-06',  metavar='YYYY-MM-DD',
                    help='Start date (default: 2025-01-06)')
    ap.add_argument('--end',     default='2025-03-28',  metavar='YYYY-MM-DD',
                    help='End date (default: 2025-03-28)')
    ap.add_argument('--output',  default='generated.log', metavar='FILE',
                    help='Output file path (CLI mode)')
    ap.add_argument('--users',   type=int,   default=8,
                    help='Number of anonymized users (default: 8)')
    ap.add_argument('--density', type=int,   default=40,
                    help='Events per workday (default: 40)')
    ap.add_argument('--weekends', action='store_true',
                    help='Include weekend entries')
    ap.add_argument('--denied-pct', type=float, default=6.0, metavar='PCT',
                    help='Denial probability %% (default: 6.0)')
    ap.add_argument('--unsup-pct',  type=float, default=2.0, metavar='PCT',
                    help='Unsupported event probability %% (default: 2.0)')
    ap.add_argument('--seed',    type=int,   default=42,
                    help='Random seed for reproducible output (default: 42)')

    args = ap.parse_args()

    if args.demo:
        run_demo()
    elif args.cli:
        run_cli(args)
    else:
        run_gui()
