"""Check the EC2 batch template and transfer boundaries without AWS calls."""

import importlib.util
import json
import os
import subprocess
from contextlib import contextmanager
from io import BytesIO
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("ec2_batch", ROOT / "scripts/jumpserve-synthetic-ec2.py")
batch = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(batch)
TRAINING_SPEC = importlib.util.spec_from_file_location("training_batch", ROOT / "scripts/run-jumpserve-training-batch.py")
training = importlib.util.module_from_spec(TRAINING_SPEC)
TRAINING_SPEC.loader.exec_module(training)


def archive_stream(name, data=b"sample", kind=tarfile.REGTYPE):
    stream = BytesIO()
    with tarfile.open(fileobj=stream, mode="w:gz") as archive:
        entry = tarfile.TarInfo(name)
        entry.type = kind
        if kind == tarfile.REGTYPE:
            entry.size = len(data)
            archive.addfile(entry, BytesIO(data))
        else:
            entry.linkname = "/etc/passwd"
            archive.addfile(entry)
    stream.seek(0)
    return stream


class Ec2BatchTest(unittest.TestCase):
    def test_one_worker_with_no_ingress_and_a_disposable_disk(self):
        template = batch.template("ssh-ed25519 public-fixture", "JumpServeExperimentWorkload-SSM", "t3.medium")
        resources = template["Resources"]
        instances = [resource for resource in resources.values() if resource["Type"] == "AWS::EC2::Instance"]
        worker, = instances
        self.assertNotIn("SecurityGroupIngress", resources["WorkerSecurity"]["Properties"])
        props = worker["Properties"]
        self.assertEqual(props["MetadataOptions"]["HttpTokens"], "required")
        self.assertEqual(props["MetadataOptions"]["HttpPutResponseHopLimit"], 1)
        volume = props["BlockDeviceMappings"][0]["Ebs"]
        self.assertTrue(volume["Encrypted"])
        self.assertTrue(volume["DeleteOnTermination"])
        self.assertNotIn("WorkerKey", resources)
        self.assertIn("ssh-ed25519 public-fixture", props["UserData"]["Fn::Base64"])
        self.assertIn({"Key": "JumpServeBatchWorker", "Value": "true"}, props["Tags"])

    def test_worker_uses_existing_volume_only_in_its_availability_zone(self):
        resources = batch.template("ssh-ed25519 fixture", "JumpServeExperimentWorkload-SSM", "t3.medium",
                                   "vol-0123456789abcdef0", "us-east-1a")["Resources"]
        self.assertEqual(resources["Subnet"]["Properties"]["AvailabilityZone"], "us-east-1a")
        self.assertEqual(resources["Worker"]["Properties"]["Volumes"], [
            {"Device": "/dev/sdf", "VolumeId": "vol-0123456789abcdef0"},
        ])
        self.assertFalse(any(resource["Type"] == "AWS::EC2::Volume" for resource in resources.values()))

    def test_transfer_accepts_only_regular_files_in_the_requested_stage(self):
        with tempfile.TemporaryDirectory() as directory:
            staging = Path(directory)
            path = "case/generator/evidence/trace.csv"
            batch.extract_outputs(archive_stream(path), staging, "generator")
            self.assertEqual((staging / path).read_bytes(), b"sample")
            for name, kind in (("../outside", tarfile.REGTYPE), ("case/answer-key.json", tarfile.REGTYPE),
                               ("case/verifier/scorecard.json", tarfile.REGTYPE),
                               ("case/generator/link", tarfile.SYMTYPE), ("case/generator/link", tarfile.LNKTYPE)):
                with self.subTest(name=name, kind=kind), self.assertRaisesRegex(ValueError, "unsafe stage artifact"):
                    batch.extract_outputs(archive_stream(name, kind=kind), staging, "generator")

    def test_chatgpt_runs_codex_on_the_controller_and_sends_no_auth_to_ssh(self):
        launches = []
        endpoint = {"name": "jumpserve-batch-00000000-0000-4000-8000-000000000000-executor", "port": 30123}

        @contextmanager
        def capture(argv, **options):
            launches.append((argv, options))

            class Child:
                returncode = 0

                def communicate(child, input=None, timeout=None):
                    if argv[0] == "ssh":
                        self.assertIsNone(input)
                        return json.dumps(endpoint).encode(), None
                    self.assertEqual(input, b"fixture prompt")
                    return None, None

            yield Child()

        with tempfile.TemporaryDirectory() as directory:
            stage = Path(directory)
            (stage / "session.json").write_text(json.dumps({"command": ["codex", "exec"],
                "prompt": "fixture prompt", "timeoutMs": 1000}))
            with patch.object(batch, "process_group", capture), patch.object(batch, "wait_for_forward"), \
                    patch.object(batch.socket, "socket") as socket, \
                    patch.object(batch, "ssh_command", return_value=0) as stop, \
                    patch.dict(os.environ, {"CODEX_HOME": "/fixture/local-codex", "CODEX_API_KEY": "fixture-key",
                                            "CODEX_ACCESS_TOKEN": "fixture-access-token"}):
                socket.return_value.__enter__.return_value.getsockname.return_value = ("127.0.0.1", 40123)
                self.assertEqual(batch.run_chatgpt_stage(["ssh", "lease"], "docker build", stage, "verifier", lambda: 30), 0)
        setup, tunnel, codex = launches
        self.assertEqual(setup[1]["stdin"], subprocess.DEVNULL)
        self.assertEqual(tunnel[1]["stdin"], subprocess.DEVNULL)
        self.assertIn("--serve", setup[0][-1])
        self.assertIn("-L", tunnel[0])
        self.assertRegex(tunnel[0][tunnel[0].index("-L") + 1], r"^127\.0\.0\.1:\d+:127\.0\.0\.1:30123$")
        self.assertIn('forced_login_method="chatgpt"', codex[0])
        self.assertIn("--output-last-message", codex[0])
        self.assertEqual(codex[1]["env"]["CODEX_HOME"], "/fixture/local-codex")
        self.assertNotIn("CODEX_API_KEY", codex[1]["env"])
        self.assertNotIn("CODEX_ACCESS_TOKEN", codex[1]["env"])
        stop.assert_called_once_with(["ssh", "lease"], f'docker rm -f {endpoint["name"]}', 20)


class TrainingBatchTest(unittest.TestCase):
    batch_id = "12"
    assessment_id = "91169871-14c2-4bde-a0a5-50bf78403d86"

    def test_activity_publication_reads_bounded_safe_events_without_rewriting_unchanged_activity(self):
        at = "2026-11-01T00:00:00Z"
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            stage = root / "JSB-E01" / "ec2-generator"
            stage.mkdir(parents=True)
            data = stage / "activity.jsonl"
            data.write_text("\n".join(
                [json.dumps({"at": at, "kind": "turn_started"})] * 65 + [
                    json.dumps({"at": at, "kind": "command_completed", "program": "curl",
                                "exitCode": 0, "output": "fixture-private"}),
                    json.dumps({"at": at, "kind": "agent_message", "text": "fixture-private"}),
                    '{"kind":"partial"',
                ]
            ))
            state = {"cases": [{"paper_id": "JSB-E01"}]}
            previous = {}
            with patch.object(training, "publish", return_value=True) as publish:
                training.publish_activity("fixture", self.batch_id, root, root, state, previous)
                training.publish_activity("fixture", self.batch_id, root, root, state, previous)
            publish.assert_called_once()
            self.assertEqual(publish.call_args.kwargs["paper_id"], "JSB-E01")
            captured = publish.call_args.args[3]["generator"]
            self.assertEqual(len(captured), training.ACTIVITY_SCHEMA["maxEvents"])
            self.assertEqual(captured[-1], {"at": at, "kind": "command_completed", "program": "curl", "exitCode": 0})
            self.assertNotIn("fixture-private", json.dumps(captured))

    def test_supervisor_reports_a_stopped_journal_without_private_artifacts(self):
        state = {
            "status": "stopped",
            "runtime": {"skill_snapshot": "/private/fixture"},
            "started_at": "2026-11-01T00:00:00Z",
            "finished_at": "2026-11-01T01:00:00Z",
            "guidance": {"generator": {"version_number": 4, "sha256": "private"}, "verifier": {"version_number": 2}},
            "stop": {"phase": "verifying", "reason": "private error"},
            "cases": [{"paper_id": "paper-1", "pdf": "paper.pdf", "status": "stopped", "answer_key_sha256": "private",
                       "score": {"earned": 9, "rubric_maximum": 10},
                       "database": {"assessment_id": self.assessment_id, "generator_result_id": "private"}}],
        }
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)
            (path / "batch.json").write_text(json.dumps(state))
            with patch.object(training, "publish") as publish, patch.object(training.signal, "signal"), \
                    patch.object(training.subprocess, "Popen") as popen, patch.dict(os.environ, {
                        "JUMPSERVE_WORKER_AUTH_VOLUME": "fixture-volume", "JUMPSERVE_WORKER_ZONE": "us-east-1a",
                    }):
                popen.return_value.poll.return_value = 1
                popen.return_value.returncode = 1
                self.assertEqual(training.supervise("fixture-bucket", self.batch_id, path, path), 1)
                self.assertEqual(popen.call_args.args[0][0], "node")
                self.assertTrue(popen.call_args.args[0][4].endswith("/run-jumpserve-synthetic-batch.mjs"))
        snapshots = [call.args[3] for call in publish.call_args_list]
        self.assertEqual([value["status"] for value in snapshots], ["preparing", "stopped"])
        self.assertEqual(snapshots[-1]["stopPhase"], "verifying")
        self.assertEqual(snapshots[-1]["papers"][0]["score"], {"earned": 9, "maximum": 10})
        self.assertEqual(snapshots[-1]["papers"][0]["assessmentId"], self.assessment_id)
        self.assertNotIn("private", json.dumps(snapshots))

    def test_active_run_and_redelivery_cannot_start_another_batch(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {
            "JUMPSERVE_RUNS_DIRECTORY": directory, "JUMPSERVE_TRAINING_BATCH_BUCKET": "fixture-bucket",
        }), patch.object(training.sys, "argv", ["training", self.batch_id]), \
                patch.object(training, "supervise") as supervise, patch.object(training, "publish") as publish:
            with (Path(directory) / "batch.lock").open("ab") as lock:
                training.fcntl.flock(lock, training.fcntl.LOCK_EX | training.fcntl.LOCK_NB)
                self.assertEqual(training.main(), 0)
            self.assertEqual(training.main(), 0)
            supervise.assert_not_called()
            self.assertEqual(publish.call_count, 1)
            self.assertEqual(publish.call_args.args[3]["status"], "busy")


if __name__ == "__main__":
    unittest.main()
