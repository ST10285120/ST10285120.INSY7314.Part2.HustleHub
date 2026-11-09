#!/usr/bin/env python3
"""
Quality gate for SARIF reports (CodeQL, Semgrep).

Prints every finding, writes a Markdown table to the GitHub job summary and
exits non-zero if any finding is at or above the threshold:

  --min-security-severity 7.0   CodeQL: fail on high (7.0-8.9) and critical (9.0+)
  --fail-level error            Semgrep: fail on ERROR-severity rules

Usage: sarif_gate.py REPORT.sarif [--min-security-severity N] [--fail-level error] [--title T]
"""
import argparse
import json
import os
import sys


def load_rules(run):
    rules = {}
    driver = run.get("tool", {}).get("driver", {})
    for rule in driver.get("rules", []) or []:
        rules[rule.get("id")] = rule
    for ext in run.get("tool", {}).get("extensions", []) or []:
        for rule in ext.get("rules", []) or []:
            rules[rule.get("id")] = rule
    return rules


def severity_of(rule):
    props = (rule or {}).get("properties", {}) or {}
    try:
        return float(props.get("security-severity"))
    except (TypeError, ValueError):
        return None


def level_of(result, rule):
    if result.get("level"):
        return result["level"]
    return ((rule or {}).get("defaultConfiguration") or {}).get("level", "warning")


def location_of(result):
    try:
        loc = result["locations"][0]["physicalLocation"]
        return f'{loc["artifactLocation"]["uri"]}:{loc.get("region", {}).get("startLine", "?")}'
    except (KeyError, IndexError):
        return "?"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("reports", nargs="+")
    parser.add_argument("--min-security-severity", type=float, default=None)
    parser.add_argument("--fail-level", default=None, choices=["error", "warning", "note"])
    parser.add_argument("--title", default="Static analysis")
    args = parser.parse_args()

    findings = []
    suppressed = []
    for path in args.reports:
        with open(path, encoding="utf-8") as fh:
            sarif = json.load(fh)
        for run in sarif.get("runs", []):
            rules = load_rules(run)
            for result in run.get("results", []) or []:
                rule = rules.get(result.get("ruleId"))
                # SARIF "suppressions": the finding was reviewed and suppressed in
                # source (e.g. a justified `nosemgrep` comment). Listed, never blocking.
                if result.get("suppressions"):
                    suppressed.append({
                        "rule": result.get("ruleId", "?"),
                        "location": location_of(result),
                    })
                    continue
                findings.append({
                    "rule": result.get("ruleId", "?"),
                    "level": level_of(result, rule),
                    "severity": severity_of(rule),
                    "location": location_of(result),
                    "message": (result.get("message", {}).get("text") or "").splitlines()[0][:160],
                })

    order = {"error": 0, "warning": 1, "note": 2, "none": 3}
    findings.sort(key=lambda f: (-(f["severity"] or 0), order.get(f["level"], 9)))

    def blocking(f):
        if args.min_security_severity is not None and f["severity"] is not None:
            if f["severity"] >= args.min_security_severity:
                return True
        if args.fail_level and order.get(f["level"], 9) <= order[args.fail_level]:
            return True
        return False

    blockers = [f for f in findings if blocking(f)]

    lines = [f"### {args.title}", "",
             f"**{len(findings)}** finding(s), **{len(blockers)}** blocking.", ""]
    if findings:
        lines += ["| Blocking | Level | Severity | Rule | Location | Message |",
                  "|---|---|---|---|---|---|"]
        for f in findings:
            sev = "" if f["severity"] is None else f'{f["severity"]:.1f}'
            msg = f["message"].replace("|", "\\|")
            lines.append(f'| {"❌" if blocking(f) else ""} | {f["level"]} | {sev} | `{f["rule"]}` | `{f["location"]}` | {msg} |')
    else:
        lines.append("✅ No findings.")
    if suppressed:
        lines += ["", f"**{len(suppressed)}** reviewed finding(s) suppressed in source (not blocking):", ""]
        lines += [f'- `{f["rule"]}` at `{f["location"]}`' for f in suppressed]
    report = "\n".join(lines) + "\n"
    print(report)

    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as fh:
            fh.write(report)

    if blockers:
        print(f"::error::{len(blockers)} blocking finding(s) in {args.title}.")
        sys.exit(1)


if __name__ == "__main__":
    main()
