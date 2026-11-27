"""Check run receipts and raw observation hashes before saving an assessment."""

import argparse
from datetime import datetime, timezone
from hashlib import sha256
import json
from pathlib import Path
import re


def utc_timestamp(value):
    if not isinstance(value, str) or "T" not in value or not value.endswith("Z"):
        raise ValueError("Run timestamps must be in UTC and end with Z.")
    timestamp = datetime.fromisoformat(value[:-1] + "+00:00")
    if timestamp.tzinfo != timezone.utc:
        raise ValueError("Run timestamps must be in UTC.")
    return timestamp


def assessment_file(root, name):
    path = Path(name)
    if path.is_absolute():
        raise ValueError("Use paths relative to the assessment directory.")
    path = (root / path).resolve(strict=True)
    path.relative_to(root)
    if not path.is_file() or path.stat().st_size == 0:
        raise ValueError("Evidence paths must name nonempty files.")
    return path


def file_digest(path):
    digest = sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def check_run(bundle_path, run, paper_digest):
    run_id = run["id"]
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,39}", run_id):
        raise ValueError("Invalid run ID.")
    root = bundle_path.parent
    receipt_path = assessment_file(root, f"evidence/runs/{run_id}.json")
    contents = receipt_path.read_bytes()
    if sha256(contents).hexdigest() != run["artifact_sha256"]:
        raise ValueError("Run receipt hash differs from the bundle.")
    receipt = json.loads(contents)
    if receipt["run_id"] != run_id or receipt["origin"] != "testbed":
        raise ValueError("Expected a matching testbed execution receipt.")
    status = receipt["status"]
    if status not in ("completed", "partial"):
        raise ValueError("Expected a completed or partial experiment run.")
    start = receipt["started_at"]
    if start != run["started_at"] or utc_timestamp(receipt["finished_at"]) < utc_timestamp(start):
        raise ValueError("Run timestamps do not match the bundle and execution order.")
    for field in ("command", "testbed"):
        if not isinstance(receipt[field], str) or not receipt[field].strip():
            raise ValueError(f"The run receipt needs a {field}.")

    observations = receipt["observations"]
    if not isinstance(observations, list) or not observations:
        raise ValueError("The run needs fresh raw observation files.")
    for observation in observations:
        path = assessment_file(root, observation["path"])
        digest = file_digest(path)
        if path in (bundle_path, receipt_path) or digest == paper_digest:
            raise ValueError("The bundle, receipt and paper are not raw observations.")
        if digest != observation["sha256"]:
            raise ValueError("Raw observation hash differs from the receipt.")

    measured = {measurement["claim_id"] for measurement in run["measurements"]}
    comparable = receipt["comparable_claim_ids"]
    if not isinstance(comparable, list) or (comparable and status != "completed"):
        raise ValueError("Comparable claims must be listed for a completed run.")
    if not measured or not set(comparable) <= measured:
        raise ValueError("Comparable claims need measurements in the matching run.")
    return comparable


def schema_fields(schema):
    if isinstance(schema, dict):
        yield from schema.get("properties", {})
        for child in schema.values():
            yield from schema_fields(child)
    elif isinstance(schema, list):
        for child in schema:
            yield from schema_fields(child)


def check_shareable_text(bundle):
    references = Path(__file__).resolve().parents[1] / "references"
    policy = json.loads((references / "shareable-text.json").read_text(encoding="utf-8"))
    fields = set(schema_fields(json.loads((references / "assessment.schema.json").read_text(encoding="utf-8"))))
    whitespace = policy["whitespaceClass"]
    # Match JavaScript's word boundaries and whitespace in the shared pattern.
    private = policy["privatePattern"].replace(r"\s", f"[{whitespace}]").replace(r"\S", f"[^{whitespace}]")
    private_text = re.compile(private, re.IGNORECASE | re.ASCII)
    blank_text = re.compile(f"[{whitespace}]*")
    invalid_control = re.compile(policy["controlPattern"])

    def visit(value, path):
        if isinstance(value, str):
            if blank_text.fullmatch(value) or private_text.search(value) or invalid_control.search(value):
                raise ValueError(f"{policy['message']} at {path or '/'}.")
        elif isinstance(value, dict):
            for key, child in value.items():
                visit(child, f"{path}/{key if key in fields else '<field>'}")
        elif isinstance(value, list):
            for index, child in enumerate(value):
                visit(child, f"{path}/{index}")

    visit(bundle, "")


def check_bundle(bundle_path, *, shareable=False):
    bundle_path = bundle_path.resolve(strict=True)
    bundle = json.loads(bundle_path.read_bytes())
    if shareable:
        check_shareable_text(bundle)
    ids = set()
    supported_claims = set()
    for run in bundle["runs"]:
        if not isinstance(run, dict):
            raise ValueError("Each bundled run must be an object.")
        try:
            if run["id"] in ids:
                raise ValueError("Duplicate run ID.")
            supported_claims.update(check_run(bundle_path, run, bundle["paper"]["sha256"]))
            ids.add(run["id"])
        except (OSError, ValueError, TypeError, KeyError) as error:
            raise ValueError(f"Run {run.get('id', '(missing ID)')}: {error}") from error
    for claim in bundle["claims"]:
        if claim["outcome"] in ("reproduced", "discrepant") and claim["id"] not in supported_claims:
            raise ValueError(f"Claim {claim['id']} needs a comparable completed experiment.")
    return len(ids)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("bundle", type=Path)
    args = parser.parse_args()
    try:
        count = check_bundle(args.bundle, shareable=True)
    except (OSError, ValueError, TypeError, KeyError) as error:
        parser.exit(1, f"{error}\n")
    print(f"Checked shareable bundle text and verified evidence for {count} experiment runs.")


if __name__ == "__main__":
    main()
