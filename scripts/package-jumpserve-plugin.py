"""Build the standalone assessment skill and the Claude Code and Codex plugin."""

import argparse
from hashlib import sha256
from io import BytesIO
import json
from pathlib import Path
from zipfile import ZipFile, ZipInfo


ROOT = Path(__file__).resolve().parents[1]
SITE = "https://jumpserve.quaint-lab.org"
VERSION = "1.3.5"
SKILL = "jumpserve-paper-assessment"
ARCHIVE = f"jumpserve-plugin-v{VERSION}.zip"
SKILL_ARCHIVE = f"{SKILL}-v{VERSION}.zip"
SKILL_FILES = (
    "SKILL.md",
    "references/assessment.schema.json",
    "references/modules.md",
    "references/sharing.md",
    "scripts/check_composition.py",
    "scripts/download_paper.py",
    "scripts/upload_paper.py",
)
DESCRIPTION = "Assess research papers locally and view the results on JumpServe."


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
