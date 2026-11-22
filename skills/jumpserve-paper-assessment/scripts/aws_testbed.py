"""Run a local experiment driver with temporary JumpServe AWS stacks."""

import argparse
from contextlib import contextmanager, suppress
from datetime import datetime, timedelta, timezone
import fcntl
from hashlib import sha256
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import sys
import tempfile
import time
from uuid import UUID, uuid4


ACCOUNT = "395567831870"
CLIENT_ROLE = "JumpServeExperimentClient"
EXECUTION_ROLE = f"arn:aws:iam::{ACCOUNT}:role/JumpServeExperimentExecution"
CLEANUP_ROLE = f"arn:aws:iam::{ACCOUNT}:role/JumpServeExperimentCleanup"
STACK_NAME = re.compile(r"JumpServeExperiment-[0-9a-f]{32}")
REGION = re.compile(r"[a-z]{2}(?:-[a-z]+)+-[0-9]+")
DELETE_TARGET = "arn:aws:scheduler:::aws-sdk:cloudformation:deleteStack"


class AwsError(RuntimeError):
    def __init__(self, operation, detail):
        self.code = re.search(r"An error occurred \(([^)]+)\)", detail)
        self.code = self.code[1] if self.code else None
        super().__init__(f"{operation}: {detail.strip()}")


def aws(profile, region, service, operation, **parameters):
    argv = [
        "aws", "--profile", profile, "--region", region, "--no-cli-pager",
        "--output", "json", "--cli-connect-timeout", "10", "--cli-read-timeout", "20",
        service, operation,
    ]
    if parameters:
        argv.extend(["--cli-input-json", json.dumps(parameters)])
    read_only = operation.startswith(("get-", "describe-", "list-"))
    env = dict(os.environ, AWS_IGNORE_CONFIGURED_ENDPOINT_URLS="true", AWS_RETRY_MODE="standard",
               AWS_MAX_ATTEMPTS="3" if read_only else "1")
    try:
        result = subprocess.run(argv, text=True, capture_output=True, timeout=45, env=env)
    except subprocess.TimeoutExpired as error:
        raise AwsError(operation, "request timed out; its outcome is uncertain") from error
    if result.returncode:
        raise AwsError(operation, result.stderr)
    return json.loads(result.stdout) if result.stdout.strip() else {}


def verify_account(profile, region):
    identity = aws(profile, region, "sts", "get-caller-identity")
    role = f"arn:aws:sts::{ACCOUNT}:assumed-role/{CLIENT_ROLE}/"
    if identity.get("Account") != ACCOUNT or not identity.get("Arn", "").startswith(role):
        raise ValueError(f"Use the {CLIENT_ROLE} role in AWS account {ACCOUNT}.")


def read_template(path):
    template = json.loads(path.read_bytes())
    resources = template.get("Resources") if isinstance(template, dict) else None
    if not isinstance(resources, dict) or not resources or "Transform" in template:
        raise ValueError("Use a JSON CloudFormation template with resources and no transforms.")
    for resource in resources.values():
        if not isinstance(resource, dict):
            raise ValueError("Each CloudFormation resource must be an object.")
        kind = resource.get("Type", "")
        if not isinstance(kind, str) or not re.fullmatch(r"AWS::[A-Za-z0-9]+::[A-Za-z0-9]+", kind) or kind.startswith(
            ("AWS::CloudFormation::", "AWS::IAM::", "AWS::Scheduler::")
        ):
            raise ValueError(f"Use native experiment resources; unsupported type {kind!r}.")
        if any(resource.get(policy, "Delete") != "Delete" for policy in (
            "DeletionPolicy", "UpdateReplacePolicy",
        )):
            raise ValueError("Temporary resources must use Delete for both resource policies.")
        resource["DeletionPolicy"] = "Delete"
        resource["UpdateReplacePolicy"] = "Delete"
    body = json.dumps(template, separators=(",", ":"), ensure_ascii=True)
    if '"Fn::Transform":' in body:
        raise ValueError("Inline CloudFormation transforms are unsupported in a temporary testbed.")
    if len(body.encode()) > 51200:
        raise ValueError("The CloudFormation template exceeds the 51,200-byte inline limit.")
    return body


def now():
    return datetime.now(timezone.utc)


def expiry(lease):
    return datetime.fromisoformat(lease["expires_at"] + "+00:00")


def write_json(path, value):
    with tempfile.NamedTemporaryFile(mode="w", dir=path.parent, delete=False) as stream:
        pending = Path(stream.name)
        try:
            json.dump(value, stream, indent=2)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
            pending.replace(path)
        finally:
            pending.unlink(missing_ok=True)


@contextmanager
def lock(directory):
    with (directory / "lock").open("a") as stream:
        try:
            fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise RuntimeError("This assessment lease is already in use.") from error
        yield


def call(lease, stack, service, operation, **parameters):
    return aws(lease["profile"], stack["region"], service, operation, **parameters)


def owned_tags(lease, stack):
    return {
        "JumpServeManaged": "assessment",
        "JumpServeAssessment": lease["assessment_id"],
        "JumpServeLease": stack["name"],
        "JumpServeExpiresAt": lease["expires_at"] + "Z",
    }


def stack_id(lease, stack, value):
    prefix = f"arn:aws:cloudformation:{stack['region']}:{ACCOUNT}:stack/{stack['name']}/"
    if not isinstance(value, str) or not value.startswith(prefix):
        raise RuntimeError("AWS returned a stack identity outside the lease.")
    UUID(value[len(prefix):])
    if stack.get("id") and stack["id"] != value:
        raise RuntimeError("AWS returned a different stack identity.")
    return value


def describe(lease, stack):
    target = stack.get("id", stack["name"])
    try:
        found, = call(lease, stack, "cloudformation", "describe-stacks", StackName=target)["Stacks"]
    except AwsError as error:
        if error.code == "ValidationError" and f"Stack with id {target} does not exist" in str(error):
            return None
        raise
    stack_id(lease, stack, found["StackId"])
    tags = {tag["Key"]: tag["Value"] for tag in found.get("Tags", [])}
    if any(tags.get(key) != value for key, value in owned_tags(lease, stack).items()):
        raise RuntimeError(f"Stack {stack['name']} has different ownership tags.")
    return found


def schedule_config(lease, stack):
    return {
        "Name": stack["name"], "GroupName": "default",
        "Description": f"JumpServe assessment {lease['assessment_id']}",
        "ScheduleExpression": f"at({lease['expires_at']})", "ScheduleExpressionTimezone": "UTC",
        "FlexibleTimeWindow": {"Mode": "OFF"}, "ActionAfterCompletion": "DELETE", "State": "ENABLED",
        "Target": {
            "Arn": DELETE_TARGET, "RoleArn": CLEANUP_ROLE,
            "Input": json.dumps({"StackName": stack["name"]}),
            "RetryPolicy": {"MaximumEventAgeInSeconds": 3600, "MaximumRetryAttempts": 12},
        },
    }


def schedule(lease, stack):
    expected = schedule_config(lease, stack)
    try:
        found = call(lease, stack, "scheduler", "get-schedule", Name=stack["name"], GroupName="default")
    except AwsError as error:
        if error.code == "ResourceNotFoundException":
            return None
        raise
    target = found["Target"]
    if (
        found["Arn"] != f"arn:aws:scheduler:{stack['region']}:{ACCOUNT}:schedule/default/{stack['name']}"
        or any(found.get(key) != expected[key] for key in (
            "Name", "GroupName", "Description", "ScheduleExpression", "ScheduleExpressionTimezone",
            "ActionAfterCompletion", "State",
        ))
        or target["Arn"] != DELETE_TARGET or target["RoleArn"] != CLEANUP_ROLE
        or json.loads(target["Input"]) != {"StackName": stack["name"]}
        or target.get("RetryPolicy") != expected["Target"]["RetryPolicy"]
        or found.get("FlexibleTimeWindow") != expected["FlexibleTimeWindow"]
    ):
        raise RuntimeError(f"Schedule {stack['name']} differs from the lease.")
    return found


def wait_for(lease, stack, operation, deadline):
    while now() < deadline:
        found = describe(lease, stack)
        status = found["StackStatus"] if found else None
        if operation == "delete":
            if status in (None, "DELETE_COMPLETE"):
                return None
            if status == "DELETE_FAILED":
                raise RuntimeError(f"{stack['name']} delete failed: {found.get('StackStatusReason', '')}")
        elif status == "CREATE_COMPLETE":
            return found
        elif status not in (None, "CREATE_IN_PROGRESS"):
            raise RuntimeError(f"{stack['name']} stopped creating at {status}.")
        time.sleep(8)
    raise RuntimeError(f"Timed out verifying {operation} for {stack['name']}.")


def provision(directory, lease, stack, body):
    if describe(lease, stack) or schedule(lease, stack):
        raise RuntimeError(f"The generated AWS lease name {stack['name']} is already in use.")
    configuration = schedule_config(lease, stack)
    stack["schedule_attempted"] = True
    write_json(directory / "state.json", lease)
    try:
        call(lease, stack, "scheduler", "create-schedule", **configuration, ClientToken=stack["name"])
    except AwsError:
        if not schedule(lease, stack):
            raise
    if not schedule(lease, stack):
        raise RuntimeError("AWS did not confirm the expiration schedule; the stack was not requested.")
    remaining = int((expiry(lease) - now()).total_seconds() / 60)
    if remaining < 3:
        raise RuntimeError("The lease has insufficient time to provision this stack.")
    stack["create_attempted"] = True
    write_json(directory / "state.json", lease)
    try:
        created = call(
            lease, stack, "cloudformation", "create-stack", StackName=stack["name"],
            TemplateBody=body, RoleARN=EXECUTION_ROLE, OnFailure="DELETE",
            TimeoutInMinutes=remaining - 1, ClientRequestToken=stack["name"] + "-create",
            Tags=[{"Key": key, "Value": value} for key, value in owned_tags(lease, stack).items()],
        )
    except AwsError as error:
        if error.code in {"AccessDenied", "AccessDeniedException", "InsufficientCapabilitiesException", "ValidationError"}:
            stack["create_attempted"] = False
            write_json(directory / "state.json", lease)
        raise
    stack["id"] = stack_id(lease, stack, created["StackId"])
    write_json(directory / "state.json", lease)


def clean_stack(lease, stack):
    if stack.get("create_attempted"):
        found = describe(lease, stack)
        if not found and not stack.get("id") and now() < expiry(lease):
            raise RuntimeError(f"Creation of {stack['name']} is uncertain; AWS expiration remains scheduled.")
        if found and found["StackStatus"] != "DELETE_COMPLETE":
            stack["id"] = found["StackId"]
            if found["StackStatus"] != "DELETE_IN_PROGRESS":
                try:
                    call(lease, stack, "cloudformation", "delete-stack", StackName=stack["id"],
                         ClientRequestToken=f"delete-{uuid4().hex}")
                except AwsError:
                    latest = describe(lease, stack)
                    if latest and latest["StackStatus"] not in ("DELETE_IN_PROGRESS", "DELETE_COMPLETE"):
                        raise
            wait_for(lease, stack, "delete", now() + timedelta(minutes=15))
        if stack.get("id"):
            resources = call(lease, stack, "cloudformation", "list-stack-resources", StackName=stack["id"])
            retained = [
                resource["LogicalResourceId"] for resource in resources["StackResourceSummaries"]
                if resource["ResourceStatus"] in ("DELETE_FAILED", "DELETE_SKIPPED")
            ]
            if retained:
                raise RuntimeError(f"{stack['name']} has unresolved resources: {', '.join(retained)}.")
    if stack.get("schedule_attempted") and schedule(lease, stack):
        try:
            call(lease, stack, "scheduler", "delete-schedule", Name=stack["name"], GroupName="default")
        except AwsError as error:
            if error.code != "ResourceNotFoundException":
                raise
        for _ in range(4):
            if not schedule(lease, stack):
                break
            time.sleep(2)
        else:
            raise RuntimeError(f"Removal of expiration schedule {stack['name']} is unverified.")


def cleanup(directory, lease):
    errors = []
    for stack in reversed(lease["stacks"]):
        if stack.get("cleaned"):
            continue
        try:
            clean_stack(lease, stack)
            stack["cleaned"] = True
            write_json(directory / "state.json", lease)
        except (OSError, RuntimeError, ValueError, KeyError) as error:
            errors.append(str(error))
    if errors:
        raise RuntimeError("AWS cleanup is pending. Recover with cleanup --lease "
                           f"{directory}. " + " ".join(errors))
    print("AWS experiment cleanup verified.", file=sys.stderr)


def run_driver(directory, lease, command):
    remaining = (expiry(lease) - now()).total_seconds()
    if remaining <= 0:
        raise RuntimeError("The AWS experiment lease expired before the driver started.")
    env = {key: value for key, value in os.environ.items() if key not in (
        "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN", "AWS_SECURITY_TOKEN",
        "AWS_ROLE_ARN", "AWS_WEB_IDENTITY_TOKEN_FILE", "AWS_CONTAINER_CREDENTIALS_FULL_URI",
        "AWS_CONTAINER_CREDENTIALS_RELATIVE_URI", "AWS_CONTAINER_AUTHORIZATION_TOKEN",
        "AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE",
    )}
    env.update(
        AWS_PROFILE=lease["profile"], AWS_DEFAULT_PROFILE=lease["profile"],
        AWS_IGNORE_CONFIGURED_ENDPOINT_URLS="true",
        JUMPSERVE_AWS_OUTPUTS=str(directory / "outputs.json"),
        JUMPSERVE_AWS_EXPIRES_AT=lease["expires_at"] + "Z",
    )
    process = subprocess.Popen(command, env=env, start_new_session=True)
    try:
        return process.wait(timeout=remaining)
    except subprocess.TimeoutExpired as error:
        raise RuntimeError("The experiment driver exceeded the AWS lease deadline.") from error
    finally:
        if process.poll() is None:
            with suppress(ProcessLookupError):
                os.killpg(process.pid, signal.SIGTERM)
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                with suppress(ProcessLookupError):
                    os.killpg(process.pid, signal.SIGKILL)
                process.wait()


def validate_lease(lease):
    UUID(lease["assessment_id"])
    expiry(lease)
    if lease.get("account") != ACCOUNT or not lease["stacks"]:
        raise ValueError("The lease is for a different account or has no stacks.")
    for stack in lease["stacks"]:
        if not REGION.fullmatch(stack["region"]) or not STACK_NAME.fullmatch(stack["name"]):
            raise ValueError("The lease has an invalid stack name or Region.")
        if stack.get("id"):
            stack_id(lease, stack, stack["id"])


def run(args, directory):
    command = args.driver[1:] if args.driver[:1] == ["--"] else args.driver
    if not command or args.ttl_minutes < 5:
        raise ValueError("Supply an experiment driver and a lease of at least five minutes.")
    specs = [spec.split("=", 1) for spec in args.stack]
    if any(len(spec) != 2 or not REGION.fullmatch(spec[0]) or not spec[1] for spec in specs):
        raise ValueError("Specify each stack as REGION=TEMPLATE.json.")
    bodies = [read_template(Path(path)) for _, path in specs]
    lease = {
        "account": ACCOUNT, "profile": args.profile, "assessment_id": str(UUID(args.assessment_id)),
        "expires_at": (now().replace(second=0, microsecond=0) + timedelta(minutes=args.ttl_minutes))
        .strftime("%Y-%m-%dT%H:%M:%S"),
        "stacks": [
            {"region": region, "name": f"JumpServeExperiment-{uuid4().hex}",
             "template_sha256": sha256(body.encode()).hexdigest()}
            for (region, _), body in zip(specs, bodies)
        ],
    }
    validate_lease(lease)
    verify_account(args.profile, lease["stacks"][0]["region"])
    directory.mkdir(mode=0o700)
    with lock(directory):
        write_json(directory / "state.json", lease)
        try:
            for stack, body in zip(lease["stacks"], bodies):
                provision(directory, lease, stack, body)
            outputs = []
            for stack in lease["stacks"]:
                found = wait_for(lease, stack, "create", expiry(lease))
                outputs.append({
                    "region": stack["region"], "stack_id": stack["id"],
                    "outputs": {entry["OutputKey"]: entry["OutputValue"] for entry in found.get("Outputs", [])},
                })
            write_json(directory / "outputs.json", outputs)
            return run_driver(directory, lease, command)
        finally:
            cleanup(directory, lease)


def interrupt(signum, _frame):
    raise RuntimeError(f"Interrupted by signal {signum}.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    actions = parser.add_subparsers(dest="action", required=True)
    provisioner = actions.add_parser("run", help="Provision, run the driver, and verify cleanup.")
    provisioner.add_argument("--assessment-id", required=True)
    provisioner.add_argument("--lease", type=Path, required=True)
    provisioner.add_argument("--profile", default="jumpserve-experiment")
    provisioner.add_argument("--ttl-minutes", type=int, required=True)
    provisioner.add_argument("--stack", action="append", metavar="REGION=TEMPLATE.json", required=True)
    provisioner.add_argument("driver", nargs=argparse.REMAINDER)
    recovery = actions.add_parser("cleanup", help="Reconcile and clean a saved lease.")
    recovery.add_argument("--lease", type=Path, required=True)
    args = parser.parse_args()
    directory = args.lease.resolve()
    for signum in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP):
        signal.signal(signum, interrupt)
    try:
        if args.action == "run":
            return run(args, directory)
        with lock(directory):
            lease = json.loads((directory / "state.json").read_bytes())
            validate_lease(lease)
            verify_account(lease["profile"], lease["stacks"][0]["region"])
            cleanup(directory, lease)
    except (OSError, ValueError, RuntimeError, KeyError, subprocess.TimeoutExpired) as error:
        print(error, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
