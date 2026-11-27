"""Check Generator bundle diagnostics in the standalone Python entry point."""

import json
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory
import unittest


CHECKER = (Path(__file__).resolve().parents[1] / "skills" / "jumpserve-paper-assessment"
           / "scripts" / "check_experiment_evidence.py")


class ShareableBundleTests(unittest.TestCase):
    def check_bundle(self, script):
        with TemporaryDirectory() as folder:
            path = Path(folder) / "jumpserve-assessment.json"
            bundle = {"wizard": {"experiments": [{"scripts": [script]}]}, "claims": [], "runs": []}
            path.write_text(json.dumps(bundle), encoding="utf-8")
            return subprocess.run([sys.executable, "-B", str(CHECKER), str(path)],
                                  capture_output=True, text=True, check=False)

    def test_private_script_text_reports_location_with_no_value(self):
        for value in ("cat /tmp/private-fixture", "API_KEY=private-example", "API_KEY\u00a0=fixture",
                      "reader@example.test", "\ufeff\u2003", "printf \x07"):
            with self.subTest(value=value):
                result = self.check_bundle({"path": "scripts/trial.sh", "content": value})
                self.assertEqual(result.returncode, 1)
                self.assertIn("/wizard/experiments/0/scripts/0/content", result.stderr)
                self.assertNotIn(value, result.stderr)

    def test_unrecognized_keys_are_omitted_from_diagnostics(self):
        result = self.check_bundle({"reader@example.test": "cat /tmp/private-fixture"})
        self.assertEqual(result.returncode, 1)
        self.assertIn("/wizard/experiments/0/scripts/0/<field>", result.stderr)
        self.assertNotIn("reader@example.test", result.stderr)
        self.assertNotIn("/tmp/private-fixture", result.stderr)

    def test_runtime_temporary_path_passes(self):
        result = self.check_bundle({"path": "scripts/trial.sh",
                                    "content": '#!/bin/sh\ntrace_file=$(mktemp)\ncat "$trace_file"\n'})
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("Checked shareable bundle text", result.stdout)
