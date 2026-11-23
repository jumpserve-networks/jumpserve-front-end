# Request approvals and continue the assessment

**Never automatically reject a permission request.** Only record a user decline
when the client reports that the user explicitly declined. Record an automatic
rejection as a blocked attempt and keep the request pending for human review.
If client policy prohibits the action or human review, record that restriction
and keep the affected work paused.

## Select human approval

Use a session that routes approval requests to the user whenever the client's
policy allows it. The client owns approval routing. Present these instructions
to the user when a mode change is needed. Keep the sandbox and existing grants.

- **Codex app.** Select **Ask for approval** below the composer. [Codex permissions](https://learn.chatgpt.com/docs/permission-modes)
- **Codex CLI.** From the local assessment workspace, start:

  ```sh
  codex --sandbox workspace-write --ask-for-approval on-request -c 'approvals_reviewer="user"'
  ```

  [Codex sandbox settings](https://learn.chatgpt.com/docs/sandboxing#configure-defaults)
- **Claude Code.** Choose **Manual** or launch `claude --permission-mode default`.
  Use `/sandbox` to check whether the native retry is available under the active
  policy. [Claude Code permission modes](https://code.claude.com/docs/en/permission-modes)

## Get access when it is needed

1. Identify required resources while planning. Use existing grants and early
   read-only checks in the normal sandbox. Proceed with the in-scope local
   experiment under the assessment request. Handle any native permission needs
   as they arise, starting with source PDF retrieval.
2. When a required action is blocked by a confirmed or likely client restriction,
   use the client's native human approval mechanism. If the active mode is
   explicitly automatic, identify the pending action and ask the user to switch
   modes before submitting a new request. If the client does not expose the mode,
   submit the scoped native request and check the result. Name the specific
   command, path, destination, or capability and explain its effect in one
   sentence. Use the shortest sufficient grant. Keep credentials and private
   ticket URLs out of prompt text.
3. After a grant, continue from the blocked operation. If the approval mechanism
   has already executed the operation, use its result. Reconcile uncertain
   launches, writes, and uploads before retrying. Keep the confirmed commands,
   targets, scientific criteria, cost and time limits. Handle later blockers at
   the step where they occur, including cleanup and approved delivery.
4. While waiting, continue independent work. Record a human decline, managed
   restriction, or unavailable permission mechanism and pause affected work.
   A failed approved retry calls for diagnosis. If a different authorized resource
   can meet the frozen design, verify its equivalence and use it within the
   existing scope.

Use the client's permission prompt when a specific operation requires one.
Obtain separate authorization for work beyond the request, such as using
unapproved external targets, sharing private data, or exceeding a stated limit.

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

### When a request never reaches the user

Use the actual tool or review result to distinguish a human decline, an
automatic review denial, and a policy that prevents an approval request. If
the result only says the request was rejected, report the rejection without
assigning it to a reviewer. Share the stated reason when available, omitting
credentials and private URLs.

Tell the user which action is waiting and how to [select human approval](#select-human-approval).
Record the blocked attempt and pending request in `resume.md`. Keep the action
pending until the user resumes with an eligible approval mechanism. Once the user switches modes
and asks to continue, reconcile any uncertain side effects, then submit the
specific native request. A chat message can authorize scope or resume work.
The client still needs to grant the permission. If policy prevents human review,
record the restriction. A PDF the user supplies from Step 1 can be
[verified offline](sharing.md#recover-from-a-blocked-pdf-download).
[Codex automatic review](https://learn.chatgpt.com/docs/sandboxing/auto-review)

## Check local Docker when the design uses it

Run the read-only preflight in the normal sandbox as soon as the design
identifies a Linux Docker dependency, before writing the runner.

```sh
python3 "$SKILL_DIR/scripts/check_local_docker.py"
```

- `ready` verifies a reachable Linux daemon. Check the experiment's capabilities
  when acquiring the runtime.
- `socket_denied` identifies a possible sandbox restriction. For an in-scope
  experiment, use native approval for the exact command in `retry_argv`.
- Other statuses identify a missing CLI, unavailable daemon or context, a
  different transport, or another preflight failure. Diagnose the indicated
  condition. The helper contacts only local sockets. Use the explicitly
  confirmed endpoint for a design that needs a different transport.

## Resume after an approval blocker

Save `resume.md` in the local assessment directory. Record the JumpServe assessment
ID, next action and working directory, approval outcome, and
whether a launch or staging was attempted. Include the verified PDF identity,
authorized scope, frozen specification and digests as they become available.
Refer to local receipts and evidence by relative path, keeping credentials and
tickets out of the handoff.
Tell the user where the handoff is and give the relevant recovery action. If
they need a new session, use the [human approval instructions](#select-human-approval)
from the saved assessment directory.

Give the user this prompt for the new session:

> Use the JumpServe Generator skill (`jumpserve-paper-assessment`) to resume the local assessment in
> `resume.md`. Continue within the recorded scope and use native approval for
> any blocked operation. Return the private assessment link after completion.

Use the same verified PDF, assessment ID and frozen design when resuming.
Recheck the saved digests and reconcile prior attempts before continuing. Request
native access only for the next blocked operation. If policy still forbids it,
keep the affected work paused until a permitted environment is available.

Saving an unresolved assessment can reserve the ID for that exact bundle.
Keep a requested run pending locally unless the user chooses to save the
unresolved assessment on JumpServe. Mark a claim untested when its experiment never ran, or
inconclusive when evidence is insufficient after acquisition started.
