"""Check run receipts and raw observation hashes before saving an assessment."""

import argparse
from datetime import datetime, timezone
from hashlib import sha256
import json
from pathlib import Path
import re

PROTOCOL_FILE = "experiment-protocol.json"
PROTOCOL_VERSION = "jumpserve-experiment-protocol-v1"
IDENTIFIER = re.compile(r"[A-Za-z0-9][A-Za-z0-9_-]{0,39}")
DIGEST = re.compile(r"[a-f0-9]{64}")


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


def has_text(value):
    return isinstance(value, str) and bool(value.strip())


def check_protocol(path, expected_sha256=None):
    contents = path.read_bytes()
    digest = sha256(contents).hexdigest()
    if expected_sha256 is not None and digest != expected_sha256:
        raise ValueError("The protocol differs from its frozen SHA-256.")
    protocol = json.loads(contents)
    if not isinstance(protocol, dict) or protocol.get("version") != PROTOCOL_VERSION:
        raise ValueError(f"Expected a {PROTOCOL_VERSION} protocol.")
    paper_digest = protocol.get("paper_sha256")
    if not isinstance(paper_digest, str) or not DIGEST.fullmatch(paper_digest):
        raise ValueError("The protocol needs the source PDF SHA-256.")
    utc_timestamp(protocol.get("frozen_at"))
    experiments = protocol.get("experiments")
    if not isinstance(experiments, list) or not experiments:
        raise ValueError("The protocol needs at least one experiment.")
    ids = set()
    for experiment in experiments:
        if not isinstance(experiment, dict):
            raise ValueError("Each protocol experiment must be an object.")
        experiment_id = experiment.get("id")
        if not isinstance(experiment_id, str) or not IDENTIFIER.fullmatch(experiment_id) or experiment_id in ids:
            raise ValueError("Protocol experiment IDs must be valid and unique.")
        ids.add(experiment_id)
        if experiment.get("mode") not in ("reproduction", "replay", "adaptation"):
            raise ValueError(f"Protocol experiment {experiment_id} needs a supported mode.")
        claims = experiment.get("claim_ids")
        if (not isinstance(claims, list) or not claims or
                any(not isinstance(value, str) or not IDENTIFIER.fullmatch(value) for value in claims) or
                len(set(claims)) != len(claims)):
            raise ValueError(f"Protocol experiment {experiment_id} needs unique claim IDs.")
        sources = experiment.get("sources")
        if not isinstance(sources, list) or not sources or not all(map(has_text, sources)):
            raise ValueError(f"Protocol experiment {experiment_id} needs source citations.")
        conditions = experiment.get("conditions")
        if not isinstance(conditions, list) or not conditions:
            raise ValueError(f"Protocol experiment {experiment_id} needs comparison conditions.")
        for condition in conditions:
            if (not isinstance(condition, dict) or condition.get("policy") not in ("fixed", "flexible", "unresolved") or
                    not all(has_text(condition.get(field)) for field in ("name", "value", "basis"))):
                raise ValueError(f"Protocol experiment {experiment_id} has an invalid condition.")
        for field in ("procedure", "measurements", "eligibility", "minimum_coverage", "decision_rule", "stopping_rule", "scope"):
            if not has_text(experiment.get(field)):
                raise ValueError(f"Protocol experiment {experiment_id} needs {field}.")
    return protocol, digest


def check_run(bundle_path, run, paper_digest, protocol=None):
    run_id = run["id"]
    if not IDENTIFIER.fullmatch(run_id):
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
        if protocol is not None and digest == protocol[1]:
            raise ValueError("The frozen protocol is not a raw observation.")
        if digest != observation["sha256"]:
            raise ValueError("Raw observation hash differs from the receipt.")

    measured = {measurement["claim_id"] for measurement in run["measurements"]}
    comparable = receipt["comparable_claim_ids"]
    if not isinstance(comparable, list) or (comparable and status != "completed"):
        raise ValueError("Comparable claims must be listed for a completed run.")
    if not measured or not set(comparable) <= measured:
        raise ValueError("Comparable claims need measurements in the matching run.")
    if protocol is not None:
        frozen, digest = protocol
        if receipt.get("protocol_sha256") != digest:
            raise ValueError("Run receipt does not match the frozen protocol SHA-256.")
        if utc_timestamp(frozen["frozen_at"]) > utc_timestamp(start):
            raise ValueError("The protocol must be frozen before the experiment starts.")
        experiment_id = run.get("experiment_id")
        if receipt.get("experiment_id") != experiment_id:
            raise ValueError("Run receipt and bundle must identify the same protocol experiment.")
        experiment = next((entry for entry in frozen["experiments"] if entry["id"] == experiment_id), None)
        if experiment is None or not measured <= set(experiment["claim_ids"]):
            raise ValueError("Run measurements must match an experiment and its claims in the frozen protocol.")
        if experiment["mode"] == "replay":
            raise ValueError("Archive replay cannot be recorded as a fresh run.")
    elif "protocol_sha256" in receipt:
        raise ValueError("The linked frozen protocol file is missing.")
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


def check_bundle(bundle_path, *, shareable=False, require_protocol=False):
    bundle_path = bundle_path.resolve(strict=True)
    bundle = json.loads(bundle_path.read_bytes())
    if shareable:
        check_shareable_text(bundle)
    protocol_path = bundle_path.parent / PROTOCOL_FILE
    protocol = None
    if require_protocol or protocol_path.exists() or protocol_path.is_symlink():
        protocol = check_protocol(assessment_file(bundle_path.parent, PROTOCOL_FILE))
        if protocol[0]["paper_sha256"] != bundle["paper"]["sha256"]:
            raise ValueError("The frozen protocol belongs to a different paper.")
        claim_ids = {claim["id"] for claim in bundle["claims"]}
        if any(not set(experiment["claim_ids"]) <= claim_ids for experiment in protocol[0]["experiments"]):
            raise ValueError("The frozen protocol refers to unknown assessment claims.")
    ids = set()
    supported_claims = set()
    for run in bundle["runs"]:
        if not isinstance(run, dict):
            raise ValueError("Each bundled run must be an object.")
        try:
            if run["id"] in ids:
                raise ValueError("Duplicate run ID.")
            supported_claims.update(check_run(bundle_path, run, bundle["paper"]["sha256"], protocol))
            ids.add(run["id"])
        except (OSError, ValueError, TypeError, KeyError) as error:
            raise ValueError(f"Run {run.get('id', '(missing ID)')}: {error}") from error
    for claim in bundle["claims"]:
        if claim["outcome"] in ("reproduced", "discrepant") and claim["id"] not in supported_claims:
            raise ValueError(f"Claim {claim['id']} needs a comparable completed experiment.")
    return len(ids)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("artifact", type=Path)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--protocol-only", action="store_true", help="Validate a planned experiment protocol and print its SHA-256.")
    mode.add_argument("--require-protocol", action="store_true", help="Require a frozen protocol beside the assessment bundle.")
    parser.add_argument("--expected-sha256", help="Check the exact frozen bytes in protocol-only mode.")
    args = parser.parse_args()
    if args.expected_sha256 is not None and not args.protocol_only:
        parser.error("--expected-sha256 requires --protocol-only.")
    try:
        if args.protocol_only:
            _, digest = check_protocol(args.artifact, args.expected_sha256)
            print(digest)
            return
        count = check_bundle(args.artifact, shareable=True, require_protocol=args.require_protocol)
    except (OSError, ValueError, TypeError, KeyError) as error:
        parser.exit(1, f"{error}\n")
    print(f"Checked shareable bundle text and verified evidence for {count} experiment runs.")


if __name__ == "__main__":
    main()
