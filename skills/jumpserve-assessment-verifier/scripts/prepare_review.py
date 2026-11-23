"""Check review input identity and local evidence before grading an assessment."""

import argparse
from hashlib import sha256
import json
from pathlib import Path, PurePosixPath
import re
import runpy
import tarfile


CHECKER = (Path(__file__).resolve().parents[2] / "jumpserve-paper-assessment"
           / "scripts" / "check_experiment_evidence.py")
OUTCOMES = {"reproduced", "discrepant", "inconclusive", "untested"}
RUN_ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9_-]{0,39}")
ASSESSMENT_VERSION = "jumpserve-assessment-v1"
ANALYSIS_VERSION = "jumpserve-replay-analysis-v1"


def json_object(path):
    raw = path.read_bytes()
    value = json.loads(raw)
    if not isinstance(value, dict):
        raise ValueError(f"Expected a JSON object in {path.name}.")
    return value, sha256(raw).hexdigest()


def by_claim_id(claims):
    if not isinstance(claims, list) or not claims:
        raise ValueError("Expected a nonempty list of claims.")
    output = {}
    for claim in claims:
        claim_id = claim["id"]
        if not isinstance(claim_id, str) or not RUN_ID.fullmatch(claim_id) or claim_id in output:
            raise ValueError("Expected distinct, valid claim IDs.")
        output[claim_id] = claim
    return output


def replay_expectations(key, claim_ids, scenario_id):
    replay = key["replay"]
    variants = replay.get("variant_scenarios", [])
    source = replay["scenario"]
    if scenario_id is None or scenario_id == source:
        chosen = replay
        scenario_id = source
    else:
        matches = [variant for variant in variants if variant["id"] == scenario_id]
        if len(matches) != 1:
            raise ValueError(f"Unknown or ambiguous replay scenario: {scenario_id}.")
        chosen = matches[0]
    expected = chosen["expected"]
    if "claim_outcomes" in expected:
        outcomes = {cid: rule["outcome"] for cid, rule in expected["claim_outcomes"].items()}
    elif len(claim_ids) == 1:
        outcomes = {next(iter(claim_ids)): expected["outcome"]}
    else:
        raise ValueError("A multi-claim replay requires one expected outcome per claim.")
    if outcomes.keys() != claim_ids.keys() or any(value not in OUTCOMES for value in outcomes.values()):
        raise ValueError("Replay expectations must cover every key claim with a valid outcome.")
    return {"id": scenario_id, "source": source, "expected_outcomes": outcomes}


def check_legacy_archive(assessment_path, assembly, archive_path, file_digest):
    """Match a pre-receipt bundle to a retained archive without extracting it."""
    runs = assembly["runs"]
    if len(runs) != 1 or not RUN_ID.fullmatch(runs[0]["id"]):
        raise ValueError("Legacy archive review requires one valid archived run ID.")
    run = runs[0]
    receipt = assessment_path.parent / "evidence" / "runs" / f"{run['id']}.json"
    if receipt.exists() or receipt.is_symlink():
        raise ValueError("A present run receipt takes precedence over legacy archive review.")
    measured = {measurement["claim_id"] for measurement in run["measurements"]}
    conclusive = {claim["id"] for claim in assembly["claims"]
                  if claim["outcome"] in {"reproduced", "discrepant"}}
    if not measured or not conclusive <= measured:
        raise ValueError("Conclusive claims require measurements linked to the archived run.")
    if not archive_path.is_file() or file_digest(archive_path) != run["artifact_sha256"]:
        raise ValueError("Legacy archive hash differs from the assessment's run artifact hash.")
    with tarfile.open(archive_path, "r:*") as archive:
        names = set()
        nonempty_files = 0
        for member in archive:
            member_path = PurePosixPath(member.name)
            if (member_path.is_absolute() or ".." in member_path.parts or member_path in names
                    or not (member.isfile() or member.isdir())):
                raise ValueError("Legacy archive contains an unsafe or duplicate member.")
            names.add(member_path)
            if member.isfile() and member.size > 0:
                nonempty_files += 1
    if not nonempty_files:
        raise ValueError("Legacy archive contains no nonempty evidence files.")
    return {"status": "legacy_archive_matched", "verified_runs": 0,
            "archive_sha256": run["artifact_sha256"], "archive_files": nonempty_files,
            "detail": "The archive hash matches. Review its recorded configuration and observations for claim-level linkage."}


def run_integrity_check(assessment_path, assessment, legacy_archive, checker):
    try:
        count = checker["check_bundle"](assessment_path)
    except (OSError, KeyError, TypeError, ValueError) as error:
        if legacy_archive is None:
            return {"status": "failed", "detail": str(error)}
        try:
            return check_legacy_archive(assessment_path, assessment, legacy_archive, checker["file_digest"])
        except (OSError, KeyError, TypeError, ValueError, tarfile.TarError) as archive_error:
            return {"status": "failed", "detail": str(error), "archive_detail": str(archive_error)}
    return {"status": "verified", "verified_runs": count}


def prepare_review(assessment_path, key_path, mode, scenario_id, paper_path, legacy_archive):
    assessment_path = assessment_path.resolve(strict=True)
    assessment, assessment_hash = json_object(assessment_path)
    key, key_hash = json_object(key_path)
    if type(key.get("schema_version")) is not int or key["schema_version"] != 1:
        raise ValueError("Expected a JumpServe answer key with schema version 1.")
    if key.get("split") not in {"development", "held_out"}:
        raise ValueError("The key must identify the development or held-out split.")
    paper_hash = assessment["paper"]["sha256"]
    if not isinstance(paper_hash, str) or not re.fullmatch(r"[a-f0-9]{64}", paper_hash):
        raise ValueError("The assessment must provide a valid paper SHA-256.")
    if key["paper"]["sha256"] != paper_hash:
        raise ValueError("The answer key is for a different paper SHA-256.")

    claims = by_claim_id(assessment["claims"])
    key_claims = by_claim_id(key["claims"] if "claims" in key else [key["claim"]])
    outcomes = {cid: claim["outcome"] for cid, claim in claims.items()}
    if any(outcome not in OUTCOMES for outcome in outcomes.values()):
        raise ValueError("The assessment contains an unknown claim outcome.")

    replay = replay_expectations(key, key_claims, scenario_id) if mode == "replay" else None
    synthetic = replay is not None and replay["source"] == "synthetic_decision_fixture"
    if synthetic:
        if (assessment.get("version") != ANALYSIS_VERSION or "runs" in assessment
                or assessment.get("scenario") != replay["id"] or legacy_archive is not None):
            raise ValueError("Synthetic replay requires a replay-analysis file for the selected scenario with no experiment runs or legacy archive.")
    elif assessment.get("version") != ASSESSMENT_VERSION or not isinstance(assessment.get("runs"), list):
        raise ValueError("Expected a saved JumpServe assessment bundle.")

    checker = runpy.run_path(str(CHECKER))
    if paper_path is not None and checker["file_digest"](paper_path) != paper_hash:
        raise ValueError("The supplied PDF does not match the assessment paper SHA-256.")
    integrity = ({"status": "fixture_only"} if synthetic
                 else run_integrity_check(assessment_path, assessment, legacy_archive, checker))
    return {"paper_id": key["paper_id"], "paper_sha256": paper_hash,
            "pdf_bytes_checked": paper_path is not None, "assessment_sha256": assessment_hash,
            "answer_key_sha256": key_hash, "split": key["split"], "mode": mode,
            "replay": replay, "evidence_integrity": integrity, "key_claim_ids": list(key_claims),
            "assessment_outcomes": outcomes}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("assessment", type=Path, help="Saved assessment JSON or synthetic replay analysis JSON.")
    parser.add_argument("answer_key", type=Path, help="Matching verifier-only answer key.")
    parser.add_argument("--mode", choices=("fresh", "replay"), default="fresh")
    parser.add_argument("--scenario", help="A named answer-key variant in replay mode.")
    parser.add_argument("--paper", type=Path, help="Local source PDF whose bytes can be checked.")
    parser.add_argument("--legacy-archive", type=Path, help="Retained evidence archive explicitly cited by a pre-receipt bundle.")
    args = parser.parse_args()
    if args.scenario is not None and args.mode != "replay":
        parser.error("--scenario requires --mode replay.")
    try:
        result = prepare_review(args.assessment, args.answer_key, args.mode, args.scenario, args.paper, args.legacy_archive)
    except (OSError, ValueError, TypeError, KeyError) as error:
        parser.exit(2, f"Review input blocked: {error}\n")
    print(json.dumps(result, indent=2, allow_nan=False))
    return 1 if result["evidence_integrity"]["status"] == "failed" else 0


if __name__ == "__main__":
    raise SystemExit(main())
