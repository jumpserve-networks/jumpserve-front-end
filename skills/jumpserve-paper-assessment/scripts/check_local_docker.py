"""Classify Docker access from the current sandbox without starting containers."""

import argparse
import json
import os
import subprocess


def docker(*args):
    return subprocess.run(
        ["docker", *args], capture_output=True, text=True, timeout=8,
        env={**os.environ, "LC_ALL": "C"},
    )


def check():
    context = docker("context", "inspect", "--format", "{{.Endpoints.docker.Host}}")
    if context.returncode:
        return {"status": "context_error", "detail": context.stderr.strip()}

    endpoint = context.stdout.strip()
    if not endpoint.startswith(("unix:///", "npipe:////./pipe/")) or "\n" in endpoint:
        return {"status": "other_endpoint", "detail": "The active Docker context uses a different transport from a local Docker socket."}

    args = ("--host", endpoint, "info", "--format", "{{.OSType}}")
    info = docker(*args)
    if info.returncode == 0:
        os_type = info.stdout.strip()
        return {"status": "ready" if os_type == "linux" else "non_linux", "os_type": os_type}

    detail = info.stderr.strip()
    error = detail.lower()
    if any(message in error for message in ("permission denied", "operation not permitted", "access is denied")):
        return {"status": "socket_denied", "detail": detail, "retry_argv": ["docker", *args]}
    if any(message in error for message in ("cannot connect", "connection refused", "no such file", "file specified")):
        return {"status": "daemon_unavailable", "detail": detail}
    return {"status": "daemon_error", "detail": detail}


def main():
    argparse.ArgumentParser(description=__doc__).parse_args()
    try:
        result = check()
    except FileNotFoundError:
        result = {"status": "cli_missing", "detail": "Docker CLI is unavailable on PATH."}
    except subprocess.TimeoutExpired:
        result = {"status": "timeout", "detail": "The read-only Docker preflight timed out."}
    except OSError as error:
        result = {"status": "cli_error", "detail": str(error)}
    print(json.dumps(result))
    return 0 if result["status"] == "ready" else 1


if __name__ == "__main__":
    raise SystemExit(main())
