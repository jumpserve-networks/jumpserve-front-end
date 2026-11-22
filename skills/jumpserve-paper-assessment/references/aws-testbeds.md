# Temporary AWS testbeds

Use this workflow when an assessment needs AWS infrastructure. The assessment
client still owns experiment execution and evidence. The AWS testbed runs in
account `395567831870` with the `JumpServeExperimentClient` role.

## Prepare the experiment

- Verify the role is available with AWS CLI v2 and the `jumpserve-experiment`
  profile or an explicitly configured profile for the same role. The helper
  checks the account and role through STS before any write. If credentials
  expire or the role is missing, use the client's approval workflow and
  continue independent work while access is restored.
- Include resource sizes, Regions, network access, expected cost and maximum
  lifetime in the frozen design. Use the available scope and spending limits.
  Provision one CloudFormation stack for each needed Region or independent
  resource group. Use isolated networks and resources owned by this lease.
- Write JSON templates using native CloudFormation resources authorized by
  the account's experiment execution policy. Review external code, AMIs,
  service side effects and deletion settings. Use existing approved workload
  roles if needed. The helper supports inline templates up to 51,200 bytes
  each. Declare dependencies and outputs directly, and use deletion settings
  that remove resources, disks and backups. Include explicit cleanup for
  service-side data that can prevent deletion, such as nonempty buckets.
- Keep secrets out of templates, stack outputs and command arguments. Run
  downloaded experiment code in isolated testbed resources without access to
  the operator's credentials. The local driver should be reviewed code.

## Provision, run and destroy

Run from the private assessment directory on macOS or Linux with Python 3.9+
and AWS CLI v2. Use a new lease directory for each run. Set the duration from
the experiment's resource plan and include enough time to provision and collect
evidence. A single-stack example follows.

```sh
python3 "$SKILL_DIR/scripts/aws_testbed.py" run \
  --assessment-id "$ASSESSMENT_ID" --lease aws-attempt-01 --ttl-minutes 45 \
  --stack us-east-1=testbed.json -- python3 run_experiment.py
```

Repeat `--stack REGION=TEMPLATE.json` for multiple stacks. The helper creates
a one-time AWS-side expiration schedule for each stack before submitting its
creation, then waits for all stacks to become ready. The trusted local driver
receives `JUMPSERVE_AWS_OUTPUTS`, a path to a JSON array of stack IDs, Regions
and output maps in stack argument order. It also receives
`JUMPSERVE_AWS_EXPIRES_AT` and the assessment AWS profile.

Use the driver to check readiness, run the workload and retrieve raw
measurements before it returns. Remove any data or dependencies that block
stack deletion during driver cleanup. The helper then destroys the tagged
stacks in reverse order, checks CloudFormation for unresolved resources, and
removes the expiration schedules. It attempts teardown on driver failure and
interrupts. A lost client can leave cleanup to the expiration schedule, which
requests deletion at the deadline. AWS can still report deletion failures.

## Recover an interrupted lease

Keep `state.json` within the lease directory. With the original account and
role, run the recovery command after the previous helper has stopped.

```sh
python3 "$SKILL_DIR/scripts/aws_testbed.py" cleanup --lease aws-attempt-01
```

Reconcile the existing lease before provisioning a replacement. If deletion
fails, use the saved stack ARN and AWS events to address the owned resource's
failure, then rerun cleanup. If a launch outcome is unknown and the stack is
temporarily absent, the helper retains the expiration schedule until the
lease expires. Preserve per-stack IDs, final cleanup status and the evidence
you retrieved. Keep the lease state, cloud identifiers and raw output private.

The account operator installs the dedicated IAM access stack once. The
JumpServe infrastructure repository documents that setup in
`docs/assessment-aws-access.md`.
