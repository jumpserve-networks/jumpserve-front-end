from hashlib import sha256
from io import BytesIO
import json
from pathlib import Path
import subprocess
import sys
import tarfile
from tempfile import TemporaryDirectory
import unittest


ROOT = Path(__file__).resolve().parents[1]
VERIFIER = ROOT / "skills/jumpserve-assessment-verifier/scripts/prepare_review.py"
START = "2026-11-21T00:00:00Z"


class VerifierTests(unittest.TestCase):
    def setUp(self):
        temp = TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.directory = Path(temp.name)
        self.bundle_path = self.directory / "jumpserve-assessment.json"
        self.receipt_path = self.directory / "evidence/runs/test-run.json"
        self.ping_key = self.directory / "ping-key.json"
        self.buffer_key = self.directory / "buffer-key.json"
        self.write_json(self.ping_key, {
            "schema_version": 1, "paper_id": "ping-fixture", "split": "development",
            "paper": {"sha256": "a" * 64}, "claim": {"id": "C1"},
            "replay": {"scenario": "recorded_evidence", "expected": {"outcome": "discrepant"},
                       "variant_scenarios": [{"id": "missing_pair", "expected": {"outcome": "inconclusive"}}]},
        })
        self.write_json(self.buffer_key, {
            "schema_version": 1, "paper_id": "buffer-fixture", "split": "development",
            "paper": {"sha256": "b" * 64}, "claims": [{"id": cid} for cid in ("C1", "C2", "C3")],
            "replay": {"scenario": "synthetic_decision_fixture", "expected": {"claim_outcomes": {
                "C1": {"outcome": "discrepant"}, "C2": {"outcome": "reproduced"}, "C3": {"outcome": "reproduced"},
            }}},
        })

    def write_json(self, path, value):
        path.parent.mkdir(parents=True, exist_ok=True)
        raw = json.dumps(value).encode()
        path.write_bytes(raw)
        return sha256(raw).hexdigest()

    def assessment(self, artifact_hash, key=None):
        key = key or self.ping_key
        paper = json.loads(key.read_bytes())["paper"]
        self.write_json(self.bundle_path, {
            "version": "jumpserve-assessment-v1", "paper": {"sha256": paper["sha256"]},
            "claims": [{"id": "C1", "outcome": "discrepant"}],
            "runs": [{"id": "test-run", "artifact_sha256": artifact_hash,
                      "started_at": START, "measurements": [{"claim_id": "C1"}]}],
        })

    def run_verifier(self, *options, key=None):
        key = key or self.ping_key
        return subprocess.run([sys.executable, "-B", str(VERIFIER), str(self.bundle_path), str(key), *options],
                              cwd=self.directory, check=False, capture_output=True, text=True)

    def test_checks_receipt_and_tampered_raw_observations(self):
        trace = self.directory / "trace.csv"
        trace.write_bytes(b"trial,delta_ms\n1,21.4\n")
        receipt_hash = self.write_json(self.receipt_path, {
            "origin": "testbed", "run_id": "test-run", "status": "completed",
            "started_at": START, "finished_at": "2026-11-21T00:01:00Z", "command": "fixture",
            "testbed": "fixture", "observations": [{"path": "trace.csv", "sha256": sha256(trace.read_bytes()).hexdigest()}],
            "comparable_claim_ids": ["C1"],
        })
        self.assessment(receipt_hash)
        ready = self.run_verifier()
        self.assertEqual(ready.returncode, 0, ready.stderr)
        report = json.loads(ready.stdout)
        self.assertEqual(report["evidence_integrity"], {"status": "verified", "verified_runs": 1})
        self.assertIsNone(report["replay"])

        replay = self.run_verifier("--mode", "replay", "--scenario", "missing_pair")
        self.assertEqual(replay.returncode, 0, replay.stderr)
        self.assertEqual(json.loads(replay.stdout)["replay"]["expected_outcomes"], {"C1": "inconclusive"})

        trace.write_bytes(b"changed")
        failed = self.run_verifier()
        self.assertEqual(failed.returncode, 1)
        self.assertIn("Raw observation hash differs", json.loads(failed.stdout)["evidence_integrity"]["detail"])

    def test_rejects_key_for_other_paper(self):
        self.assessment("0" * 64)
        rejected = self.run_verifier(key=self.buffer_key)
        self.assertEqual(rejected.returncode, 2)
        self.assertIn("different paper SHA-256", rejected.stderr)

    def test_synthetic_replay_is_only_a_separate_analysis(self):
        self.assessment("0" * 64, self.buffer_key)
        rejected = self.run_verifier("--mode", "replay", key=self.buffer_key)
        self.assertEqual(rejected.returncode, 2)
        self.assertIn("replay-analysis file", rejected.stderr)

        case = json.loads(self.buffer_key.read_bytes())
        self.write_json(self.bundle_path, {
            "version": "jumpserve-replay-analysis-v1", "paper": {"sha256": case["paper"]["sha256"]},
            "scenario": "synthetic_decision_fixture", "claims": [{"id": "C1", "outcome": "discrepant"}],
        })
        replay = self.run_verifier("--mode", "replay", key=self.buffer_key)
        self.assertEqual(replay.returncode, 0, replay.stderr)
        report = json.loads(replay.stdout)
        self.assertEqual(report["evidence_integrity"]["status"], "fixture_only")
        self.assertEqual(report["replay"]["expected_outcomes"], {
            "C1": "discrepant", "C2": "reproduced", "C3": "reproduced",
        })

    def test_hash_matched_legacy_archive_cannot_bypass_a_present_receipt(self):
        archive_path = self.directory / "prior-evidence.tar"
        raw = b"one evidence file"
        with tarfile.open(archive_path, "w") as archive:
            entry = tarfile.TarInfo("trace.csv")
            entry.size = len(raw)
            archive.addfile(entry, BytesIO(raw))
        self.assessment(sha256(archive_path.read_bytes()).hexdigest())
        matched = self.run_verifier("--legacy-archive", str(archive_path))
        self.assertEqual(matched.returncode, 0, matched.stderr)
        self.assertEqual(json.loads(matched.stdout)["evidence_integrity"]["status"], "legacy_archive_matched")

        self.write_json(self.receipt_path, {})
        blocked = self.run_verifier("--legacy-archive", str(archive_path))
        self.assertEqual(blocked.returncode, 1)
        self.assertIn("receipt takes precedence", json.loads(blocked.stdout)["evidence_integrity"]["archive_detail"])


if __name__ == "__main__":
    unittest.main()
