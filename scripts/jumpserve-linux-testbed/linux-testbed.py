#!/usr/bin/env python3
"""Run a staged network experiment in an offline, disposable Linux guest."""

import argparse
import shutil
import stat
import subprocess
import tempfile
from pathlib import Path


IMAGE = Path("/opt/jumpserve-linux-testbed")


def paths(inputs, output):
    workspace = Path.cwd().resolve()
    inputs, output = inputs.resolve(strict=True), output.resolve()
    if not inputs.is_dir() or not inputs.is_relative_to(workspace) or not output.is_relative_to(workspace):
        raise ValueError("Use input and output directories under the current assessment directory.")
    if output.is_relative_to(inputs) or inputs.is_relative_to(output):
        raise ValueError("Use separate, nonoverlapping input and output directories.")
    if "," in str(inputs) or "," in str(output):
        raise ValueError("Testbed paths must be free of commas.")
    script = inputs / "run.sh"
    if not stat.S_ISREG(script.lstat().st_mode):
        raise ValueError("The input directory must contain a regular run.sh file.")
    return inputs, output


def run(inputs, output, timeout):
    output.mkdir(mode=0o700)
    command = [
        "qemu-system-x86_64", "-no-user-config", "-nodefaults",
        "-machine", "q35,accel=tcg", "-cpu", "max", "-m", "768", "-smp", "2",
        "-display", "none", "-monitor", "none", "-serial", "stdio", "-no-reboot",
        "-nic", "none", "-kernel", str(IMAGE / "vmlinuz"), "-initrd", str(IMAGE / "initrd"),
        "-append", "root=/dev/vda ro console=ttyS0 init=/usr/local/sbin/jumpserve-guest-init",
        "-drive", f"file={IMAGE / 'root.ext4'},if=virtio,format=raw,readonly=on",
        "-virtfs", f"local,path={inputs},mount_tag=input,security_model=none,readonly=on",
        "-virtfs", f"local,path={output},mount_tag=output,security_model=none",
    ]
    with tempfile.TemporaryFile() as console:
        try:
            guest = subprocess.run(command, stdin=subprocess.DEVNULL, stdout=console,
                                   stderr=subprocess.STDOUT, timeout=timeout)
        finally:
            console.seek(0)
            with (output / "boot.log").open("xb") as evidence:
                shutil.copyfileobj(console, evidence)
    code_path = output / "exit-code"
    if guest.returncode or not stat.S_ISREG(code_path.lstat().st_mode) or code_path.stat().st_size > 4:
        raise ValueError("The Linux guest did not record a completed workload.")
    status = int(code_path.read_text())
    if not 0 <= status <= 255:
        raise ValueError("The Linux guest returned an invalid workload exit code.")
    return status


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("inputs", type=Path, help="staging directory containing run.sh and its inputs")
    parser.add_argument("output", type=Path, help="new directory for raw evidence and boot and workload logs")
    parser.add_argument("--timeout", type=int, default=300, help="wall-clock seconds, including boot (1–1200)")
    args = parser.parse_args()
    if not 1 <= args.timeout <= 1200:
        parser.error("--timeout must be between 1 and 1200 seconds.")
    try:
        return run(*paths(args.inputs, args.output), args.timeout)
    except subprocess.TimeoutExpired:
        parser.exit(124, "The Linux guest exceeded its time limit. See boot.log and saved evidence.\n")
    except (OSError, ValueError) as error:
        parser.exit(1, f"Linux testbed: {error}\n")


if __name__ == "__main__":
    raise SystemExit(main())
