#!/usr/bin/env python3
"""Package the coordinator runtime and synthetic inputs from the current checkout."""

import argparse
from pathlib import Path
import tarfile


ROOT = Path(__file__).resolve().parents[1]
FILES = (
    "package.json", "package-lock.json",
    "scripts/jumpserve-assessment.mjs", "scripts/jumpserve-synthetic-batch.Dockerfile",
    "scripts/jumpserve-synthetic-ec2-worker.mjs", "scripts/jumpserve-synthetic-ec2.py",
    "scripts/run-jumpserve-synthetic-batch.mjs",
    "scripts/jumpserve-training-batch@.service", "scripts/run-jumpserve-training-batch.py",
)
TREES = {
    "scripts/jumpserve-linux-testbed": (".py", ".sh"),
    "lib": (".ts", ".json"),
    "scripts/lib": (".json", ".mjs"),
    "skills/jumpserve-paper-assessment": (".json", ".md", ".mjs", ".py", ".yaml", ".yml"),
    "skills/jumpserve-assessment-verifier": (".json", ".md", ".mjs", ".py", ".yaml", ".yml"),
    "answer-keys": (".json",),
    "pdfs/synthetic_papers": (".pdf",),
}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("destination", type=Path)
    destination = parser.parse_args().destination
    paths = {ROOT / name for name in FILES}
    for name, suffixes in TREES.items():
        paths.update(path for path in (ROOT / name).rglob("*") if path.suffix.lower() in suffixes)
    with tarfile.open(destination, "x:gz") as archive:
        for path in sorted(paths):
            if path.is_symlink() or not path.is_file() or not path.resolve().is_relative_to(ROOT):
                raise ValueError(f"Coordinator input must be a regular checkout file: {path.relative_to(ROOT)}")
            archive.add(path, arcname=path.relative_to(ROOT), recursive=False)


if __name__ == "__main__":
    main()
