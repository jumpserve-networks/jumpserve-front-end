import type { EmulatedRun, EmulatedPerSecondStat } from "@/app/components/emulated-runs-dashboard";

const CWND_BYTES_PER_PACKET = 1500;
const THROUGHPUT_AXIS_TICK_COUNT = 5;

export function formatClientSummary(run: EmulatedRun | null) {
  if (!run) {
    return "n/a";
  }

  const ccaLabel =
    run.congestionControlAlgorithmName ??
    (run.congestionControlAlgorithmId !== null
      ? `id ${run.congestionControlAlgorithmId}`
      : "n/a");
  const delayLabel =
    run.delayAddedMs !== null ? `${run.delayAddedMs}ms` : "n/a";
  const clientStartDelayLabel =
    run.clientStartDelayMs !== null ? `${run.clientStartDelayMs}ms start` : "n/a start";
  const clientFileSizeLabel =
    run.clientFileSizeMegabytes !== null
      ? `${run.clientFileSizeMegabytes}MB`
      : "n/a size";

  return `${ccaLabel}, ${delayLabel}, ${clientStartDelayLabel}, ${clientFileSizeLabel}`;
}

export function trimTrailingZeros(value: string) {
  if (!value.includes(".")) {
    return value;
  }
  return value.replace(/\.?0+$/, "");
}

export function formatScaleValue(value: number) {
  const absolute = Math.abs(value);
  if (absolute > 0 && absolute < 0.001) {
    const [coefficient, exponent] = value.toExponential(2).split("e");
    return `${trimTrailingZeros(coefficient)}e${exponent}`;
  }
  if (absolute >= 100) {
    return trimTrailingZeros(value.toFixed(0));
  }
  if (absolute >= 10) {
    return trimTrailingZeros(value.toFixed(1));
  }
  if (absolute >= 1) {
    return trimTrailingZeros(value.toFixed(2));
  }
  return trimTrailingZeros(value.toFixed(3));
}

export function formatSecondsValue(value: number) {
  return value.toFixed(2);
}

export function roundToHundredth(value: number) {
  return Number(value.toFixed(2));
}

export function convertCwndBytesToPackets(bytes: number | null) {
  if (bytes === null || !Number.isFinite(bytes)) {
    return null;
  }

  // Snapshot stats store cwnd in bytes. Convert to approximate packet counts
  // for chart display using a fixed packet size.
  return bytes / CWND_BYTES_PER_PACKET;
}

export function getPointXSeconds(point: EmulatedPerSecondStat, index: number) {
  if (point.elapsedSeconds !== null && Number.isFinite(point.elapsedSeconds)) {
    return roundToHundredth(point.elapsedSeconds);
  }

  if (point.snapshotIndex !== null) {
    return roundToHundredth(point.snapshotIndex);
  }

  return roundToHundredth(index);
}

export function getNearestPointByXValue<T extends { xValue: number; yValue: number }>(
  points: T[],
  xValue: number,
) {
  if (points.length === 0) {
    return null;
  }

  return points.reduce((closest, point) =>
    Math.abs(point.xValue - xValue) < Math.abs(closest.xValue - xValue)
      ? point
      : closest,
  );
}

export function getNiceStep(rawStep: number) {
  if (!Number.isFinite(rawStep) || rawStep <= 0) {
    return 1;
  }

  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const fraction = rawStep / magnitude;

  if (fraction <= 1) {
    return magnitude;
  }
  if (fraction <= 2) {
    return 2 * magnitude;
  }
  if (fraction <= 5) {
    return 5 * magnitude;
  }
  return 10 * magnitude;
}

export function buildNiceYTicks(minValue: number, maxValue: number, count = 6) {
  if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) {
    return { min: 0, max: 1, ticks: [0, 1] };
  }

  if (minValue === maxValue) {
    const delta = minValue === 0 ? 1 : Math.abs(minValue) * 0.2;
    minValue -= delta;
    maxValue += delta;
  }

  const rawStep = (maxValue - minValue) / Math.max(count - 1, 1);
  const step = getNiceStep(rawStep);
  const niceMin = Math.floor(minValue / step) * step;
  const niceMax = Math.ceil(maxValue / step) * step;
  const ticks: number[] = [];

  for (let value = niceMin; value <= niceMax + step * 0.5; value += step) {
    ticks.push(Number(value.toFixed(10)));
  }

  return { min: niceMin, max: niceMax, ticks };
}

export function buildReferenceXTicks(maxValue: number, referencePointCount = 8) {
  if (!Number.isFinite(maxValue) || maxValue <= 0) {
    return [0];
  }

  const step = maxValue / referencePointCount;
  const ticks = Array.from(
    { length: referencePointCount + 1 },
    (_, index) => roundToHundredth(step * index),
  );

  return Array.from(new Set(ticks));
}

export function buildFixedRangeTicks(maxValue: number, tickCount = THROUGHPUT_AXIS_TICK_COUNT) {
  if (!Number.isFinite(maxValue) || maxValue <= 0) {
    return [0, 1];
  }

  const step = maxValue / Math.max(tickCount - 1, 1);
  return Array.from({ length: tickCount }, (_, index) =>
    Number((step * index).toPrecision(12)),
  );
}
