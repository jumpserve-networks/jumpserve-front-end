export function roundToHundredth(value: number) {
  return Number(value.toFixed(2));
}

export function trimTrailingZeros(value: string) {
  if (!value.includes(".")) {
    return value;
  }

  return value.replace(/\.?0+$/, "");
}

export function formatAxisValue(value: number) {
  const absolute = Math.abs(value);
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

export function formatFlowCompletionTimeLabel(value: number) {
  if (!Number.isFinite(value)) {
    return "n/a";
  }

  if (Math.abs(value) >= 1000) {
    return `${formatAxisValue(value / 1000)} s`;
  }

  return `${formatAxisValue(value)} ms`;
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function addAxisHeadroom(maxValue: number) {
  if (!Number.isFinite(maxValue) || maxValue <= 0) {
    return 1;
  }

  return maxValue * 1.1;
}

export function buildLinearTicks(maxValue: number, tickCount = 6) {
  const safeMax = Math.max(maxValue, 1);
  return Array.from({ length: tickCount }, (_, index) => {
    const fraction = index / Math.max(tickCount - 1, 1);
    return roundToHundredth(safeMax * fraction);
  });
}

export function buildLinearTicksForDomain(
  minValue: number,
  maxValue: number,
  tickCount = 6,
) {
  const safeMin = Number.isFinite(minValue) ? minValue : 0;
  const safeMax = Number.isFinite(maxValue) ? maxValue : 1;
  const range = safeMax - safeMin;

  if (Math.abs(range) < 0.000001) {
    return [roundToHundredth(safeMin)];
  }

  return Array.from({ length: tickCount }, (_, index) => {
    const fraction = index / Math.max(tickCount - 1, 1);
    return roundToHundredth(safeMin + range * fraction);
  });
}

export function quantile(sortedValues: number[], fraction: number) {
  if (sortedValues.length === 0) {
    return 0;
  }

  if (sortedValues.length === 1) {
    return sortedValues[0];
  }

  const position = (sortedValues.length - 1) * fraction;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const lower = sortedValues[lowerIndex];
  const upper = sortedValues[upperIndex];

  if (lowerIndex === upperIndex) {
    return lower;
  }

  return lower + (upper - lower) * (position - lowerIndex);
}
