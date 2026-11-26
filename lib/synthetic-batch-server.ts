import "server-only";
import { SendCommandCommand, SSMClient } from "@aws-sdk/client-ssm";

const client = new SSMClient({ region: "us-east-1", maxAttempts: 1 });

export function getSyntheticBatchConfiguration() {
  const ownerId = process.env.JUMPSERVE_SYNTHETIC_BATCH_OWNER_ID?.trim().toLowerCase();
  const instanceId = process.env.JUMPSERVE_SYNTHETIC_BATCH_INSTANCE_ID?.trim();
  if (!ownerId || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(ownerId) ||
      !instanceId || !/^i-[0-9a-f]{17}$/.test(instanceId)) return null;
  return { ownerId, instanceId };
}

export async function requestSyntheticBatchStart(instanceId: string) {
  const { Command } = await client.send(new SendCommandCommand({
    DocumentName: "JumpServeStartSyntheticBatch",
    DocumentVersion: "1",
    InstanceIds: [instanceId],
    TimeoutSeconds: 30,
  }), { abortSignal: AbortSignal.timeout(8_000) });
  if (!Command?.CommandId) throw new Error("AWS did not return a batch start receipt.");
}
