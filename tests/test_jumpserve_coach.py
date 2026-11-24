from hashlib import sha256
import json
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory
import unittest


COACH = Path(__file__).resolve().parents[1] / "skills/jumpserve-assessment-coach/scripts/prepare_feedback.py"


def scorecard():
    return {
        "version": "jumpserve-verifier-scorecard-v1", "paper_id": "fixture", "paper_sha256": "a" * 64,
        "assessment_sha256": "b" * 64, "answer_key_sha256": "c" * 64, "split": "development",
        "mode": "fresh", "scenario": None, "evidence_integrity": {"status": "verified"}, "status": "scored",
        "claims": [{"assessment_claim_id": "C1", "key_claim_id": "private-key-claim", "reported_outcome": "reproduced",
                    "supported_outcome": "reproduced", "assessment": "correct", "finding": "The decision was supported.",
                    "evidence": ["data/private-trial.csv"]}],
        "rubric": [{"criterion": "Reporting", "earned": 0, "maximum": 2, "reason": "A failed attempt was omitted."},
                   {"criterion": "Decision", "earned": 8, "maximum": 8, "reason": "The verdict follows the rule."},
                   {"criterion": "Independent evidence", "earned": None, "maximum": 1, "reason": "Outside scope."}],
        "score": {"earned": 8, "applicable_maximum": 10, "rubric_maximum": 11},
        "blockers": [], "critical_failures": [],
    }


class CoachTests(unittest.TestCase):
    def setUp(self):
        directory = TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.directory = Path(directory.name)

    def write(self, filename, content):
        path = self.directory / filename
        path.write_text(content, encoding="utf-8")
        return path

    def run_coach(self, *paths):
        result = subprocess.run([sys.executable, "-B", str(COACH), *paths], check=True, capture_output=True, text=True)
        self.assertEqual(result.stderr, "")
        return json.loads(result.stdout), result.stdout

    def test_development_feedback_preserves_real_deductions_and_omits_private_identifiers(self):
        review = scorecard()
        path = self.write("development.json", json.dumps(review))
        output, serialized = self.run_coach(path)
        self.assertEqual(output["invalid_inputs"], [])
        self.assertEqual(output["reviews"][0]["score"], review["score"])
        self.assertEqual(output["reviews"][0]["rubric"], review["rubric"])
        self.assertEqual(output["reviews"][0]["scorecard_sha256"], sha256(path.read_bytes()).hexdigest())
        self.assertIn("The decision was supported.", serialized)
        for restricted in (review["answer_key_sha256"], "private-key-claim", "private-trial.csv"):
            self.assertNotIn(restricted, serialized)

    def test_split_is_checked_before_any_findings_are_exposed(self):
        held = {**scorecard(), "split": "held_out", "blockers": ["secret held-out outcome"]}
        unknown = {**held, "split": "unlabelled"}
        duplicate_split = json.dumps(held).replace('"split": "held_out"', '"split": "held_out", "split": "development"')
        paths = [self.write("hidden-name.json", json.dumps(held)), self.write("unknown.json", json.dumps(unknown)),
                 self.write("ambiguous.json", duplicate_split)]
        output, serialized = self.run_coach(*paths)
        self.assertEqual(output, {"reviews": [], "skipped_held_out": 1, "skipped_duplicates": 0, "invalid_inputs": [2, 3]})
        self.assertNotIn("secret held-out outcome", serialized)
        self.assertNotIn("hidden-name.json", serialized)

    def test_blocked_and_replay_reviews_keep_their_scope_and_ignore_duplicate_copies(self):
        blocked = {**scorecard(), "status": "blocked", "score": None, "evidence_integrity": {"status": "failed"},
                   "rubric": [], "claims": [], "blockers": ["Required receipt is missing."]}
        replay = {**scorecard(), "mode": "replay", "scenario": "fixture", "evidence_integrity": {"status": "fixture_only"}}
        first = self.write("first.json", json.dumps(blocked))
        copy = self.write("copy.json", json.dumps(blocked, indent=2, sort_keys=True))
        second = self.write("second.json", json.dumps(replay))
        output, _ = self.run_coach(first, copy, second)
        self.assertEqual(output["skipped_duplicates"], 1)
        self.assertEqual(output["reviews"][0]["blockers"], blocked["blockers"])
        self.assertIsNone(output["reviews"][0]["score"])
        self.assertEqual(output["reviews"][1]["mode"], "replay")
        self.assertEqual(output["reviews"][1]["evidence_integrity"], "fixture_only")


if __name__ == "__main__":
    unittest.main()
