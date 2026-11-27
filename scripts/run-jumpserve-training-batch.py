#!/usr/bin/env python3
"""Supervise a web-requested batch and report a limited copy of its journal."""

from datetime import datetime, timezone
import fcntl
import json
import os
from pathlib import Path
import re
import signal
import stat
import subprocess
import sys
import time


HEARTBEAT_SECONDS = 20
PAPER_PHASES = {"pending", "generating", "verifying", "passed", "completed", "generation_error", "verification_error",
                "stopped", "interrupted"}
STEP_STATUSES = {"running", "completed", "stopped", "interrupted"}
STEP_START = re.compile(r"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z")
STOP_PHASES = {"generating", "verifying", "saving_generator", "saving_verifier"}
BATCH_ID = re.compile(r"[1-9][0-9]{0,9}")
PAPER_ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9_-]{0,63}")
ACTIVITY_SCHEMA = json.loads((Path(__file__).parent / "lib" / "jumpserve-synthetic-activity-schema.json").read_text())


def utc_now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def journal(path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return {}


def snapshot_steps(steps):
    visible = {}
    for role in ("generator", "verifier"):
        entry = steps.get(role)
        if not isinstance(entry, dict):
            continue
        status = entry.get("status")
        if not isinstance(status, str) or status not in STEP_STATUSES:
            continue
        duration = entry.get("durationMs")
        if status == "running" or type(duration) is not int or not 0 <= duration <= 9_007_199_254_740_991:
            duration = None
        visible[role] = {"status": status, "durationMs": duration}
        started_at = entry.get("startedAt")
        if isinstance(started_at, str) and STEP_START.fullmatch(started_at):
            visible[role]["startedAt"] = started_at
    return visible


def snapshot(state, outcome=None):
    status = state.get("status", "preparing")
    if status not in {"passed", "completed", "stopped", "interrupted"} and outcome:
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
            **({"steps": snapshot_steps(paper["steps"])} if isinstance(paper.get("steps"), dict) else {}),
        })
    stop_phase = state.get("stop", {}).get("phase")
    guidance = state.get("guidance", {})
    return {
        "status": status,
        "activityAvailable": True,
        "updatedAt": utc_now(),
        "startedAt": state.get("started_at"),
        "finishedAt": state.get("finished_at") or (utc_now() if outcome else None),
        "stopPhase": stop_phase if stop_phase in STOP_PHASES else None,
        "versions": {role: guidance.get(role, {}).get("version_number") for role in ("generator", "verifier")},
        "papers": papers,
    }


def publish(bucket, batch_id, directory, data, attempts=1, paper_id=None):
    file = f"activity-{paper_id}.json" if paper_id else "progress.json"
    key = f"activity/{batch_id}/{paper_id}.json" if paper_id else f"progress/{batch_id}.json"
    path = directory / file
    temporary = directory / f"{file}.tmp"
    temporary.write_text(json.dumps(data), encoding="utf-8")
    temporary.replace(path)
    for attempt in range(attempts):
        try:
            subprocess.run(
                ["aws", "--region", "us-east-1", "--no-cli-pager", "--cli-connect-timeout", "3",
                 "--cli-read-timeout", "5", "s3api", "put-object", "--bucket", bucket,
                 "--key", key, "--content-type", "application/json",
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


def activity_tail(path):
    try:
        descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        with os.fdopen(descriptor, "rb") as source:
            info = os.fstat(source.fileno())
            if not stat.S_ISREG(info.st_mode):
                return []
            offset = max(0, info.st_size - ACTIVITY_SCHEMA["maxBytes"])
            source.seek(offset)
            data = source.read(ACTIVITY_SCHEMA["maxBytes"])
    except OSError:
        return []
    if offset:
        data = data.partition(b"\n")[2]
    events = []
    for line in data.rpartition(b"\n")[0].splitlines():
        try:
            raw = json.loads(line)
        except (ValueError, UnicodeError):
            continue
        if not isinstance(raw, dict):
            continue
        kind, at = raw.get("kind"), raw.get("at")
        if not isinstance(kind, str) or kind not in ACTIVITY_SCHEMA["labels"] or not isinstance(at, str) or not re.fullmatch(
            r"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,6})?(?:Z|\+00:00)", at
        ):
            continue
        item = {"kind": kind, "at": at}
        if kind in {"command_started", "command_completed"} and raw.get("program") in ACTIVITY_SCHEMA["programs"]:
            item["program"] = raw["program"]
        exit_code = raw.get("exitCode")
        if kind == "command_completed" and type(exit_code) is int and 0 <= exit_code <= 255:
            item["exitCode"] = exit_code
        events.append(item)
    return events[-ACTIVITY_SCHEMA["maxEvents"]:]


def publish_activity(bucket, batch_id, directory, output, state, previous):
    for paper in state.get("cases", []):
        paper_id = paper["paper_id"]
        if not PAPER_ID.fullmatch(paper_id):
            continue
        data = {role: activity_tail(output / paper_id / f"ec2-{role}" / "activity.jsonl")
                for role in ("generator", "verifier")}
        if any(data.values()) and data != previous.get(paper_id):
            try:
                if publish(bucket, batch_id, directory, data, paper_id=paper_id):
                    previous[paper_id] = data
            except OSError:
                print("Could not record training batch activity.", file=sys.stderr)


def supervise(bucket, batch_id, directory, output):
    scripts = Path(__file__).resolve().parent
    journal_path = output / "batch.json"
    process = None
    interrupted = False
    last_activity = {}

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
        parallel_volumes = os.environ.get("JUMPSERVE_WORKER_AUTH_VOLUMES", "")
        volumes = parallel_volumes or os.environ.get("JUMPSERVE_WORKER_AUTH_VOLUME", "")
        subnet = os.environ.get("JUMPSERVE_WORKER_SUBNET_ID", "")
        security_group = os.environ.get("JUMPSERVE_WORKER_SECURITY_GROUP_ID", "")
        process = subprocess.Popen([
            "node", "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
            "--import", str(scripts / "lib" / "register-typescript.mjs"),
            str(scripts / "run-jumpserve-synthetic-batch.mjs"),
            *(arg for volume in volumes.split(",") if volume.strip() for arg in ("--worker-auth-volume", volume.strip())),
            "--worker-zone", os.environ["JUMPSERVE_WORKER_ZONE"],
            *(["--parallel"] if parallel_volumes else []),
            *(["--worker-subnet", subnet, "--worker-security-group", security_group] if subnet or security_group else []),
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
                publish_activity(bucket, batch_id, directory, output, state, last_activity)
        return process.returncode
    finally:
        if process is not None and process.poll() is None:
            process.terminate()
            process.wait()
        outcome = "interrupted" if interrupted else "failed"
        state = journal(journal_path)
        publish_activity(bucket, batch_id, directory, output, state, last_activity)
        publish(bucket, batch_id, directory, snapshot(state, outcome), attempts=3)


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
