"""Exercise the testbed lifecycle against a fake AWS API and a real local driver."""

from argparse import Namespace
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "skills/jumpserve-paper-assessment/scripts"))
import aws_testbed as testbed


class FakeAWS:
    def __init__(self):
        self.account = testbed.ACCOUNT
        self.calls = []
        self.stacks = {}
        self.schedules = {}
        self.pending_create = None
        self.uncertain_create = False
        self.fail_create_region = None
        self.fail_delete = False
        self.retained = []

    def accept_stack(self, region, parameters):
        name = parameters["StackName"]
        stack_id = f"arn:aws:cloudformation:{region}:{self.account}:stack/{name}/{uuid4()}"
        self.stacks[name] = {
            "StackId": stack_id, "StackStatus": "CREATE_COMPLETE", "Tags": parameters["Tags"],
            "Outputs": [{"OutputKey": "Ready", "OutputValue": region}],
        }
        return {"StackId": stack_id}

    def __call__(self, profile, region, service, operation, **parameters):
        self.calls.append((operation, region, parameters))
        if operation == "get-caller-identity":
            return {"Account": self.account, "Arn": f"arn:aws:sts::{self.account}:assumed-role/{testbed.CLIENT_ROLE}/fixture"}
        if operation == "get-schedule":
            name = parameters["Name"]
            if name not in self.schedules:
                raise testbed.AwsError(operation, "An error occurred (ResourceNotFoundException)")
            return self.schedules[name]
        if operation == "create-schedule":
            name = parameters["Name"]
            self.schedules[name] = dict(parameters, Arn=f"arn:aws:scheduler:{region}:{self.account}:schedule/default/{name}")
            return {"ScheduleArn": self.schedules[name]["Arn"]}
        if operation == "delete-schedule":
            del self.schedules[parameters["Name"]]
            return {}
        if operation == "create-stack":
            assert parameters["StackName"] in self.schedules
            assert parameters["RoleARN"] == testbed.EXECUTION_ROLE
            assert parameters["OnFailure"] == "DELETE"
            if region == self.fail_create_region:
                raise testbed.AwsError(operation, "An error occurred (AccessDenied) while provisioning")
            if self.uncertain_create:
                self.pending_create = (region, parameters)
                raise testbed.AwsError(operation, "request timed out; outcome uncertain")
            return self.accept_stack(region, parameters)
        reference = parameters["StackName"]
        name = reference.split("/")[1] if reference.startswith("arn:") else reference
        if operation == "describe-stacks":
            if name not in self.stacks:
                raise testbed.AwsError(operation, f"An error occurred (ValidationError): Stack with id {reference} does not exist")
            return {"Stacks": [self.stacks[name]]}
        if operation == "delete-stack":
            assert reference == self.stacks[name]["StackId"]
            self.stacks[name]["StackStatus"] = "DELETE_FAILED" if self.fail_delete else "DELETE_COMPLETE"
            return {}
        if operation == "list-stack-resources":
            return {"StackResourceSummaries": self.retained}
        raise AssertionError(f"Unexpected AWS operation: {service} {operation}")


class TestAwsTestbed(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.base = Path(temporary.name)
        self.directory = self.base / "lease"
        self.template = self.base / "testbed.json"
        self.template.write_text(json.dumps({"Resources": {"Network": {"Type": "AWS::EC2::VPC"}}}))
        self.aws = FakeAWS()
        connection = patch.object(testbed, "aws", self.aws)
        connection.start()
        self.addCleanup(connection.stop)
        self.args = Namespace(
            assessment_id=str(uuid4()), ttl_minutes=30, profile="jumpserve-experiment",
            stack=[f"us-east-1={self.template}", f"us-west-2={self.template}"],
            driver=[sys.executable, "-c", "raise SystemExit(0)"],
        )

    def state(self):
        return json.loads((self.directory / "state.json").read_text())

    def operations(self, operation):
        return [(region, args) for name, region, args in self.aws.calls if name == operation]

    def test_multiple_regions_run_driver_and_delete_in_reverse_order(self):
        result_path = self.base / "measurements.json"
        self.args.driver = [
            sys.executable, "-c",
            "import os, pathlib, sys; assert 'AWS_SESSION_TOKEN' not in os.environ; "
            "assert os.environ['AWS_PROFILE'] == 'jumpserve-experiment'; "
            "pathlib.Path(sys.argv[1]).write_bytes(pathlib.Path(os.environ['JUMPSERVE_AWS_OUTPUTS']).read_bytes())",
            str(result_path),
        ]
        with patch.dict(os.environ, {"AWS_SESSION_TOKEN": "synthetic-value"}):
            self.assertEqual(testbed.run(self.args, self.directory), 0)
        self.assertEqual([entry["outputs"]["Ready"] for entry in json.loads(result_path.read_text())],
                         ["us-east-1", "us-west-2"])
        self.assertEqual([region for region, _ in self.operations("delete-stack")], ["us-west-2", "us-east-1"])
        self.assertEqual(self.aws.schedules, {})
        self.assertTrue(all(stack["cleaned"] for stack in self.state()["stacks"]))
        for _, call in self.operations("create-stack"):
            resource = json.loads(call["TemplateBody"])["Resources"]["Network"]
            self.assertEqual(resource["DeletionPolicy"], "Delete")
            self.assertEqual(resource["UpdateReplacePolicy"], "Delete")

    def test_driver_error_still_waits_for_teardown(self):
        self.args.driver = [sys.executable, "-c", "raise SystemExit(23)"]
        self.assertEqual(testbed.run(self.args, self.directory), 23)
        self.assertEqual(len(self.operations("delete-stack")), 2)
        self.assertEqual(self.aws.schedules, {})

    def test_second_stack_failure_cleans_first_and_never_starts_driver(self):
        self.aws.fail_create_region = "us-west-2"
        with patch.object(testbed, "run_driver") as driver:
            with self.assertRaisesRegex(testbed.AwsError, "AccessDenied"):
                testbed.run(self.args, self.directory)
            driver.assert_not_called()
        self.assertEqual([region for region, _ in self.operations("delete-stack")], ["us-east-1"])
        self.assertEqual(self.aws.schedules, {})

    def test_uncertain_create_retains_expiration_and_recovers_same_stack(self):
        self.aws.uncertain_create = True
        with self.assertRaisesRegex(RuntimeError, "AWS cleanup is pending.*Creation of"):
            testbed.run(self.args, self.directory)
        self.assertEqual(len(self.aws.schedules), 1)
        self.assertEqual(len(self.operations("create-stack")), 1)
        self.assertEqual(self.operations("delete-stack"), [])
        self.aws.accept_stack(*self.aws.pending_create)
        testbed.cleanup(self.directory, self.state())
        self.assertEqual(len(self.operations("create-stack")), 1)
        self.assertEqual(len(self.operations("delete-stack")), 1)
        self.assertEqual(self.aws.schedules, {})

    def test_cleanup_failure_preserves_schedule_for_retry(self):
        self.aws.fail_delete = True
        with self.assertRaisesRegex(RuntimeError, "delete failed"):
            testbed.run(self.args, self.directory)
        self.assertEqual(len(self.aws.schedules), 2)
        self.assertTrue(all(not stack.get("cleaned") for stack in self.state()["stacks"]))
        self.aws.fail_delete = False
        testbed.cleanup(self.directory, self.state())
        self.assertEqual(self.aws.schedules, {})

    def test_delete_skipped_is_not_successful_teardown(self):
        self.aws.retained = [{"LogicalResourceId": "Network", "ResourceStatus": "DELETE_SKIPPED"}]
        with self.assertRaisesRegex(RuntimeError, "unresolved resources: Network"):
            testbed.run(self.args, self.directory)
        self.assertEqual(len(self.aws.schedules), 2)

    def test_wrong_account_refuses_every_write(self):
        self.aws.account = "111111111111"
        with self.assertRaisesRegex(ValueError, testbed.ACCOUNT):
            testbed.run(self.args, self.directory)
        self.assertFalse(self.directory.exists())
        self.assertEqual([operation for operation, _, _ in self.aws.calls], ["get-caller-identity"])

    def test_retained_resources_and_embedded_transforms_refuse_every_write(self):
        for resource in (
            {"Type": "AWS::EC2::VPC", "DeletionPolicy": "Retain"},
            {"Type": "AWS::EC2::VPC", "Properties": {"Fn::Transform": {"Name": "AWS::Include"}}},
            {"Type": "AWS::CloudFormation::Stack"},
            {"Type": "Custom::ExternalResource"},
        ):
            with self.subTest(resource=resource):
                self.template.write_text(json.dumps({"Resources": {"Network": resource}}))
                with self.assertRaises(ValueError):
                    testbed.run(self.args, self.directory)
                self.assertEqual(self.aws.calls, [])


if __name__ == "__main__":
    unittest.main()
