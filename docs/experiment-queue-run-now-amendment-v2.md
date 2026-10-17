# Direct experiment run action, amendment v2

This amends [protocol v1](experiment-queue.md); its earlier validation report is
preserved. The evidence-gap button is now **Run experiment now**. One click
preserves a private follow-up and its original registered inputs, queues every
retained check applicable to that exact claim, and opens its Experiment Queue
status. There is no intervening selection/confirmation screen. Prerequisites
retain their original semantics. Missing plans/inputs cannot become fake runs.
Manual checks still appear as **Needs operator**.

Sign-in resumes the action only when this browser tab retains a matching,
single-use run intent (15-minute lifetime). A pasted, linked or prefetched GET
URL alone cannot initiate writes. The backend still verifies Google identity,
source access and study ownership. Retries preserve the same follow-up/job IDs.

After durable enqueue, the API sends a bounded asynchronous notification to the
configured queue worker. The target is restricted to the declared JumpServe AWS
account/Region. Its IAM grant covers that worker only. Acknowledgement means a
notification was accepted, not that an experiment started. The existing atomic
database claim enforces global/study limits, priority, dependencies and exclusive
resources. Manual and terminal jobs are never started by notification. If
notification fails, the job stays queued and the scheduled poll remains a
fallback. Experiment attempts retain their existing no-automatic-retry policy.

Additional development checks, declared before browser/database evaluation:

1. One run click performs prepare/enqueue without a second confirmation, preserves
   incomplete progress, queues all mapped checks, and returns a real job link.
2. A sign-in round trip resumes a saved click; missing, expired, future, mismatched
   or consumed intents do not perform writes. No real Google session is simulated.
3. Accepted notification requests never claim that execution started. Notification
   failures, invalid account targets, disabled workers, manual and terminal jobs
   preserve existing data and execution status.
4. Actual isolated PostgreSQL queue/worker checks execute ready work after a
   synthetic asynchronous notification. With all four global slots occupied,
   another notified job remains queued. The synthetic invocation is not AWS.
5. CDK tests verify the worker-specific invocation grant and API environment.
   Runtime hashes, frontend/backend tests, lint and builds pass.
6. Actual local Next gap actions preserve study/gap/run identities through login.
   The existing desktop/mobile queue regressions and exports continue to pass.

Use the commands from protocol v1. Live Google-authenticated execution, remote
Storage and actual AWS notification delivery remain conditional deployment checks.
No scientific conclusion changes, new empirical measurements or remote writes
are part of this local implementation verification.
