# Copyright (c) 2025
# Author: Jared Mathes
# This script was created using Microsoft 365 Copilot.
# Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted.
# THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

import re
from collections import defaultdict
from datetime import datetime

def parse_log_file(file_path):
    try:
        with open(file_path, 'r') as file:
            log_lines = file.readlines()
    except IOError as e:
        print(f"Error reading file {file_path}: {e}")
        return defaultdict(lambda: defaultdict(lambda: defaultdict(set)))

    log_data = defaultdict(lambda: defaultdict(lambda: defaultdict(set)))
    current_date = None
    date_pattern = re.compile(r"Start-Date: (.+?) W.|Time: (.+?) W.|TIMESTAMP (\d{2}/\d{2}/\d{4})")
    # Change "geoslope" if you have a different vendor daemon name
    log_pattern = re.compile(r"\((geoslope)\) (OUT|IN|DENIED|UNSUPPORTED): \"(pkc_\w+)\"(?: \(PORT_AT_HOST_PLUS\s+\))? (\w+@\w+)")

    for line in log_lines:
        try:
            date_match = date_pattern.search(line)
            if date_match:
                date_str = date_match.group(1) or date_match.group(2)
                if date_str:
                    current_date = datetime.strptime(date_str, "%a %b %d %Y %H:%M:%S").date()
                else:
                    current_date = datetime.strptime(date_match.group(3), "%m/%d/%Y").date()
            elif current_date:
                match = log_pattern.search(line)
                if match:
                    action, feature, user_computer = match.group(2), match.group(3), match.group(4)
                    if action == "OUT":
                        log_data[current_date][feature][user_computer].add(user_computer)
                    elif action == "DENIED":
                        log_data[current_date][feature]["DENIED"].add(user_computer)
                    elif action == "UNSUPPORTED":
                        log_data[current_date][feature]["UNSUPPORTED"].add(user_computer)
        except Exception as e:
            print(f"Error parsing line: {line}\n{e}")

    return log_data

def generate_feature_report(log_data):
    report = []
    for date, features in sorted(log_data.items()):
        report.append(f"Date: {date.strftime('%Y-%m-%d')}")
        usage_report = []
        denial_report = []
        unsupported_report = []
        for feature, users in sorted(features.items()):
            usage_count = sum(len(computers) for user, computers in users.items() if user not in ["DENIED", "UNSUPPORTED"])
            denied_count = len(users.get("DENIED", []))
            unsupported_count = len(users.get("UNSUPPORTED", []))
            if usage_count > 0:
                usage_report.append(f"  Count: {usage_count}, Feature: {feature}")
            if denied_count > 0:
                denial_report.append(f"  Count: {denied_count}, DENIED: {feature}, (Licensed number of users already reached. (-4,342))")
            if unsupported_count > 0:
                unsupported_report.append(f"  Count: {unsupported_count}, UNSUPPORTED: {feature}, (No such feature exists. (-5,346))")
        report.extend(usage_report)
        report.extend(denial_report)
        report.extend(unsupported_report)
        report.append("")  # Add a blank line at the end of each date
    return "\n".join(report)

def save_report_to_file(report, file_path):
    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    header = f"lmadmin Feature Usage Summary (Generated on {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} from log file {file_path})"
    file_name = f"{timestamp}_feature_report.txt"
    
    try:
        with open(file_name, 'w') as file:
            file.write(header + "\n\n")
            file.write(report)
        print(f"Report saved to {file_name}")
    except IOError as e:
        print(f"Error saving report to file {file_name}: {e}")

def main():
    import tkinter as tk
    from tkinter import filedialog

    root = tk.Tk()
    root.withdraw()
    
    file_path = filedialog.askopenfilename(filetypes=[("Log files", "*.log")])
    
    if not file_path:
        print("No file selected.")
        return
    
    log_data = parse_log_file(file_path)
    report = generate_feature_report(log_data)
    save_report_to_file(report, file_path)

if __name__ == "__main__":
    main()