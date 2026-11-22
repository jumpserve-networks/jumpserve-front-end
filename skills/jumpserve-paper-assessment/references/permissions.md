# Request approvals and continue the assessment

## Get access when it is needed

1. Identify the resources the design needs while planning. Use existing grants
   and early read-only checks in the normal sandbox. Confirm experiment scope
   before acquiring experiment resources. A request to retrieve the source PDF
   already authorizes that retrieval, so handle its permissions when they arise.
2. When a required action is blocked by a confirmed or likely client restriction,
   invoke the client's native approval mechanism. Make the request during the
   assessment. A sandbox error by itself is a reason to check for and use the
   approval mechanism. Ask for the specific command, path, destination, or tool
   capability and explain its effect in one sentence. Use the shortest grant that
   covers the action. Keep credentials and private ticket URLs out of prompt text.
3. After a grant, continue from the blocked operation. If the approval mechanism
   has already executed the operation, use its result. Reconcile uncertain
   launches, writes, and uploads before retrying. Keep the confirmed commands,
   targets, scientific criteria, cost and time limits. Handle later blockers at
   the step where they occur, including cleanup and approved delivery.
4. While waiting, continue independent work. Pause affected work when the user
   declines, a review rejects the request, the client explicitly forbids the
   operation, or the current tool surface has no applicable approval mechanism.
   Record the actual outcome. A failed approved retry calls for diagnosis of the
   remaining blocker. If a different authorized resource can meet the same
   frozen design, verify its equivalence and use it within the existing scope.

Successful scope confirmation lets routine work proceed with existing grants.
If the client's permission prompt is needed, show it directly. Use a separate
scope decision for changes to the design, destinations, disclosure, or budget.

## Match the request to the blocker

| Blocked resource or operation | Action |
| --- | --- |
| Package/index access, image or toolchain downloads, or a specified endpoint | For likely sandbox DNS, connection, or network-policy errors, request the scoped destination if available or approval for the exact fetch/install command. Pin dependencies as the design requires, install into the intended experiment environment, and use the authorized destinations. Diagnose a verified outage or missing artifact as such. |
| Required file, directory, executable, local socket, or device | Request access to the needed path, mode, or exact command. Use a writable assessment directory when it satisfies the design. If access still fails with the approved client permission, identify the underlying OS, device, or daemon requirement. |
| Container, VM, network namespace, or other experiment runtime | Check reachability and capabilities. Request native approval for the blocked preflight or launch as needed. Pin the approved image or code, mounts, device access, capabilities, isolation, time limits and output location. Use a separate launch approval when the read-only grant does not cover it. |
| Cloud API, JumpServe or other connector, private dataset, or service | Use the configured tool and account. Request the connector's native consent or guide the user to sign in or grant the missing account scope. Service-side access denials require the appropriate provider authorization. Shell approval addresses only a separate local sandbox restriction. For external writes, keep the target account, project, data and budget within scope. |

## Use the client's approval mechanism

- **Codex.** When the session offers a resource-scoped permission tool and it
  can cover the blocker, use it. Otherwise, when the command tool exposes
  escalation, retry the exact command with `sandbox_permissions: "require_escalated"`
  and a short `justification` question. Use one-time approval for experiment
  commands. [Codex sandbox and approvals](https://learn.chatgpt.com/docs/agent-approvals-security#sandbox-and-approvals)
- **Claude Code.** Use the native tool permission prompt. When Bash was blocked
  by its sandbox and an unsandboxed retry is permitted, invoke the same command
  with `dangerouslyDisableSandbox: true`. The active permission mode and managed
  settings govern the request. [Claude Code sandbox retry](https://code.claude.com/docs/en/sandboxing#the-unsandboxed-retry-escape-hatch)

Honor command denials and managed controls across tool surfaces. Keep any
pending work private and preserve the frozen design and evidence.

## Check local Docker when the design uses it

Run the read-only preflight in the normal sandbox as soon as the design
identifies a Linux Docker dependency, before writing the runner.

```sh
python3 "$SKILL_DIR/scripts/check_local_docker.py"
```

- `ready` verifies a reachable Linux daemon. Check the experiment's capabilities
  when acquiring the runtime.
- `socket_denied` identifies a possible sandbox restriction. After scope
  confirmation, use native approval for the exact command in `retry_argv`.
- Other statuses identify a missing CLI, unavailable daemon or context, a
  different transport, or another preflight failure. Diagnose the indicated
  condition. The helper contacts only local sockets. Use the explicitly
  confirmed endpoint for a design that needs a different transport.

## Resume after an approval blocker

Save `resume.md` in the local assessment directory. Record the assessment ID or
local PDF reference, next action and working directory, approval outcome, and
whether a launch or staging was attempted. Include the verified PDF identity,
scope confirmation, frozen specification and digests as they become available.
Refer to local receipts and evidence by relative path, keeping credentials and
tickets out of the handoff.
Tell the user where the handoff is and give the relevant recovery action. For a
client approval setting, offer the following only where policy permits:

- **Codex CLI.** From the assessment directory, start
  `codex --sandbox workspace-write --ask-for-approval on-request`.
  [Codex sandbox and approvals](https://learn.chatgpt.com/docs/sandboxing#configure-defaults)
- **Claude Code.** From the same directory, start `claude --permission-mode default`
  and check `/sandbox` for whether the unsandboxed retry is available. Managed
  strict sandbox mode requires a permitted environment.
  [Claude Code strict sandbox mode](https://code.claude.com/docs/en/sandboxing#turn-off-the-retry-with-strict-sandbox-mode)

Give the user this prompt for the new session:

> Use the JumpServe paper assessment skill to resume the local assessment in
> `resume.md`. Continue within the recorded scope and use native approval for
> any blocked operation. Return the private review link after the assessment.

Use the same verified PDF, assessment ID and confirmed design when resuming.
Recheck the saved digests and reconcile prior attempts before continuing. Request
native access only for the next blocked operation. If policy still forbids it,
keep the affected work paused until a permitted environment is available.

An unresolved preview can reserve the assessment ID for that exact bundle.
Keep a requested run pending locally unless the user chooses to stage the
unresolved assessment. Mark a claim untested when its experiment never ran, or
inconclusive when evidence is insufficient after acquisition started.
