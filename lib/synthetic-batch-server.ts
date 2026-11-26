import "server-only";
import { GetObjectCommand, paginateListObjectsV2, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { SendCommandCommand, SSMClient } from "@aws-sdk/client-ssm";
import { listLocalTrainingBatches, readLocalTrainingBatch } from "@/lib/local-training-batch-history";
import { isTrainingBatchId, parseTrainingBatchId, type TrainingBatch, type TrainingBatchSnapshot } from "@/lib/training-batch";

const ssm = new SSMClient({ region: "us-east-1", maxAttempts: 1 });
const s3 = new S3Client({ region: "us-east-1" });

type BatchConfiguration = { ownerId: string; instanceId: string; bucket: string };
type BatchRequest = { ownerId: string; requestedAt: string; dispatch: "requested" | "unconfirmed" };
type BatchHistorySource = { kind: "s3"; bucket: string } | { kind: "local"; directory: string };

function getTrainingBatchBucket() {
  const bucket = process.env.JUMPSERVE_TRAINING_BATCH_BUCKET?.trim();
  return bucket && /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket) ? bucket : null;
}

export function getTrainingBatchHistorySource(): BatchHistorySource | null {
  const bucket = getTrainingBatchBucket();
  if (bucket) return { kind: "s3", bucket };
  const directory = process.env.NODE_ENV === "development" && process.env.JUMPSERVE_LOCAL_TRAINING_BATCH_DIRECTORY?.trim();
  return directory ? { kind: "local", directory } : null;
}

export function getSyntheticBatchConfiguration(): BatchConfiguration | null {
  const ownerId = process.env.JUMPSERVE_SYNTHETIC_BATCH_OWNER_ID?.trim().toLowerCase();
  const instanceId = process.env.JUMPSERVE_SYNTHETIC_BATCH_INSTANCE_ID?.trim();
  const bucket = getTrainingBatchBucket();
  if (!ownerId || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(ownerId) ||
      !instanceId || !/^i-[0-9a-f]{17}$/.test(instanceId) ||
      !bucket) return null;
  return { ownerId, instanceId, bucket };
}

const requestPrefix = "requests/";
const requestKey = (id: number) => `${requestPrefix}${id}.json`;
const sequenceKey = "batch-sequence.json";

async function reserveBatchId(bucket: string) {
  const abortSignal = AbortSignal.timeout(5_000);
  for (let attempt = 0; attempt < 6; attempt++) {
    const current = await getRecord<number>(bucket, sequenceKey, abortSignal);
    if (current && (!isTrainingBatchId(current.value) || !current.etag)) {
      throw new Error("Invalid training batch sequence.");
    }
    const id = (current?.value ?? 0) + 1;
    if (!isTrainingBatchId(id)) throw new Error("Training batch sequence exhausted.");
    try {
      await s3.send(new PutObjectCommand({
        Bucket: bucket, Key: sequenceKey, Body: JSON.stringify(id), ContentType: "application/json",
        ...(current ? { IfMatch: current.etag } : { IfNoneMatch: "*" }),
      }), { abortSignal });
      return id;
    } catch (error) {
      if (!(error instanceof Error) || !["PreconditionFailed", "ConditionalRequestConflict"].includes(error.name)) throw error;
    }
  }
  throw new Error("Could not reserve a training batch ID.");
}

async function putRequest(bucket: string, id: number, request: BatchRequest, create: boolean) {
  await s3.send(new PutObjectCommand({
    Bucket: bucket, Key: requestKey(id), Body: JSON.stringify(request), ContentType: "application/json",
    ...(create ? { IfNoneMatch: "*" } : {}),
  }), { abortSignal: AbortSignal.timeout(5_000) });
}

export async function requestSyntheticBatchStart(configuration: BatchConfiguration) {
  const { bucket, ownerId, instanceId } = configuration;
  const id = await reserveBatchId(bucket);
  const request = { ownerId, requestedAt: new Date().toISOString(), dispatch: "requested" } as const;
  await putRequest(bucket, id, request, true);
  try {
    const { Command } = await ssm.send(new SendCommandCommand({
      DocumentName: "JumpServeStartTrainingBatchById",
      DocumentVersion: "1",
      Parameters: { BatchId: [String(id)] },
      InstanceIds: [instanceId],
      TimeoutSeconds: 30,
    }), { abortSignal: AbortSignal.timeout(8_000) });
    if (!Command?.CommandId) throw new Error("AWS did not return a batch start receipt.");
  } catch {
    // A command can have reached the coordinator even when its receipt was lost.
    await putRequest(bucket, id, { ...request, dispatch: "unconfirmed" }, false).catch(() => {});
  }
  return id;
}

async function getRecord<T>(bucket: string, key: string, abortSignal = AbortSignal.timeout(5_000)) {
  try {
    const object = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }),
      { abortSignal });
    if (!object.Body) throw new Error("Training batch record is empty.");
    return { value: JSON.parse(await object.Body.transformToString()) as T, etag: object.ETag };
  } catch (error) {
    if (error instanceof Error && error.name === "NoSuchKey") return null;
    throw error;
  }
}

export async function readTrainingBatch(source: BatchHistorySource, id: number, viewerId?: string): Promise<TrainingBatch | null> {
  if (source.kind === "local") return readLocalTrainingBatch(source.directory, id);
  const { bucket } = source;
  const [requestObject, progressObject] = await Promise.all([
    getRecord<BatchRequest>(bucket, requestKey(id)),
    getRecord<TrainingBatchSnapshot>(bucket, `progress/${id}.json`),
  ]);
  const request = requestObject?.value;
  const snapshot = progressObject?.value;
  if (!request) return null;
  const { requestedAt } = request;
  if (!snapshot) return {
    id, requestedAt, updatedAt: null, startedAt: null, finishedAt: null, stopPhase: null,
    status: request.dispatch === "unconfirmed" || Date.now() - Date.parse(requestedAt) > 120_000 ? "unconfirmed" : "requested",
    stale: false, versions: { generator: null, verifier: null }, papers: [],
  };
  const { status, updatedAt, startedAt, finishedAt, stopPhase, versions, papers } = snapshot;
  const canViewAssessmentLinks = viewerId !== undefined && request.ownerId === viewerId;
  return {
    id, requestedAt, status, updatedAt, startedAt, finishedAt, stopPhase,
    stale: (status === "preparing" || status === "running") && Date.now() - Date.parse(updatedAt) > 60_000,
    versions: { generator: versions.generator, verifier: versions.verifier },
    papers: papers.map(({ id, fileName, status, assessmentId, score }) => ({
      id, fileName, status, assessmentId: canViewAssessmentLinks ? assessmentId : null,
      score: score ? { earned: score.earned, maximum: score.maximum } : null,
    })),
  };
}

async function listCloudBatchIds(bucket: string) {
  const records = [];
  const listings = paginateListObjectsV2({ client: s3, stopOnSameToken: true }, {
    Bucket: bucket, Prefix: requestPrefix,
  }, { abortSignal: AbortSignal.timeout(6_000) });
  for await (const listing of listings) {
    for (const { Key } of listing.Contents ?? []) {
      if (!Key?.startsWith(requestPrefix) || !Key.endsWith(".json")) continue;
      const id = parseTrainingBatchId(Key.slice(requestPrefix.length, -".json".length));
      if (id !== null) records.push(id);
    }
  }
  records.sort((a, b) => b - a);
  return records;
}

export async function listTrainingBatches(source: BatchHistorySource, page: number) {
  const size = 20;
  const start = (page - 1) * size;
  let batches: (TrainingBatch | null)[];
  let count: number;
  if (source.kind === "local") {
    const records = await listLocalTrainingBatches(source.directory);
    count = records.length;
    batches = records.slice(start, start + size);
  } else {
    const records = await listCloudBatchIds(source.bucket);
    count = records.length;
    batches = await Promise.all(records.slice(start, start + size).map(id => readTrainingBatch(source, id)));
  }
  return {
    hasMore: count > start + size,
    batches: batches.filter(batch => batch !== null).map(batch => ({
      id: batch.id, recordedAt: batch.requestedAt ?? batch.startedAt, status: batch.status,
      passed: batch.papers.filter(paper => paper.status === "passed").length,
      total: batch.papers.length,
    })),
  };
}
