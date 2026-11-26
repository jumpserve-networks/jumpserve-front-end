#!/usr/bin/env python3
"""Supervise a web-requested batch and report a limited copy of its journal."""

from datetime import datetime, timezone
import fcntl
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import sys
import time


HEARTBEAT_SECONDS = 20
PAPER_PHASES = {"pending", "generating", "verifying", "passed", "stopped"}
STOP_PHASES = {"generating", "verifying", "saving_generator", "saving_verifier"}
BATCH_ID = re.compile(r"[1-9][0-9]{0,9}")


def utc_now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def journal(path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return {}


def snapshot(state, outcome=None):
    status = state.get("status", "preparing")
    if status not in {"passed", "stopped"} and outcome:
        status = outcome
    papers = []
    for paper in state.get("cases", []):
        database = paper.get("database", {})
        score = paper.get("score")
        papers.append({
            "id": paper["paper_id"],
            "fileName": Path(paper["pdf"]).name,
            "status": paper["status"] if paper["status"] in PAPER_PHASES else "pending",
            "assessmentId": database.get("assessment_id") if database.get("generator_result_id") else None,
            "score": {"earned": score["earned"], "maximum": score["rubric_maximum"]} if score is not None else None,
        })
    stop_phase = state.get("stop", {}).get("phase")
    guidance = state.get("guidance", {})
    return {
        "status": status,
        "updatedAt": utc_now(),
        "startedAt": state.get("started_at"),
        "finishedAt": state.get("finished_at") or (utc_now() if outcome else None),
        "stopPhase": stop_phase if stop_phase in STOP_PHASES else None,
        "versions": {role: guidance.get(role, {}).get("version_number") for role in ("generator", "verifier")},
        "papers": papers,
    }


def publish(bucket, batch_id, directory, data, attempts=1):
    path = directory / "progress.json"
    temporary = directory / "progress.json.tmp"
    temporary.write_text(json.dumps(data), encoding="utf-8")
    temporary.replace(path)
    for attempt in range(attempts):
        try:
            subprocess.run(
                ["aws", "--region", "us-east-1", "--no-cli-pager", "--cli-connect-timeout", "3",
                 "--cli-read-timeout", "5", "s3api", "put-object", "--bucket", bucket,
                 "--key", f"progress/{batch_id}.json", "--content-type", "application/json",
                 "--body", str(path)],
                env={**os.environ, "AWS_MAX_ATTEMPTS": "1"},
                stdout=subprocess.DEVNULL, check=True, timeout=12,
            )
            return True
        except (OSError, subprocess.SubprocessError):
            print(f"Could not publish training batch progress for {batch_id}.", file=sys.stderr)
            if attempt + 1 < attempts:
                time.sleep(2)
    return False


def supervise(bucket, batch_id, directory, output):
    scripts = Path(__file__).resolve().parent
    journal_path = output / "batch.json"
    process = None
    interrupted = False

    def stop(signum, _frame):
        nonlocal interrupted
        interrupted = True
        if process is not None and process.poll() is None:
            process.send_signal(signum)

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    publish(bucket, batch_id, directory, snapshot({}))
    try:
        if interrupted:
            return 1
        process = subprocess.Popen([
            "node", "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
            "--import", str(scripts / "lib" / "register-typescript.mjs"),
            str(scripts / "run-jumpserve-synthetic-batch.mjs"),
            "--worker-auth-volume", os.environ["JUMPSERVE_WORKER_AUTH_VOLUME"],
            "--worker-zone", os.environ["JUMPSERVE_WORKER_ZONE"],
            "--output", str(output),
        ])
        if interrupted:
            process.terminate()
        last_state = {}
        last_report = time.monotonic()
        while process.poll() is None:
            try:
                process.wait(timeout=4)
            except subprocess.TimeoutExpired:
                state = journal(journal_path)
                if state != last_state or time.monotonic() - last_report >= HEARTBEAT_SECONDS:
                    if publish(bucket, batch_id, directory, snapshot(state)):
                        last_state = state
                        last_report = time.monotonic()
        return process.returncode
    finally:
        if process is not None and process.poll() is None:
            process.terminate()
            process.wait()
        outcome = "interrupted" if interrupted else "failed"
        publish(bucket, batch_id, directory, snapshot(journal(journal_path), outcome), attempts=3)


def main():
    if len(sys.argv) != 2 or not BATCH_ID.fullmatch(sys.argv[1]) or int(sys.argv[1]) > 2_147_483_647:
        raise SystemExit("Expected a positive training batch integer ID.")
    batch_id = sys.argv[1]
    bucket = os.environ["JUMPSERVE_TRAINING_BATCH_BUCKET"]
    runs = Path(os.environ.get("JUMPSERVE_RUNS_DIRECTORY", Path.home() / "jumpserve-runs"))
    directory = runs / ".training-requests" / batch_id
    os.umask(0o077)
    try:
        directory.mkdir(parents=True)
    except FileExistsError:
        # A repeated delivery of the same start request must not run it again.
        return 0
    with (runs / "batch.lock").open("ab") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            publish(bucket, batch_id, directory, snapshot({}, "busy"), attempts=3)
            return 0
        return supervise(bucket, batch_id, directory, runs / batch_id)


if __name__ == "__main__":
    sys.exit(main())
