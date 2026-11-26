#!/usr/bin/env python3
"""Run the local JumpServe Generator and Verifier batch on macOS."""

import argparse
import os
from pathlib import Path
import shutil


def timeout_minutes(value):
    try:
        minutes = int(value)
    except ValueError:
        raise argparse.ArgumentTypeError("enter a whole number of minutes") from None
    if not 1 <= minutes <= 1440:
        raise argparse.ArgumentTypeError("enter a timeout between 1 and 1440 minutes")
    return minutes


def main():
    parser = argparse.ArgumentParser(
        description=(
            "Run the Generator and then the Verifier for each PDF in "
            "pdfs/synthetic_papers and save both results privately in Supabase. "
            "Stop unless the Verifier awards full credit."
        ),
        allow_abbrev=False,
    )
    preflight = parser.add_mutually_exclusive_group()
    preflight.add_argument("--inventory", action="store_true", help="list PDFs and matching answer keys")
    preflight.add_argument("--check-runtime", action="store_true", help="check Codex and its ChatGPT sign-in")
    preflight.add_argument("--coach-report", type=Path, help="save a completed Coach report with its Verifier IDs")
    parser.add_argument("--output", type=Path, help="new directory for the batch journal and evidence")
    parser.add_argument("--model", help="Codex model for both stages")
    parser.add_argument("--timeout-minutes", type=timeout_minutes, help="maximum time per stage (default 30)")
    args = parser.parse_args()

    node = shutil.which("node")
    if node is None:
        parser.error("Node.js 24 or newer is required for the JumpServe batch runner.")

    scripts = Path(__file__).resolve().parent
    command = [node, "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "--import",
               str(scripts / "lib" / "register-typescript.mjs"),
               str(scripts / "run-jumpserve-synthetic-batch.mjs"), "--native"]
    if args.inventory:
        command.append("--inventory")
    elif args.check_runtime:
        command.append("--check-runtime")
    elif args.coach_report is not None:
        command.extend(["--coach-report", str(args.coach_report.expanduser().absolute())])
    if args.output is not None:
        command.extend(["--output", str(args.output.expanduser().absolute())])
    if args.model is not None:
        command.extend(["--model", args.model])
    if args.timeout_minutes is not None:
        command.extend(["--timeout-minutes", str(args.timeout_minutes)])

    # Keep the runner in the foreground with its original exit status and signal handling.
    try:
        os.execv(node, command)
    except OSError as error:
        parser.exit(1, f"Could not start the JumpServe batch runner: {error}\n")


if __name__ == "__main__":
    main()
