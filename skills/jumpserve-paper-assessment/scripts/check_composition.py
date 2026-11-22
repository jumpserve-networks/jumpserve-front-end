"""Check a JumpServe composition's declared interfaces and print its SHA-256."""

import argparse
from hashlib import sha256
import json
from pathlib import Path


CONTEXT_KINDS = {"paper", "prior-result", "rerun", "hypothesis", "preregistration", "invariant"}


def has_text(value):
    return isinstance(value, str) and bool(value.strip()) and value == value.strip()


def names(value, label):
    if not isinstance(value, list) or not value or not all(map(has_text, value)):
        raise ValueError(f"{label} must be a nonempty list of names.")
    if len(set(value)) != len(value):
        raise ValueError(f"{label} contains duplicate names.")
    return set(value)


def selections(composition, role):
    entries = composition.get(role)
    if not isinstance(entries, list) or (role != "validate" and not entries):
        raise ValueError(f"{role} must be a {'list' if role == 'validate' else 'nonempty list'}.")
    selected = {}
    for entry in entries:
        if not isinstance(entry, dict) or not all(has_text(entry.get(key)) for key in ("id", "version")):
            raise ValueError(f"Every {role} selection needs an id and version.")
        module_id = entry["id"]
        if module_id in selected:
            raise ValueError(f"Duplicate {role} id: {module_id}.")
        if entry.get("implementation") not in ("reviewed", "improvised"):
            raise ValueError(f"{role} {module_id} needs a reviewed or improvised implementation.")
        selected[module_id] = entry
    return selected


def require_names(required, available, label):
    missing = required - available
    if missing:
        raise ValueError(f"{label} missing: {', '.join(sorted(missing))}.")


def check_composition(composition):
    if not isinstance(composition, dict):
        raise ValueError("The composition must be a JSON object.")
    access = {
        module_id: names(entry.get("provides"), f"access {module_id} provides")
        for module_id, entry in selections(composition, "access").items()
    }
    stored = set().union(*(
        names(entry.get("formats"), f"data {module_id} formats")
        for module_id, entry in selections(composition, "data").items()
    ))
    emitted = set()
    for module_id, entry in selections(composition, "experiment").items():
        requires = entry.get("requires")
        if not isinstance(requires, dict) or not requires:
            raise ValueError(f"experiment {module_id} requires must map Access IDs to capabilities.")
        require_names(requires.keys(), access.keys(), f"experiment {module_id} Access selections")
        for access_id, capabilities in requires.items():
            label = f"experiment {module_id} capabilities from {access_id}"
            require_names(names(capabilities, label), access[access_id], label)
        formats = names(entry.get("emits"), f"experiment {module_id} emits")
        require_names(formats, stored, f"experiment {module_id} Data formats")
        emitted.update(formats)

    for module_id, entry in selections(composition, "validate").items():
        label = f"validate {module_id}"
        contexts = names(entry.get("context_kinds"), f"{label} context_kinds")
        context = entry.get("context_kind")
        if not contexts <= CONTEXT_KINDS or not has_text(context) or context not in contexts:
            raise ValueError(f"{label} needs a supported context_kind from its declared context_kinds.")
        require_names(names(entry.get("formats"), f"{label} formats"), emitted, f"{label} observed formats")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("composition", type=Path)
    parser.add_argument("--expected-sha256", help="Check against the frozen composition digest.")
    args = parser.parse_args()
    try:
        contents = args.composition.read_bytes()
        digest = sha256(contents).hexdigest()
        if args.expected_sha256 is not None and digest != args.expected_sha256:
            raise ValueError("The composition differs from its frozen SHA-256.")
        check_composition(json.loads(contents))
    except (OSError, ValueError) as error:
        parser.exit(1, f"{error}\n")
    print(digest)


if __name__ == "__main__":
    main()
