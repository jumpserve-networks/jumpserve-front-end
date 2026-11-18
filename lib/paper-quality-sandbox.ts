/** This exact program must appear in a completed Code Interpreter call, with its
 * source-bound result in provider tool logs. Generated programs never run on
 * the application server. The reviewer supplies tests; this runner supplies the
 * independent parsing, execution bounds, source checks and result envelope. */
export const QUALITY_SANDBOX_MARKER = "JUMPSERVE_QUALITY_CHECKS_V1 ";
export function qualitySandboxProgram(sourceHash: string): string {
  if (!/^[a-f0-9]{64}$/.test(sourceHash)) throw new Error("A retained quality source hash is required.");
  return SANDBOX.replace("__SOURCE_HASH__", sourceHash);
}
/** Code Interpreter sometimes wraps the literal program in exec. Accept only
 * these complete, inert wrappers around the unchanged checker, never snippets
 * that merely contain it alongside other executable code. */
export function isQualitySandboxProgram(code: string | null | undefined, sourceHash: string): boolean {
  const actual = code?.trim(), expected = qualitySandboxProgram(sourceHash).trim();
  if (actual === expected) return true;
  for (const quote of ["'''", '"""']) {
    if (actual === "exec(r" + quote + "\n" + expected + "\n" + quote + ")") return true;
    for (const name of ["checker", "checker_code"]) {
      if (actual === name + " = r" + quote + "\n" + expected + "\n" + quote + "\nns = {}\nexec(" + name + ", ns, ns)") return true;
    }
  }
  return false;
}
const SANDBOX = String.raw`import ast, hashlib, json, os, pathlib, platform, re, subprocess, sys
EXPECTED = "__SOURCE_HASH__"
MARKER = "JUMPSERVE_QUALITY_CHECKS_V1 "
result = {"source_sha256": EXPECTED, "platform": platform.system(), "passed": False, "syntax": [], "behavior": {}, "errors": []}
try:
    assert platform.system() == "Linux", "Linux analysis sandbox required"
    files = list(pathlib.Path("/mnt/data").glob("**/*" + EXPECTED + ".json"))
    matches = []
    for file in files:
        try:
            envelope = json.loads(file.read_text())
            if envelope.get("source_sha256") == EXPECTED and hashlib.sha256(envelope["source_json"].encode()).hexdigest() == EXPECTED:
                matches.append(envelope)
        except (OSError, ValueError, KeyError):
            pass
    assert matches, "Source-bound candidate attachment missing"
    source = json.loads(matches[0]["source_json"])
    assert source["step"] == 4
    root = pathlib.Path("/mnt/data/jumpserve_quality_" + EXPECTED)
    root.mkdir(exist_ok=True)
    candidate_dir = root / "candidate"
    candidate_dir.mkdir(exist_ok=True)
    blocks = [("setup", source["candidate"]["setup"])] + list(source["candidate"]["actions"].items()) + [("cleanup", source["candidate"]["cleanup"])]
    assert len(blocks) <= 132, "Too many command blocks"
    python_files = []
    for ref, block in blocks:
        assert re.fullmatch(r"setup|cleanup|[1-8][.][0-9]{1,2}(?:[.][0-9]{1,2})?", ref)
        if block["kind"] != "terminal":
            continue
        code = block["commands"]
        path = candidate_dir / (ref + ".sh")
        path.write_text(code)
        parsed = subprocess.run(["/bin/bash", "--noprofile", "--norc", "-n", str(path)], capture_output=True, text=True, timeout=3)
        ok = parsed.returncode == 0 and not re.search(r"here-document.*delimited by end-of-file", parsed.stderr, re.I)
        result["syntax"].append({"ref": ref, "language": "bash", "passed": ok, "error": parsed.stderr[:2000]})
        lines = code.splitlines()
        i = 0
        while i < len(lines):
            opening = lines[i]
            match = re.search(r"<<(-?)\s*(['\"]?)([A-Za-z_][A-Za-z0-9_]*)\2", opening)
            i += 1
            if not match:
                continue
            body = []
            while i < len(lines) and (lines[i].lstrip("\t") if match[1] else lines[i]) != match[3]:
                body.append(lines[i].lstrip("\t") if match[1] else lines[i]); i += 1
            assert i < len(lines), "Unterminated heredoc in " + ref
            i += 1
            if not (re.search(r"\bpython(?:3)?\b|[.]py(?:[.]tmp|[.]new)?", opening) or (body and re.search(r"^#!.*\bpython(?:3)?\b", body[0]))):
                continue
            program = "\n".join(body)
            pp = candidate_dir / (ref + "-" + str(len(python_files)) + ".py")
            pp.write_text(program); python_files.append(str(pp))
            try:
                ast.parse(program)
                result["syntax"].append({"ref": ref, "language": "python", "passed": True, "error": ""})
            except SyntaxError as failure:
                result["syntax"].append({"ref": ref, "language": "python", "passed": False, "error": str(failure)[:2000]})
    (root / "candidate-index.json").write_text(json.dumps({"python_files": python_files, "source": source}))
    assert result["syntax"] and all(c["passed"] for c in result["syntax"]), "Candidate syntax checks failed"
    tests = root / "reviewer_tests.py"
    assert tests.exists(), "Write independent reviewer_tests.py in " + str(root)
    test_source = tests.read_text()
    assert len(test_source.encode()) <= 100000, "Bounded reviewer tests required"
    tree = ast.parse(test_source)
    methods = [n for n in ast.walk(tree) if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name.startswith("test_")]
    categories = ["normal", "boundary", "missing_data", "prerequisites", "failure", "cleanup"]
    if "netem" in json.dumps(source).lower():
        categories.append("zero_delay")
    for category in categories:
        matched = [m for m in methods if m.name.startswith("test_" + category)]
        assert matched and any(any(isinstance(n, ast.Assert) or isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute) and n.func.attr.startswith("assert") for n in ast.walk(m)) for m in matched), "Missing executable assertion for " + category
    originals = {str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in candidate_dir.iterdir() if p.is_file()}
    # Tests run in a separate bounded interpreter. They must mock all external
    # networking/privileged commands and use only explicitly labelled fixtures.
    bootstrap = "import os,resource,runpy;resource.setrlimit(resource.RLIMIT_CPU,(15,15));resource.setrlimit(resource.RLIMIT_FSIZE,(2000000,2000000));runpy.run_path(os.environ['JUMPSERVE_REVIEW_TESTS'],run_name='__main__')"
    env = {"PATH": "/usr/bin:/bin", "HOME": str(root), "JUMPSERVE_REVIEW_ROOT": str(root), "JUMPSERVE_REVIEW_TESTS": str(tests), "LC_ALL": "C.UTF-8"}
    executed = subprocess.run([sys.executable, "-I", "-c", bootstrap], capture_output=True, text=True, timeout=25, cwd=root, env=env)
    unchanged = all(pathlib.Path(path).exists() and hashlib.sha256(pathlib.Path(path).read_bytes()).hexdigest() == digest for path, digest in originals.items())
    result["behavior"] = {"test_count": len(methods), "categories": categories, "tests_sha256": hashlib.sha256(test_source.encode()).hexdigest(), "exit_code": executed.returncode, "candidate_unchanged": unchanged, "stdout": executed.stdout[-4000:], "stderr": executed.stderr[-4000:]}
    assert executed.returncode == 0, "Behavioral regression tests failed"
    assert unchanged, "Tests must not modify candidate programs"
    result["passed"] = True
except Exception as failure:
    result["errors"].append(str(failure)[:2000])
proof_text = json.dumps(result, sort_keys=True)
pathlib.Path("/mnt/data/jumpserve-quality-" + EXPECTED + "-result.json").write_text(proof_text)
print(MARKER + proof_text)`;
