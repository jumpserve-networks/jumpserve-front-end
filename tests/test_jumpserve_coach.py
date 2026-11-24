from hashlib import sha256
import json
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory
import unittest


COACH_SCRIPTS = Path(__file__).resolve().parents[1] / "skills/jumpserve-assessment-coach/scripts"
COACH = COACH_SCRIPTS / "prepare_feedback.py"
CANDIDATE = COACH_SCRIPTS / "prepare_candidate.py"


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


class CandidateTests(unittest.TestCase):
    def setUp(self):
        directory = TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        root = Path(directory.name)
        self.source = root / "jumpserve-paper-assessment"
        self.reviews = root / "reviews"
        (self.source / "references").mkdir(parents=True)
        self.skill = self.source / "SKILL.md"
        self.skill.write_text("Baseline\n", encoding="utf-8")
        self.skill.chmod(0o444)
        (self.source / "references" / "testbed.md").write_bytes(b"Testbed\n")
        (self.source / "private-notes.json").write_text("local evidence", encoding="utf-8")

    def prepare(self, review_dir=None):
        return subprocess.run(
            [sys.executable, "-B", str(CANDIDATE), str(self.source), str(review_dir or self.reviews)],
            capture_output=True, text=True,
        )

    def test_candidate_is_an_editable_snapshot_with_stable_baseline_and_fresh_directory(self):
        first = self.prepare()
        self.assertEqual(first.returncode, 0, first.stderr)
        result = json.loads(first.stdout)
        candidate = Path(result["candidate_dir"])
        self.assertEqual(candidate.name, self.source.name)
        self.assertTrue(candidate.is_relative_to(self.reviews.resolve()))
        self.assertEqual((candidate / "references" / "testbed.md").read_bytes(), b"Testbed\n")
        self.assertFalse((candidate / "private-notes.json").exists())
        (candidate / "SKILL.md").write_bytes(b"Proposed change\n")
        self.assertEqual(self.skill.read_bytes(), b"Baseline\n")
        self.assertEqual(self.skill.stat().st_mode & 0o777, 0o444)

        second = self.prepare()
        self.assertEqual(second.returncode, 0, second.stderr)
        repeat = json.loads(second.stdout)
        self.assertEqual(repeat["baseline_sha256"], result["baseline_sha256"])
        self.assertNotEqual(repeat["candidate_dir"], result["candidate_dir"])
        self.assertEqual((Path(repeat["candidate_dir"]) / "SKILL.md").read_bytes(), b"Baseline\n")
        self.assertEqual((candidate / "SKILL.md").read_bytes(), b"Proposed change\n")

    def test_review_directory_alias_cannot_put_a_candidate_inside_the_source(self):
        alias = self.reviews
        alias.symlink_to(self.source, target_is_directory=True)
        result = self.prepare(alias / "drafts")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("outside the Generator skill", result.stderr)
        self.assertFalse((self.source / "drafts").exists())

    def test_symbolic_link_resources_are_rejected_without_a_partial_candidate(self):
        (self.source / "references" / "linked.md").symlink_to(self.skill)
        result = self.prepare()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("regular files or directories", result.stderr)
        self.assertEqual(list(self.reviews.glob("generator-candidate-*")), [])


if __name__ == "__main__":
    unittest.main()
