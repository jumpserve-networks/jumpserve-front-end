"""Inspect generated Python source as data; never import or execute it."""
import ast
import json
import re
import sys

errors = []
programs = 0


def inspect(source, label, depth=0):
    global programs
    if depth > 6 or programs >= 32:
        errors.append(f"{label}: embedded-program inspection limit exceeded")
        return
    programs += 1
    try:
        tree = ast.parse(source)
    except SyntaxError as error:
        errors.append(f"{label}:{error.lineno}: {error.msg}")
        return
    functions = {node.name: node for node in tree.body if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))}
    # Skip names shadowed by parameters: these calls cannot be resolved locally.
    shadowed = {argument.arg for node in ast.walk(tree) if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda)) for argument in node.args.posonlyargs + node.args.args + node.args.kwonlyargs}
    for node in ast.walk(tree):
        if isinstance(node, ast.FormattedValue) and isinstance(node.value, ast.IfExp) and isinstance(node.format_spec, ast.JoinedStr):
            spec = "".join(part.value for part in node.format_spec.values if isinstance(part, ast.Constant) and isinstance(part.value, str))
            if re.search(r"[bcdoxXeEfFgGn%]$", spec) and any(isinstance(branch, ast.Constant) and isinstance(branch.value, str) for branch in (node.value.body, node.value.orelse)):
                errors.append(f"{label}:{node.lineno}: conditional string branch uses a numeric format specifier")
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id in functions and node.func.id not in shadowed:
            definition = functions[node.func.id]
            if definition.args.kwarg is None:
                allowed = {argument.arg for argument in definition.args.args + definition.args.kwonlyargs}
                for keyword in node.keywords:
                    if keyword.arg is not None and keyword.arg not in allowed:
                        errors.append(f"{label}:{node.lineno}: {node.func.id}() has no parameter {keyword.arg!r}")
        if isinstance(node, ast.Constant) and isinstance(node.value, str) and re.match(r"^#![^\n]*\bpython(?:3)?\b", node.value):
            inspect(node.value, f"{label}:embedded@{node.lineno}", depth + 1)


inspect(sys.stdin.read(), "heredoc")
print(json.dumps({"programs": programs, "errors": errors}))
sys.exit(1 if errors else 0)
