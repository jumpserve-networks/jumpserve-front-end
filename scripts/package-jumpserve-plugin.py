"""Build the standalone Generator skill and the Claude Code and Codex plugin."""

import argparse
from hashlib import sha256
from io import BytesIO
import json
from pathlib import Path
from zipfile import ZipFile, ZipInfo


ROOT = Path(__file__).resolve().parents[1]
SITE = "https://jumpserve.quaint-lab.org"
VERSION = "1.8.2"
SKILL = "jumpserve-paper-assessment"
VERIFIER = "jumpserve-assessment-verifier"
COACH = "jumpserve-assessment-coach"
ARCHIVE = f"jumpserve-plugin-v{VERSION}.zip"
SKILL_ARCHIVE = f"{SKILL}-v{VERSION}.zip"
INSTRUCTION_FILES = ("references/instruction-loading.md",)
SKILL_FILES = (
    "SKILL.md",
    "agents/openai.yaml",
    "references/assessment.schema.json",
    "references/aws-testbeds.md",
    "references/modules.md",
    "references/permissions.md",
    "references/shareable-text.json",
    "references/sharing.md",
    "references/testbed.md",
    "scripts/aws_testbed.py",
    "scripts/check_composition.py",
    "scripts/check_experiment_evidence.py",
    "scripts/check_local_docker.py",
    "scripts/download_paper.py",
) + INSTRUCTION_FILES
VERIFIER_FILES = (
    "SKILL.md",
    "agents/openai.yaml",
    "references/grading.md",
    "scripts/prepare_review.py",
) + INSTRUCTION_FILES
COACH_FILES = (
    "SKILL.md",
    "agents/openai.yaml",
    "references/candidate.md",
    "references/saving.md",
    "scripts/prepare_candidate.py",
    "scripts/prepare_feedback.py",
) + INSTRUCTION_FILES
DESCRIPTION = "Recreate research testbeds, run experiments locally, and view the results on JumpServe."


def json_bytes(value):
    return (json.dumps(value, indent=2) + "\n").encode()


def zip_bytes(folder, files):
    buffer = BytesIO()
    with ZipFile(buffer, "w") as archive:
        for name, content in sorted(files.items()):
            entry = ZipInfo(f"{folder}/{name}")
            entry.create_system = 3
            entry.external_attr = 0o100644 << 16
            archive.writestr(entry, content)
    return buffer.getvalue()


def build_release():
    plugin = {
        "name": "jumpserve",
        "version": VERSION,
        "description": DESCRIPTION,
        "author": {"name": "JumpServe"},
        "homepage": SITE + "/research-verification/new-assessment",
    }
    claude_market = {
        "name": "jumpserve",
        "description": DESCRIPTION,
        "owner": {"name": "JumpServe"},
    }
    files = {
        ".claude-plugin/plugin.json": plugin,
        ".codex-plugin/plugin.json": {
            **plugin,
            "skills": "./skills/",
            "mcpServers": "./.mcp.json",
            "interface": {"displayName": "JumpServe"},
        },
        ".mcp.json": {"mcpServers": {"jumpserve": {"type": "http", "url": SITE + "/mcp"}}},
        ".claude-plugin/marketplace.json": {
            **claude_market,
            "plugins": [{"name": "jumpserve", "source": "./", "description": DESCRIPTION}],
        },
        ".agents/plugins/marketplace.json": {
            "name": "jumpserve",
            "plugins": [{
                "name": "jumpserve",
                "source": {"source": "local", "path": "./"},
                "policy": {"installation": "AVAILABLE", "authentication": "ON_USE"},
            }],
        },
    }
    entries = {name: json_bytes(content) for name, content in files.items()}
    skill_dir = ROOT / "skills" / SKILL
    skill_files = {name: (skill_dir / name).read_bytes() for name in SKILL_FILES}
    entries.update({f"skills/{SKILL}/{name}": content for name, content in skill_files.items()})
    verifier_dir = ROOT / "skills" / VERIFIER
    entries.update({f"skills/{VERIFIER}/{name}": (verifier_dir / name).read_bytes() for name in VERIFIER_FILES})
    coach_dir = ROOT / "skills" / COACH
    entries.update({f"skills/{COACH}/{name}": (coach_dir / name).read_bytes() for name in COACH_FILES})
    bundle = zip_bytes("jumpserve-plugin", entries)
    catalog = {
        **claude_market,
        "plugins": [{
            "name": "jumpserve",
            "description": DESCRIPTION,
            "source": {
                "source": "archive",
                "url": f"{SITE}/downloads/{ARCHIVE}",
                "sha256": sha256(bundle).hexdigest(),
            },
        }],
    }
    return {
        ARCHIVE: bundle,
        SKILL_ARCHIVE: zip_bytes(SKILL, skill_files),
        "jumpserve-claude-marketplace.json": json_bytes(catalog),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Verify the packaged files against source.")
    args = parser.parse_args()
    for name, contents in build_release().items():
        path = ROOT / "public" / "downloads" / name
        if args.check:
            if not path.is_file() or path.read_bytes() != contents:
                parser.exit(1, f"Regenerate {path.relative_to(ROOT)} with {Path(__file__).name}.\n")
        else:
            path.write_bytes(contents)
        print(path.relative_to(ROOT))


if __name__ == "__main__":
    main()
