"""Project local JumpServe development scorecards into coaching feedback."""

import argparse
from hashlib import sha256
import json
from math import isfinite
from pathlib import Path
import re


VERSION = "jumpserve-verifier-scorecard-v1"
MAX_SCORECARD_BYTES = 256_000
OUTCOMES = (None, "untested", "inconclusive", "reproduced", "discrepant")
INTEGRITY_STATES = ("verified", "legacy_archive_matched", "fixture_only", "failed")


def unique_object(pairs):
    value = dict(pairs)
    if len(value) != len(pairs):
        raise ValueError("Duplicate JSON member")
    return value


def read_scorecard(path):
    with path.open("rb") as handle:
        raw = handle.read(MAX_SCORECARD_BYTES + 1)
    if len(raw) > MAX_SCORECARD_BYTES:
        raise ValueError("Scorecard exceeds the input limit")
    data = json.loads(raw, object_pairs_hook=unique_object)
    if not isinstance(data, dict) or data.get("version") != VERSION:
        raise ValueError("Unknown scorecard format")
    return data, raw


def text_list(values):
    if not isinstance(values, list) or any(not isinstance(value, str) for value in values):
        raise ValueError("Expected a list of text findings")
    return values


def points(value):
    if type(value) not in (int, float) or not 0 <= value <= 100_000 or not isfinite(value):
        raise ValueError("Invalid point value")
    return value


def claim_feedback(claim):
    claim_id, reported, supported, grade, finding = (
        claim[key] for key in ("assessment_claim_id", "reported_outcome", "supported_outcome", "assessment", "finding")
    )
    if (claim_id is not None and not isinstance(claim_id, str) or reported not in OUTCOMES or supported not in OUTCOMES
            or grade not in ("correct", "incorrect", "unscored") or not isinstance(finding, str)):
        raise ValueError("Invalid claim finding")
    return dict(assessment_claim_id=claim_id, reported_outcome=reported, supported_outcome=supported,
                assessment=grade, finding=finding)


def rubric_feedback(item):
    criterion, earned, maximum, reason = (item[key] for key in ("criterion", "earned", "maximum", "reason"))
    maximum = points(maximum)
    if not isinstance(criterion, str) or not isinstance(reason, str) or earned is not None and points(earned) > maximum:
        raise ValueError("Invalid rubric entry")
    return dict(criterion=criterion, earned=earned, maximum=maximum, reason=reason)


def project(data, digest):
    paper, assessment = (data[key] for key in ("paper_sha256", "assessment_sha256"))
    if not all(isinstance(value, str) and re.fullmatch(r"[a-f0-9]{64}", value) for value in (paper, assessment)):
        raise ValueError("Missing source hashes")
    status, mode, integrity = data["status"], data["mode"], data["evidence_integrity"]["status"]
    if status not in ("scored", "blocked", "failed") or mode not in ("fresh", "replay") or integrity not in INTEGRITY_STATES:
        raise ValueError("Invalid evaluation state")
    score = data["score"]
    if score is not None:
        score = {key: points(score[key]) for key in ("earned", "applicable_maximum", "rubric_maximum")}
        if not score["earned"] <= score["applicable_maximum"] <= score["rubric_maximum"] or status == "blocked":
            raise ValueError("Invalid score totals")
    elif status == "scored":
        raise ValueError("Missing score")
    if not isinstance(data["claims"], list) or not isinstance(data["rubric"], list):
        raise ValueError("Invalid review entries")
    return dict(scorecard_sha256=digest, paper_sha256=paper, assessment_sha256=assessment,
                status=status, mode=mode, evidence_integrity=integrity, score=score,
                claims=[claim_feedback(claim) for claim in data["claims"]],
                rubric=[rubric_feedback(item) for item in data["rubric"]],
                blockers=text_list(data["blockers"]), critical_failures=text_list(data["critical_failures"]))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("scorecards", type=Path, nargs="+", help="Local Verifier scorecard JSON files")
    args = parser.parse_args()
    reviews, invalid_inputs, seen = [], [], set()
    held_out, duplicates = 0, 0
    for number, path in enumerate(args.scorecards, 1):
        try:
            data, raw = read_scorecard(path)
            if data.get("split") == "held_out":
                held_out += 1
                continue
            if data.get("split") != "development":
                raise ValueError("Development split is required")
            review = project(data, sha256(raw).hexdigest())
            identity = json.dumps(data, sort_keys=True, allow_nan=False)
        except (OSError, KeyError, TypeError, ValueError, RecursionError):
            invalid_inputs.append(number)
            continue
        if identity in seen:
            duplicates += 1
            continue
        seen.add(identity)
        reviews.append(review)
    print(json.dumps(dict(reviews=reviews, skipped_held_out=held_out, skipped_duplicates=duplicates,
                          invalid_inputs=invalid_inputs), indent=2))


if __name__ == "__main__":
    main()
