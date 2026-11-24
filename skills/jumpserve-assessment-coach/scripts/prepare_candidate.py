"""Copy the Generator skill into a fresh local draft and identify its baseline."""

import argparse
from hashlib import sha256
import json
from pathlib import Path
from shutil import copytree, rmtree
from stat import S_IWUSR
from tempfile import mkdtemp


SKILL_NAME = "jumpserve-paper-assessment"
SKILL_ENTRIES = {"SKILL.md", "agents", "assets", "references", "scripts"}
CACHE_ENTRIES = {".DS_Store", ".git", "__pycache__"}


def prepare_candidate(source, review_dir):
    source = source.resolve(strict=True)
    review_dir = review_dir.resolve()
    if not (source / "SKILL.md").is_file():
        raise ValueError("Pass the Generator skill directory containing SKILL.md.")
    if review_dir.is_relative_to(source):
        raise ValueError("The review directory must be outside the Generator skill.")

    def exclude(directory, names):
        ignored = set(names) & CACHE_ENTRIES
        if Path(directory) == source:
            ignored.update(set(names) - SKILL_ENTRIES)
        for name in set(names) - ignored:
            entry = Path(directory) / name
            if entry.is_symlink() or not (entry.is_dir() or entry.is_file()):
                raise ValueError("Generator resources must be regular files or directories.")
        return ignored

    review_dir.mkdir(parents=True, exist_ok=True)
    draft = Path(mkdtemp(prefix="generator-candidate-", dir=review_dir))
    candidate = draft / SKILL_NAME
    try:
        copytree(source, candidate, symlinks=True, ignore=exclude)
        manifest = {}
        for path in [candidate, *sorted(candidate.rglob("*"))]:
            if path.is_symlink():
                raise ValueError("Generator resources must be regular files or directories.")
            path.chmod(path.stat().st_mode | S_IWUSR)
            if path.is_file():
                manifest[path.relative_to(candidate).as_posix()] = sha256(path.read_bytes()).hexdigest()
    except (OSError, ValueError):
        rmtree(draft)
        raise

    baseline = sha256(json.dumps(manifest, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    return {"source_dir": str(source), "candidate_dir": str(candidate), "baseline_sha256": baseline}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("generator_dir", type=Path)
    parser.add_argument("review_dir", type=Path)
    args = parser.parse_args()
    try:
        result = prepare_candidate(args.generator_dir, args.review_dir)
    except (OSError, ValueError) as error:
        parser.exit(1, f"Candidate preparation failed. {error}\n")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
