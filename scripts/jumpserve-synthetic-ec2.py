"""Provision and transfer one synthetic batch stage through an AWS testbed lease."""

import argparse
from contextlib import contextmanager, nullcontext, suppress
from datetime import datetime, timezone
import importlib.util
import json
import os
from pathlib import Path, PurePosixPath
import re
import selectors
import shlex
import shutil
import signal
import socket
import subprocess
import sys
import tarfile
import tempfile
import time


LEASE = Path(__file__).resolve().parents[1] / "skills/jumpserve-paper-assessment/scripts/aws_testbed.py"
AMI = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64"
INSTANCE_TYPES = ("t3.small", "t3.medium", "t3.large")
REMOTE = "/home/ec2-user/jumpserve-batch"
ARCHIVE_LIMIT = 512 * 1024 * 1024
MAX_FILES = 10_000
BOOTSTRAP = """#!/bin/bash
set -eu
install -d -m 700 -o ec2-user -g ec2-user /home/ec2-user/.ssh
printf '%s\\n' @PUBLIC_KEY@ > /home/ec2-user/.ssh/authorized_keys
chown ec2-user:ec2-user /home/ec2-user/.ssh/authorized_keys
chmod 600 /home/ec2-user/.ssh/authorized_keys
systemctl enable --now amazon-ssm-agent
dnf -qy install docker nodejs24 iptables-nft
systemctl enable --now docker
usermod -aG docker ec2-user
iptables -I INPUT 1 -i docker0 -j DROP
iptables -I INPUT 1 -i docker0 -m conntrack --ctstate ESTABLISHED -j ACCEPT
iptables -I DOCKER-USER 1 -i docker0 -d 169.254.0.0/16 -j DROP
iptables -I DOCKER-USER 1 -i docker0 -d 10.233.0.0/24 -j DROP
for resolver in 10.233.0.2 169.254.169.253; do
    iptables -I DOCKER-USER 1 -i docker0 -d "$resolver" -p udp --dport 53 -j ACCEPT
    iptables -I DOCKER-USER 1 -i docker0 -d "$resolver" -p tcp --dport 53 -j ACCEPT
done
touch /run/jumpserve-batch-ready
"""


def template(public_key, instance_profile, instance_type, volume=None, zone=None, subnet=None, security_group=None):
    """Build a leased SSM worker in its own VPC or the configured training subnet."""
    ref = lambda name: {"Ref": name}
    resources = {
        "Vpc": {"Type": "AWS::EC2::VPC", "Properties": {
            "CidrBlock": "10.233.0.0/24", "EnableDnsSupport": True, "EnableDnsHostnames": True,
        }},
        "Gateway": {"Type": "AWS::EC2::InternetGateway"},
        "AttachGateway": {"Type": "AWS::EC2::VPCGatewayAttachment", "Properties": {
            "VpcId": ref("Vpc"), "InternetGatewayId": ref("Gateway"),
        }},
        "Subnet": {"Type": "AWS::EC2::Subnet", "Properties": {
            "VpcId": ref("Vpc"), "CidrBlock": "10.233.0.0/28",
        }},
        "Routes": {"Type": "AWS::EC2::RouteTable", "Properties": {"VpcId": ref("Vpc")}},
        "PublicRoute": {"Type": "AWS::EC2::Route", "DependsOn": "AttachGateway", "Properties": {
            "RouteTableId": ref("Routes"), "DestinationCidrBlock": "0.0.0.0/0", "GatewayId": ref("Gateway"),
        }},
        "SubnetRoutes": {"Type": "AWS::EC2::SubnetRouteTableAssociation", "Properties": {
            "RouteTableId": ref("Routes"), "SubnetId": ref("Subnet"),
        }},
        "WorkerSecurity": {"Type": "AWS::EC2::SecurityGroup", "Properties": {
            "VpcId": ref("Vpc"), "GroupDescription": "JumpServe batch worker package, model and SSM access",
            "SecurityGroupEgress": [{"IpProtocol": "tcp", "FromPort": port, "ToPort": port, "CidrIp": "0.0.0.0/0"}
                                    for port in (80, 443)],
        }},
        "Worker": {"Type": "AWS::EC2::Instance", "DependsOn": ["PublicRoute", "SubnetRoutes", "AttachGateway"],
                   "Properties": {
            "ImageId": ref("WorkerAmi"), "InstanceType": instance_type,
            "IamInstanceProfile": instance_profile,
            "MetadataOptions": {"HttpTokens": "required", "HttpPutResponseHopLimit": 1, "HttpProtocolIpv6": "disabled"},
            "NetworkInterfaces": [{"DeviceIndex": "0", "AssociatePublicIpAddress": True,
                                   "DeleteOnTermination": True, "GroupSet": [ref("WorkerSecurity")], "SubnetId": ref("Subnet")}],
            "BlockDeviceMappings": [{"DeviceName": "/dev/xvda", "Ebs": {
                "Encrypted": True, "VolumeType": "gp3", "VolumeSize": 20, "DeleteOnTermination": True,
            }}],
            "PropagateTagsToVolumeOnCreation": True,
            "UserData": {"Fn::Base64": BOOTSTRAP.replace("@PUBLIC_KEY@", shlex.quote(public_key))},
        }},
    }
    for name in ("Vpc", "Gateway", "Subnet", "Routes", "WorkerSecurity", "Worker"):
        resources[name].setdefault("Properties", {})["Tags"] = [{"Key": "JumpServeBatchWorker", "Value": "true"}]
    if volume:
        resources["Subnet"]["Properties"]["AvailabilityZone"] = zone
        resources["Worker"]["Properties"]["Volumes"] = [{"Device": "/dev/sdf", "VolumeId": volume}]
    if subnet:
        worker = resources["Worker"]
        worker.pop("DependsOn")
        interface, = worker["Properties"]["NetworkInterfaces"]
        interface["SubnetId"] = subnet
        interface["GroupSet"] = [security_group]
        resources = {"Worker": worker}
    return {"AWSTemplateFormatVersion": "2010-09-09", "Resources": resources,
            "Parameters": {"WorkerAmi": {"Type": "AWS::SSM::Parameter::Value<AWS::EC2::Image::Id>", "Default": AMI}},
            "Outputs": {"InstanceId": {"Value": ref("Worker")}}}


def input_archive(payload, destination):
    size = 0
    with tarfile.open(destination, "x:gz") as archive:
        for count, path in enumerate(sorted(payload.rglob("*")), start=1):
            if path.is_symlink() or not (path.is_file() or path.is_dir()):
                raise ValueError("EC2 stage inputs must be regular files or directories.")
            size += path.stat().st_size if path.is_file() else 0
            if size > ARCHIVE_LIMIT or count > MAX_FILES:
                raise ValueError("EC2 stage inputs exceed the transfer limit.")
            archive.add(path, arcname=path.relative_to(payload), recursive=False)


def extract_outputs(stream, destination, role):
    if role not in ("generator", "verifier"):
        raise ValueError("Invalid EC2 stage role.")
    output = f"case/{role}"
    files = {f"case/{role}.log", "build.log", "worker.log"}
    if role == "verifier":
        files.update(("case/preflight.log", "case/preflight.json"))
    seen = set()
    size = 0
    with tarfile.open(fileobj=stream, mode="r|gz") as archive:
        for member in archive:
            path = PurePosixPath(member.name)
            if path.is_absolute() or ".." in path.parts or str(path) in seen or not (
                str(path) in files or str(path) == output or str(path).startswith(output + "/")
            ) or not (member.isfile() or member.isdir()):
                raise ValueError("EC2 returned an unsafe stage artifact.")
            seen.add(str(path))
            size += member.size
            if size > ARCHIVE_LIMIT or len(seen) > MAX_FILES:
                raise ValueError("EC2 stage output exceeds the transfer limit.")
            target = destination.joinpath(*path.parts)
            if member.isdir():
                target.mkdir(parents=True, exist_ok=True)
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                with archive.extractfile(member) as source, target.open("xb") as sink:
                    shutil.copyfileobj(source, sink)


def interrupt(signum, _frame):
    raise RuntimeError(f"EC2 stage interrupted by signal {signum}.")


@contextmanager
def process_group(argv, **streams):
    process = subprocess.Popen(argv, start_new_session=True, **streams)
    try:
        yield process
    finally:
        if process.poll() is None:
            with suppress(ProcessLookupError):
                os.killpg(process.pid, signal.SIGKILL)
            process.wait()


def ssh_command(argv, command, timeout, *, data=None, source=None, stdout=subprocess.DEVNULL):
    with process_group([*argv, command], stdin=source if source is not None else subprocess.PIPE,
                       stdout=stdout, stderr=subprocess.DEVNULL) as process:
        process.communicate(input=data, timeout=timeout)
        return process.returncode


def ssh_stream_terminal(argv, command, timeout, activity):
    """Forward terminal frames to the coordinator without writing them to the activity file."""
    deadline = time.monotonic() + timeout
    prefix = b"JUMPSERVE_TERMINAL\t"
    with process_group([*argv, command], stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                       stderr=subprocess.DEVNULL) as process, process.stdout as source, selectors.DefaultSelector() as selector:
        selector.register(source, selectors.EVENT_READ)
        pending = bytearray()
        discarding = False
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0 or not selector.select(remaining):
                raise subprocess.TimeoutExpired("worker terminal stream", timeout)
            chunk = source.read1(65536)
            if not chunk:
                return process.wait(timeout=max(0, deadline - time.monotonic()))
            lines = chunk.split(b"\n")
            for line in lines[:-1]:
                pending.extend(line)
                if not discarding and len(pending) <= 24000:
                    if pending.startswith(prefix):
                        sys.stdout.buffer.write(pending + b"\n")
                        sys.stdout.buffer.flush()
                    elif activity is not None:
                        activity.write(pending + b"\n")
                        activity.flush()
                pending.clear()
                discarding = False
            if len(pending) + len(lines[-1]) > 24000:
                discarding = True
                pending.clear()
            if not discarding:
                pending.extend(lines[-1])


def report_activity(stage, kind):
    try:
        with (stage / "activity.jsonl").open("a", encoding="utf-8") as log:
            log.write(json.dumps({"kind": kind, "at": datetime.now(timezone.utc).isoformat()}) + "\n")
    except OSError:
        print("Could not record worker activity.", file=sys.stderr)


def wait_for_forward(tunnel, port, timeout):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline and tunnel.poll() is None:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.2):
                return
        except OSError:
            time.sleep(0.1)
    raise RuntimeError("Could not open the loopback SSH forward to the EC2 executor.")


def run_chatgpt_stage(argv, build, stage, role, remaining):
    session = json.loads((stage / "session.json").read_bytes())
    with tempfile.TemporaryDirectory(prefix="jumpserve-codex-", dir="/tmp") as directory:
        cwd = str(Path(directory).resolve())
        serve = f"cd {REMOTE} && {build} > build.log 2>&1 && node-24 worker.mjs --serve {shlex.quote(cwd)} 2> worker.log"
        with process_group([*argv, serve], stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                           stderr=subprocess.DEVNULL) as process:
            endpoint, _ = process.communicate(timeout=remaining())
            if process.returncode:
                return process.returncode
        endpoint = json.loads(endpoint)
        name, remote_port = endpoint["name"], endpoint["port"]
        if (not isinstance(name, str) or not re.fullmatch(r"jumpserve-batch-[a-f0-9-]{36}-executor", name)
                or type(remote_port) is not int or not 1 <= remote_port <= 65535):
            raise ValueError("The EC2 stage returned an invalid executor endpoint.")

        try:
            with socket.socket() as address:
                address.bind(("127.0.0.1", 0))
                port = address.getsockname()[1]
            forward = [*argv[:-1], "-o", "ExitOnForwardFailure=yes", "-L",
                       f"127.0.0.1:{port}:127.0.0.1:{remote_port}", "-N", argv[-1]]
            env = {key: os.environ[key] for key in ("HOME", "CODEX_HOME", "USER", "LOGNAME", "LANG", "LC_ALL", "PATH", "SHELL", "TMPDIR")
                   if key in os.environ}
            env["CODEX_EXEC_SERVER_URL"] = f"ws://127.0.0.1:{port}"
            command = [*session["command"], "-c", 'forced_login_method="chatgpt"',
                       "--disable", "apps", "--disable", "plugins", "--disable", "hooks", "--cd", cwd]
            if role == "verifier":
                command.extend(("--output-last-message", str(stage / ".controller-scorecard.json")))
            with (stage / "controller-codex.log").open("xb") as log:
                with process_group(forward, stdin=subprocess.DEVNULL, stdout=log, stderr=log) as tunnel:
                    wait_for_forward(tunnel, port, min(20, remaining()))
                    with process_group([*command, "-"], cwd=cwd, env=env, stdin=subprocess.PIPE,
                                       stdout=log, stderr=log) as codex:
                        timeout = min(remaining(), session["timeoutMs"] / 1000)
                        try:
                            codex.communicate(input=session["prompt"].encode(), timeout=timeout)
                        except subprocess.TimeoutExpired:
                            log.write(b"\nThe controller Codex session timed out.\n")
                            return 124
                        return codex.returncode
        finally:
            if ssh_command(argv, f"docker rm -f {name}", min(20, remaining())):
                raise RuntimeError("Could not stop the EC2 executor before retrieving its artifacts.")


def worker_driver(stage, role, auth, volume, terminal=False):
    for signum in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP):
        signal.signal(signum, interrupt)
    if auth == "api-key":
        key_path = stage / ".model-key"
        key = key_path.read_bytes()
        key_path.unlink()
    output, = json.loads(Path(os.environ["JUMPSERVE_AWS_OUTPUTS"]).read_bytes())
    instance_id = output["outputs"]["InstanceId"]
    if not re.fullmatch(r"i-[a-f0-9]{8,17}", instance_id):
        raise ValueError("AWS did not return the leased EC2 instance ID.")
    proxy = shlex.join(["aws", "--profile", os.environ["AWS_PROFILE"], "--region", output["region"],
                        "--no-cli-pager", "ssm", "start-session", "--target", instance_id,
                        "--document-name", "AWS-StartSSHSession", "--parameters", "portNumber=22"])
    argv = ["ssh", "-F", "/dev/null", "-T", "-o", "BatchMode=yes", "-o", "IdentitiesOnly=yes", "-o", "IdentityAgent=none",
            "-o", "StrictHostKeyChecking=accept-new", "-o", f"UserKnownHostsFile={shlex.quote(str(stage / 'known_hosts'))}",
            "-o", "GlobalKnownHostsFile=/dev/null", "-o", "ServerAliveInterval=10", "-o", "ServerAliveCountMax=3",
            "-o", "ConnectTimeout=10", "-o", f"ProxyCommand={proxy}", "-i", str(stage / "identity"), f"ec2-user@{instance_id}"]
    deadline = datetime.fromisoformat(os.environ["JUMPSERVE_AWS_EXPIRES_AT"].replace("Z", "+00:00"))
    if auth == "worker-chatgpt":
        report_activity(stage, "worker_connecting")

    def remaining():
        return max(1, (deadline - datetime.now(timezone.utc)).total_seconds() - 5)

    ready_until = time.monotonic() + min(remaining(), 600)
    while time.monotonic() < ready_until:
        try:
            if ssh_command(argv, "test -f /run/jumpserve-batch-ready && docker info >/dev/null", min(remaining(), 25)) == 0:
                break
        except subprocess.TimeoutExpired:
            pass
        time.sleep(5)
    else:
        raise RuntimeError(f"EC2 {role} worker {instance_id} did not become ready over Session Manager.")

    if auth == "worker-chatgpt":
        report_activity(stage, "inputs_transferring")
    with (stage / "input.tar.gz").open("rb") as source:
        if ssh_command(argv, f"umask 077; mkdir {REMOTE} && tar -xzf - -C {REMOTE}", remaining(), source=source):
            raise RuntimeError(f"Could not transfer the {role} inputs to the leased EC2 instance.")

    build = ("docker build --build-arg BATCH_UID=$(id -u) --build-arg BATCH_GID=$(id -g) "
             f"--target {shlex.quote(role)} -t jumpserve-batch worker-image")
    if auth == "chatgpt":
        status = run_chatgpt_stage(argv, build, stage, role, remaining)
    elif auth == "worker-chatgpt":
        serial = volume.replace("-", "")
        device = f"/dev/disk/by-id/nvme-Amazon_Elastic_Block_Store_{serial}"
        mount_command = f"sudo mkdir -p /mnt/jumpserve-codex && sudo mount -t ext4 -o nosuid,nodev,noexec {device} /mnt/jumpserve-codex"
        mounted = ssh_command(argv, mount_command, min(30, remaining())) == 0
        if not mounted:
            raise RuntimeError("Could not mount the dedicated Codex credential volume on the worker.")
        try:
            report_activity(stage, "environment_building")
            command = f"cd {REMOTE} && {build} > build.log 2>&1 && node-24 worker.mjs --chatgpt-volume 2> worker.log"
            try:
                activity = (stage / "activity.jsonl").open("ab")
            except OSError:
                activity = None
            if terminal:
                with (activity if activity is not None else nullcontext()) as stdout:
                    status = ssh_stream_terminal(argv, command, remaining(), stdout)
            else:
                with (activity if activity is not None else nullcontext(subprocess.DEVNULL)) as stdout:
                    status = ssh_command(argv, command, remaining(), stdout=stdout)
        finally:
            if ssh_command(argv, "sudo umount /mnt/jumpserve-codex", min(30, remaining())):
                raise RuntimeError("Could not unmount the Codex credential volume before worker teardown.")
    else:
        status = ssh_command(argv, f"cd {REMOTE} && {build} > build.log 2>&1 && node-24 worker.mjs > worker.log 2>&1",
                             remaining(), data=key + b"\n")
    if auth == "worker-chatgpt":
        report_activity(stage, "results_collecting")
    retrieved = stage / "retrieved"
    retrieved.mkdir(mode=0o700)
    targets = f"build.log worker.log case/{role} case/{role}.log"
    if role == "verifier":
        targets += " case/preflight.log case/preflight.json"
    archive_cmd = f"cd {REMOTE} && set --; for path in {targets}; do if test -e \"$path\"; then set -- \"$@\" \"$path\"; fi; done; tar -czf - -- \"$@\""
    with process_group([*argv, archive_cmd], stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                       stderr=subprocess.DEVNULL) as process:
        extract_outputs(process.stdout, retrieved, role)
        if process.wait(timeout=remaining()):
            raise RuntimeError(f"Could not retrieve the {role} artifacts from the EC2 instance.")
    if status:
        raise RuntimeError(f"EC2 {role} worker stopped. See its retrieved logs in {stage}.")
    if auth == "worker-chatgpt":
        report_activity(stage, "worker_completed")
    if auth == "chatgpt" and role == "verifier":
        # Only the authenticated local CLI supplies the final scorecard in ChatGPT mode.
        scorecard = retrieved / "case" / "verifier" / "scorecard.json"
        scorecard.parent.mkdir(parents=True, exist_ok=True)
        os.replace(stage / ".controller-scorecard.json", scorecard)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    subcommands = parser.add_subparsers(dest="action", required=True)
    driver = subcommands.add_parser("driver")
    driver.add_argument("stage", type=Path)
    driver.add_argument("role", choices=("generator", "verifier"))
    auth_modes = ("api-key", "chatgpt", "worker-chatgpt")
    driver.add_argument("auth", choices=auth_modes)
    driver.add_argument("volume", nargs="?")
    driver.add_argument("--terminal", action="store_true")
    for action in ("check", "run"):
        command = subcommands.add_parser(action)
        command.add_argument("--profile", required=True)
        command.add_argument("--region", required=True)
        command.add_argument("--instance-profile", required=True)
        command.add_argument("--instance-type", choices=INSTANCE_TYPES, required=True)
        if action == "run":
            command.add_argument("--role", choices=("generator", "verifier"), required=True)
            command.add_argument("--stage", type=Path, required=True)
            command.add_argument("--assessment-id", required=True)
            command.add_argument("--ttl-minutes", type=int, required=True)
            command.add_argument("--codex-auth", choices=auth_modes, default="api-key")
            command.add_argument("--worker-auth-volume")
            command.add_argument("--worker-zone")
            command.add_argument("--worker-subnet")
            command.add_argument("--worker-security-group")
            command.add_argument("--terminal", action="store_true")
    args = parser.parse_args()
    os.umask(0o077)
    if args.action == "driver":
        if args.auth == "worker-chatgpt" and not re.fullmatch(r"vol-[0-9a-f]{17}", args.volume or ""):
            raise ValueError("The EC2 worker requires a valid Codex volume ID.")
        worker_driver(args.stage.resolve(), args.role, args.auth, args.volume, args.terminal)
        return
    if not re.fullmatch(r"[A-Za-z0-9_.-]+", args.profile) or not re.fullmatch(r"[a-z]{2}(?:-[a-z]+)+-\d+", args.region):
        raise ValueError("Use a named AWS CLI profile and AWS Region for the EC2 batch.")
    if not re.fullmatch(r"JumpServeExperimentWorkload-[A-Za-z0-9_+=.@-]+", args.instance_profile):
        raise ValueError("Use a dedicated JumpServeExperimentWorkload instance profile with only SSM access.")
    if args.action == "check":
        for executable in ("aws", "session-manager-plugin", "ssh", "ssh-keygen"):
            if not shutil.which(executable):
                raise RuntimeError(f"Install {executable} to run the EC2 batch.")
        spec = importlib.util.spec_from_file_location("jumpserve_aws_testbed", LEASE)
        lease = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(lease)
        lease.verify_account(args.profile, args.region)
        print(json.dumps({"engine": "ec2", "account": lease.ACCOUNT, "region": args.region,
                          "profile": args.profile, "instance_profile": args.instance_profile, "instance_type": args.instance_type}))
        return
    stage = args.stage.resolve()
    if args.codex_auth == "worker-chatgpt":
        if not re.fullmatch(r"vol-[0-9a-f]{17}", args.worker_auth_volume or "") or not re.fullmatch(
            re.escape(args.region) + r"[a-z]", args.worker_zone or ""
        ):
            raise ValueError("Provide the encrypted Codex volume ID and its Availability Zone.")
        if (args.worker_subnet or args.worker_security_group) and (
            not re.fullmatch(r"subnet-[0-9a-f]{17}", args.worker_subnet or "")
            or not re.fullmatch(r"sg-[0-9a-f]{17}", args.worker_security_group or "")
        ):
            raise ValueError("Provide the dedicated training worker subnet and security group.")
    elif args.worker_auth_volume or args.worker_zone or args.worker_subnet or args.worker_security_group or args.terminal:
        raise ValueError("Worker volume and terminal settings require worker-hosted ChatGPT authentication.")
    if args.codex_auth == "api-key":
        key = sys.stdin.buffer.read(4097).strip()
        if not key or len(key) > 4096 or any(byte <= 32 for byte in key):
            raise ValueError("Supply a scoped Codex API key for the EC2 stage.")
        # Keep the key out of the AWS CLI's stdin, environment and stage archive.
        with (stage / ".model-key").open("xb") as stream:
            stream.write(key)
    with open(os.devnull, "rb") as empty:
        os.dup2(empty.fileno(), sys.stdin.fileno())
    identity = stage / "identity"
    subprocess.run(["ssh-keygen", "-q", "-t", "ed25519", "-N", "", "-f", str(identity)], check=True, timeout=15)
    public_key = identity.with_suffix(".pub").read_text().strip()
    (stage / "testbed.json").write_text(json.dumps(template(public_key, args.instance_profile, args.instance_type,
                                                          args.worker_auth_volume, args.worker_zone,
                                                          args.worker_subnet, args.worker_security_group)))
    input_archive(stage / "payload", stage / "input.tar.gz")
    if args.codex_auth == "worker-chatgpt":
        report_activity(stage, "worker_provisioning")
    os.environ["AWS_IGNORE_CONFIGURED_ENDPOINT_URLS"] = "true"
    os.execv(sys.executable, [sys.executable, "-B", str(LEASE), "run", "--assessment-id", args.assessment_id,
                             "--lease", str(stage / "aws-lease"), "--profile", args.profile,
                             "--ttl-minutes", str(args.ttl_minutes), "--stack", f"{args.region}={stage / 'testbed.json'}",
                             "--", sys.executable, "-B", str(Path(__file__).resolve()), "driver", str(stage), args.role, args.codex_auth,
                             *([args.worker_auth_volume] if args.worker_auth_volume else []),
                             *(["--terminal"] if args.terminal else [])])


if __name__ == "__main__":
    try:
        main()
    except (OSError, RuntimeError, ValueError, KeyError, subprocess.SubprocessError, tarfile.TarError) as error:
        print(error, file=sys.stderr)
        sys.exit(1)
