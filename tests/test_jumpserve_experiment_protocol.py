import hashlib
import json
from pathlib import Path
import runpy
import tempfile
import unittest


CHECKER = Path(__file__).resolve().parents[1] / "skills/jumpserve-paper-assessment/scripts/check_experiment_evidence.py"
checkers = runpy.run_path(str(CHECKER))
check_bundle = checkers["check_bundle"]
check_protocol = checkers["check_protocol"]


class FrozenProtocolTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name)
        (self.root / "evidence/runs").mkdir(parents=True)
        self.paper = "a" * 64
        self.started = "2026-01-01T00:00:01Z"
        self.protocol = {
            "version": "jumpserve-experiment-protocol-v1",
            "paper_sha256": self.paper,
            "frozen_at": "2026-01-01T00:00:00Z",
            "experiments": [{
                "id": "experiment", "mode": "reproduction", "claim_ids": ["claim"],
                "sources": ["PDF p. 2"],
                "conditions": [{"name": "sample", "policy": "fixed", "value": "fixture", "basis": "PDF p. 2"}],
                "procedure": "Process one sample.", "measurements": "Valid samples, count in samples.",
                "eligibility": "Complete sample records.", "minimum_coverage": "One sample.",
                "decision_rule": "Compare observed and reference counts.",
                "stopping_rule": "Stop after one sample.", "scope": "The documented sample.",
            }],
        }
        self.protocol_path = self.root / "experiment-protocol.json"
        self.bundle_path = self.root / "jumpserve-assessment.json"

    def write(self, path, obj):
        contents = json.dumps(obj).encode()
        path.write_bytes(contents)
        return hashlib.sha256(contents).hexdigest()

    def fixture(self, with_protocol=True, receipt_experiment="experiment"):
        receipt = {
            "run_id": "run", "origin": "testbed", "status": "completed", "started_at": self.started,
            "finished_at": "2026-01-01T00:00:02Z", "command": "run fixture", "testbed": "fixture",
            "observations": [{"path": "observation.json", "sha256": self.write(self.root / "observation.json", [1])}],
            "comparable_claim_ids": ["claim"],
        }
        if with_protocol:
            receipt["protocol_sha256"] = self.write(self.protocol_path, self.protocol)
            receipt["experiment_id"] = receipt_experiment
        receipt_digest = self.write(self.root / "evidence/runs/run.json", receipt)
        self.write(self.bundle_path, {
            "paper": {"sha256": self.paper},
            "claims": [{"id": "claim", "outcome": "reproduced"}],
            "runs": [{"id": "run", "experiment_id": "experiment", "started_at": self.started,
                      "artifact_sha256": receipt_digest, "measurements": [{"claim_id": "claim"}]}],
        })

    def test_valid_protocol_is_bound_to_receipt_and_exact_bytes(self):
        self.fixture()
        self.assertEqual(check_bundle(self.bundle_path, require_protocol=True), 1)
        _, frozen_digest = check_protocol(self.protocol_path)
        self.protocol_path.write_bytes(self.protocol_path.read_bytes() + b"\n")
        with self.assertRaisesRegex(ValueError, "frozen SHA-256"):
            check_protocol(self.protocol_path, frozen_digest)
        with self.assertRaisesRegex(ValueError, "does not match the frozen protocol"):
            check_bundle(self.bundle_path)
        self.fixture(receipt_experiment="different-plan")
        with self.assertRaisesRegex(ValueError, "same protocol experiment"):
            check_bundle(self.bundle_path)

    def test_legacy_read_and_missing_linked_protocol(self):
        self.fixture(with_protocol=False)
        self.assertEqual(check_bundle(self.bundle_path), 1)
        with self.assertRaises(FileNotFoundError):
            check_bundle(self.bundle_path, require_protocol=True)
        self.fixture()
        self.protocol_path.unlink()
        with self.assertRaisesRegex(ValueError, "linked frozen protocol file is missing"):
            check_bundle(self.bundle_path)

    def test_replay_and_late_protocols_cannot_validate_as_fresh(self):
        self.protocol["experiments"][0]["mode"] = "replay"
        self.fixture()
        with self.assertRaisesRegex(ValueError, "Archive replay"):
            check_bundle(self.bundle_path)
        self.protocol["experiments"][0]["mode"] = "adaptation"
        self.protocol["frozen_at"] = "2026-01-01T00:00:03Z"
        self.fixture()
        with self.assertRaisesRegex(ValueError, "frozen before the experiment"):
            check_bundle(self.bundle_path)

    def test_protocol_must_identify_the_assessment_paper_and_claims(self):
        self.protocol["paper_sha256"] = "b" * 64
        self.fixture()
        with self.assertRaisesRegex(ValueError, "different paper"):
            check_bundle(self.bundle_path)
        self.protocol["paper_sha256"] = self.paper
        self.protocol["experiments"][0]["claim_ids"] = ["different"]
        self.fixture()
        with self.assertRaisesRegex(ValueError, "unknown assessment claims"):
            check_bundle(self.bundle_path)
