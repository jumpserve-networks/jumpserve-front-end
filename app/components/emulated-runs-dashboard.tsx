//add here
"use client";

import { formatClientSummary, formatScaleValue, formatSecondsValue, roundToHundredth, convertCwndBytesToPackets, getPointXSeconds, getNearestPointByXValue, buildNiceYTicks, buildReferenceXTicks, buildFixedRangeTicks } from "@/lib/emulated-chart-values";
import { Button } from "@/app/components/ui/button";

import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/app/components/ui/dialog";

export type EmulatedParentRun = {
  id: number;
  createdAt: string | null;
  snapshotLengthSeconds: number | null;
  bottleneckRateMegabit: number | null;
};

export type EmulatedRun = {
  id: number;
  createdAt: string;
  parentRunId: number | null;
  clientNumber: number | null;
  delayAddedMs: number | null;
  clientStartDelayMs: number | null;
  clientFileSizeMegabytes: number | null;
  congestionControlAlgorithmId: number | null;
  congestionControlAlgorithmName: string | null;
};

export type EmulatedPerSecondStat = {
  id: number;
  emulatedRunId: number;
  snapshotIndex: number | null;
  elapsedSeconds: number | null;
  megabitsPerSecond: number | null;
  roundTripTimeMs: number | null;
  bottleneckQueuingDelayMs: number | null;
  inFlightPackets: number | null;
  congestionWindowBytes: number | null;
};

type MetricSpec = {
  id: string;
  title: string;
  unit: string;
  accessor: (point: EmulatedPerSecondStat) => number | null;
};

type ChartSeries = {
  runId: number;
  shortLabel: string;
  label: string;
  clientSummary: string;
  color: string;
  data: EmulatedPerSecondStat[];
};

type HoveredChartPoint = {
  runId: number;
  runSummary: string;
  color: string;
  x: number;
  y: number;
  xValue: number;
  yValue: number;
  companionYValue: number | null;
};

type HoveredSliceValue = {
  runId: number;
  shortLabel: string;
  color: string;
  yValue: number;
  companionYValue: number | null;
  pointX: number;
  pointY: number;
};

type HoveredSlice = {
  x: number;
  xValue: number;
  values: HoveredSliceValue[];
};

const METRICS: MetricSpec[] = [
  {
    id: "mbps",
    title: "Throughput",
    unit: "Mbps",
    accessor: (point) => point.megabitsPerSecond,
  },
  {
    id: "rtt",
    title: "Round-trip Time",
    unit: "ms",
    accessor: (point) => point.roundTripTimeMs,
  },
  {
    id: "queue",
    title: "Queueing Delay",
    unit: "ms",
    accessor: (point) => point.bottleneckQueuingDelayMs,
  },
  {
    id: "cwnd",
    title: "Congestion Window",
    unit: "packets",
    accessor: (point) => convertCwndBytesToPackets(point.congestionWindowBytes),
  },
];

const SERIES_COLORS = [
  "var(--series-1)",
  "var(--series-2)",
  "var(--series-3)",
  "var(--series-4)",
  "var(--series-5)",
  "var(--series-6)",
  "var(--series-7)",
  "var(--series-8)",
];

const THROUGHPUT_AXIS_LIMIT_MULTIPLIER = 2;
const THROUGHPUT_SUM_SERIES_ID = -1;
const X_AXIS_REFERENCE_POINT_COUNT = 8;













function useChartPanelData({
  parentRuns,
  runs,
  stats,
  initialSelectedParentRunId = null,
}: {
  parentRuns: EmulatedParentRun[];
  runs: EmulatedRun[];
  stats: EmulatedPerSecondStat[];
  initialSelectedParentRunId?: number | null;
}) {
  const defaultSelectedParentRunId =
    initialSelectedParentRunId !== null &&
    parentRuns.some((parentRun) => parentRun.id === initialSelectedParentRunId)
      ? initialSelectedParentRunId
      : (parentRuns[0]?.id ?? null);
  const selectedParentRunId = defaultSelectedParentRunId;

  const runsByParent = useMemo(() => {
    const grouped = new Map<number, EmulatedRun[]>();

    for (const run of runs) {
      if (run.parentRunId === null) {
        continue;
      }

      const list = grouped.get(run.parentRunId);
      if (list) {
        list.push(run);
      } else {
        grouped.set(run.parentRunId, [run]);
      }
    }

    for (const value of grouped.values()) {
      value.sort((a, b) => a.id - b.id);
    }

    return grouped;
  }, [runs]);

  const statsByRun = useMemo(() => {
    const grouped = new Map<number, EmulatedPerSecondStat[]>();

    for (const stat of stats) {
      const list = grouped.get(stat.emulatedRunId);
      if (list) {
        list.push(stat);
      } else {
        grouped.set(stat.emulatedRunId, [stat]);
      }
    }

    for (const value of grouped.values()) {
      value.sort((a, b) => {
        const aIndex = a.snapshotIndex ?? Number.MAX_SAFE_INTEGER;
        const bIndex = b.snapshotIndex ?? Number.MAX_SAFE_INTEGER;
        if (aIndex === bIndex) {
          const aElapsed = a.elapsedSeconds ?? Number.MAX_SAFE_INTEGER;
          const bElapsed = b.elapsedSeconds ?? Number.MAX_SAFE_INTEGER;
          return aElapsed - bElapsed;
        }
        return aIndex - bIndex;
      });
    }

    return grouped;
  }, [stats]);

  const selectedParentRun =
    parentRuns.find((parentRun) => parentRun.id === selectedParentRunId) ?? null;
  const selectedRuns = selectedParentRunId
    ? (runsByParent.get(selectedParentRunId) ?? [])
    : [];

  const chartSeries: ChartSeries[] = selectedRuns.map((run, index) => {
    const ccaLabel =
      run.congestionControlAlgorithmName ??
      (run.congestionControlAlgorithmId !== null
        ? `id ${run.congestionControlAlgorithmId}`
        : "n/a");
    const delayLabel = run.delayAddedMs !== null ? `${run.delayAddedMs}ms` : "n/a";
    const clientStartDelayLabel =
      run.clientStartDelayMs !== null ? `${run.clientStartDelayMs}ms start` : "n/a start";
    const clientFileSizeLabel =
      run.clientFileSizeMegabytes !== null
        ? `${run.clientFileSizeMegabytes}MB`
        : "n/a size";
    const legendLabel = `${ccaLabel} ${delayLabel} ${clientStartDelayLabel} ${clientFileSizeLabel}`;

    return {
      runId: run.id,
      shortLabel: legendLabel,
      label: legendLabel,
      clientSummary: formatClientSummary(run),
      color: SERIES_COLORS[index % SERIES_COLORS.length],
      data: statsByRun.get(run.id) ?? [],
    };
  });

  const totalSampleCount = chartSeries.reduce(
    (total, series) => total + series.data.length,
    0,
  );

  return {
    selectedParentRun,
    selectedRuns,
    chartSeries,
    totalSampleCount,
  };
}

export function EmulatedRunChartsPanel({
  parentRuns,
  runs,
  stats,
  initialSelectedParentRunId = null,
}: {
  parentRuns: EmulatedParentRun[];
  runs: EmulatedRun[];
  stats: EmulatedPerSecondStat[];
  initialSelectedParentRunId?: number | null;
}) {
  const { selectedParentRun, selectedRuns, chartSeries, totalSampleCount } =
    useChartPanelData({
      parentRuns,
      runs,
      stats,
      initialSelectedParentRunId,
    });
  const [expandedMetric, setExpandedMetric] = useState<MetricSpec | null>(null);
  const [hoveredMetricId, setHoveredMetricId] = useState<string | null>(null);

  const throughputAxisMaxMbps =
    selectedParentRun?.bottleneckRateMegabit !== null &&
    selectedParentRun?.bottleneckRateMegabit !== undefined
      ? roundToHundredth(
          selectedParentRun.bottleneckRateMegabit * THROUGHPUT_AXIS_LIMIT_MULTIPLIER,
        )
      : null;


  return (
    <>
      {selectedParentRun ? (
        <>
          {selectedRuns.length > 0 ? (
            <>
              <p className="mb-3 text-xs tracking-normal text-muted-foreground">
                {totalSampleCount} total samples across selected child runs
              </p>
              <div
                className="grid min-w-0 gap-4 md:grid-cols-2"
                onMouseLeave={() => setHoveredMetricId(null)}
              >
                {METRICS.map((metric) => (
                  <MetricChart
                    key={metric.id}
                    metricId={metric.id}
                    series={chartSeries}
                    title={metric.title}
                    unit={metric.unit}
                    accessor={metric.accessor}
                    throughputAxisMaxMbps={throughputAxisMaxMbps}
                    onExpand={() => {
                      setHoveredMetricId(null);
                      setExpandedMetric(metric);
                    }}
                    onCardHoverStart={() => setHoveredMetricId(metric.id)}
                    onCardHoverEnd={() =>
                      setHoveredMetricId((current) =>
                        current === metric.id ? null : current,
                      )
                    }
                    isActive={hoveredMetricId === metric.id}
                    isDimmed={
                      hoveredMetricId !== null && hoveredMetricId !== metric.id
                    }
                  />
                ))}
              </div>
            </>
          ) : (
            <EmptyState text="This parent run has no child rows in emulated_runs." />
          )}
        </>
      ) : (
        <EmptyState text="No parent run selected." />
      )}
      <Dialog
        open={Boolean(expandedMetric)}
        onOpenChange={(open) => { if (!open) setExpandedMetric(null); }}
      >
        {expandedMetric ? (
          <DialogContent
            showCloseButton={false}
            className="flex max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-7xl sm:max-w-7xl flex-col overflow-hidden rounded-lg border border-border bg-slate-800/92 p-3 sm:max-h-[calc(100dvh-2rem)] sm:p-4"
            aria-describedby={undefined}
          >
            <div className="mb-3 flex shrink-0 items-start justify-between gap-3 px-1">
              <DialogTitle className="min-w-0 text-sm font-semibold text-slate-100 sm:text-base">
                Expanded View: {expandedMetric.title}
              </DialogTitle>
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => setExpandedMetric(null)}
                className="h-auto whitespace-normal shrink-0 rounded-lg border border-border bg-slate-700/90 px-3 py-1.5 text-xs font-medium text-slate-100 hover:bg-slate-600"
              >
                Close
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
              <MetricChart
                metricId={expandedMetric.id}
                series={chartSeries}
                title={expandedMetric.title}
                unit={expandedMetric.unit}
                accessor={expandedMetric.accessor}
                throughputAxisMaxMbps={throughputAxisMaxMbps}
                size="expanded"
              />
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
    </>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground dark:text-foreground">
      {text}
    </div>
  );
}

function MetricChart({
  metricId,
  series,
  title,
  unit,
  accessor,
  throughputAxisMaxMbps,
  onExpand,
  size = "default",
  onCardHoverStart,
  onCardHoverEnd,
  isActive = false,
  isDimmed = false,
}: {
  metricId: string;
  series: ChartSeries[];
  title: string;
  unit: string;
  accessor: (point: EmulatedPerSecondStat) => number | null;
  throughputAxisMaxMbps?: number | null;
  onExpand?: () => void;
  size?: "default" | "expanded";
  onCardHoverStart?: () => void;
  onCardHoverEnd?: () => void;
  isActive?: boolean;
  isDimmed?: boolean;
}) {
  const [hoveredRunId, setHoveredRunId] = useState<number | null>(null);
  const [hoveredPoint, setHoveredPoint] = useState<HoveredChartPoint | null>(
    null,
  );
  const [hoveredSlice, setHoveredSlice] = useState<HoveredSlice | null>(null);
  const [hoveredCursorX, setHoveredCursorX] = useState<number | null>(null);
  const [pinnedRunId, setPinnedRunId] = useState<number | null>(null);
  const [pinnedPoint, setPinnedPoint] = useState<HoveredChartPoint | null>(null);
  const [hiddenRunIds, setHiddenRunIds] = useState<number[]>([]);
  const isCwndMetric = metricId === "cwnd";
  const isExpanded = size === "expanded";
  const areInlineChartInteractionsEnabled = isExpanded;
  const chartWidth = isExpanded ? 1200 : 460;
  const chartHeight = isExpanded ? 620 : 220;
  const leftPadding = isExpanded ? 78 : 56;
  const rightPadding = isExpanded ? 28 : 18;
  const topPadding = isExpanded ? 26 : 18;
  const bottomPadding = isExpanded ? 132 : 52;
  const plotWidth = chartWidth - leftPadding - rightPadding;
  const plotHeight = chartHeight - topPadding - bottomPadding;
  const cardShellClassName = `min-w-0 transition-opacity duration-[240ms] ${
    isDimmed ? "opacity-65" : "opacity-100"
  }`;
  const cardClassName = `min-w-0 rounded-lg border border-border bg-card p-3 transition-[border-color,box-shadow] duration-200 sm:p-4 ${
    isDimmed
      ? ""
      : `${isActive ? "border-primary/40 dark:border-border " : ""} focus-within:border-ring `
  }`;
  const activeRunId = pinnedRunId ?? hoveredRunId;
  const displayedPoint = pinnedPoint ?? hoveredPoint;

  useEffect(() => {
    if (pinnedRunId === null) {
      return;
    }

    const clearPinnedSelection = () => {
      setPinnedRunId(null);
      setPinnedPoint(null);
      setHoveredRunId(null);
      setHoveredPoint(null);
      setHoveredSlice(null);
    };

    document.addEventListener("pointerdown", clearPinnedSelection, true);
    return () =>
      document.removeEventListener("pointerdown", clearPinnedSelection, true);
  }, [pinnedRunId]);

  const normalizedSeries = series
    .map((runSeries) => {
      const points = runSeries.data
        .map((point, index) => {
          const xValue = getPointXSeconds(point, index);
          const yValue = accessor(point);
          if (!Number.isFinite(xValue) || !Number.isFinite(yValue)) {
            return null;
          }
          return {
            xValue: xValue as number,
            yValue: yValue as number,
          };
        })
        .filter((point) => point !== null);
      const companionPoints = isCwndMetric
        ? runSeries.data
            .map((point, index) => {
              const xValue = getPointXSeconds(point, index);
              const yValue = point.inFlightPackets;
              if (!Number.isFinite(xValue) || !Number.isFinite(yValue)) {
                return null;
              }
              return {
                xValue: xValue as number,
                yValue: yValue as number,
              };
            })
            .filter((point) => point !== null)
        : [];

      return {
        ...runSeries,
        points: points as Array<{ xValue: number; yValue: number }>,
        companionPoints: companionPoints as Array<{ xValue: number; yValue: number }>,
      };
    })
    .filter((runSeries) => runSeries.points.length > 0);

  if (normalizedSeries.length === 0) {
    return (
      <div
        className={cardShellClassName}
        onMouseEnter={() => onCardHoverStart?.()}
        onMouseLeave={() => {
          setHoveredRunId(null);
          setHoveredPoint(null);
          setHoveredSlice(null);
          onCardHoverEnd?.();
        }}
      >
        <article
          className={`${cardClassName} ${onExpand ? "cursor-pointer" : ""}`}
          onClick={onExpand}
        >
          <h2 className="text-sm font-semibold text-foreground">
            {title}
          </h2>
          <p className="mt-3 text-sm text-muted-foreground">
            No points available for this metric.
          </p>
        </article>
      </div>
    );
  }

  const visibleNormalizedSeries = normalizedSeries.filter(
    (runSeries) => !hiddenRunIds.includes(runSeries.runId),
  );

  const xValues = visibleNormalizedSeries.flatMap((runSeries) =>
    [...runSeries.points, ...runSeries.companionPoints].map((point) => point.xValue),
  );
  const yValues = visibleNormalizedSeries.flatMap((runSeries) =>
    [...runSeries.points, ...runSeries.companionPoints].map((point) => point.yValue),
  );

  const xMin = 0;
  const xMax = roundToHundredth(Math.max(...xValues, 0));
  const yMinRaw = yValues.length > 0 ? Math.min(...yValues) : 0;
  const yMaxRaw = yValues.length > 0 ? Math.max(...yValues) : 0;
  const yPadding = Math.max((yMaxRaw - yMinRaw) * 0.12, 0.001);
  const throughputAxisCeiling =
    throughputAxisMaxMbps === null || throughputAxisMaxMbps === undefined
      ? null
      : Math.max(throughputAxisMaxMbps, 0.001);
  const yScale =
    metricId === "mbps" && throughputAxisCeiling !== null
      ? {
          min: 0,
          max: throughputAxisCeiling,
          ticks: buildFixedRangeTicks(throughputAxisCeiling),
        }
      : buildNiceYTicks(0, Math.max(yMaxRaw + yPadding, 0.001));
  const yMin = yScale.min;
  const yMax = yScale.max;
  const yTicks = yScale.ticks;
  const xTicks = buildReferenceXTicks(xMax, X_AXIS_REFERENCE_POINT_COUNT);
  const xDenominator = xMax === xMin ? 1 : xMax - xMin;
  const yDenominator = yMax - yMin;

  const seriesForRender = visibleNormalizedSeries.map((runSeries) => {
    const toSvgPoints = (points: Array<{ xValue: number; yValue: number }>) =>
      points.map((point) => {
        const boundedXValue = Math.max(xMin, Math.min(xMax, point.xValue));
        const boundedYValue = Math.max(yMin, Math.min(yMax, point.yValue));
        return {
          xValue: point.xValue,
          yValue: point.yValue,
          x: leftPadding + ((boundedXValue - xMin) / xDenominator) * plotWidth,
          y:
            chartHeight -
            bottomPadding -
            ((boundedYValue - yMin) / yDenominator) * plotHeight,
        };
      });

    const buildPath = (
      points: Array<{ x: number; y: number }>,
    ) =>
      points
        .map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`)
        .join(" ");

    const svgPoints = toSvgPoints(runSeries.points);
    const companionSvgPoints = toSvgPoints(runSeries.companionPoints);
    const companionPointLookup = new Map(
      companionSvgPoints.map((point) => [point.xValue, point]),
    );
    const companionPointsByPrimaryX = svgPoints.flatMap((point) => {
      const directPoint = companionPointLookup.get(point.xValue);
      if (directPoint) {
        return [directPoint];
      }

      const nearestPoint = getNearestPointByXValue(
        companionSvgPoints,
        point.xValue,
      );
      return nearestPoint ? [nearestPoint] : [];
    });
    const path = buildPath(svgPoints);
    const companionPath = buildPath(companionSvgPoints);

    return {
      ...runSeries,
      svgPoints,
      companionSvgPoints,
      companionPointsByPrimaryX,
      path,
      companionPath,
    };
  });
  const throughputSumForLegend =
    metricId === "mbps"
      ? (() => {
          const sumByX = new Map<number, number>();
          for (const runSeries of visibleNormalizedSeries) {
            for (const point of runSeries.points) {
              const roundedX = roundToHundredth(point.xValue);
              const current = sumByX.get(roundedX) ?? 0;
              sumByX.set(roundedX, current + point.yValue);
            }
          }

          const points = Array.from(sumByX.entries())
            .map(([xValue, yValue]) => ({ xValue, yValue }))
            .sort((a, b) => a.xValue - b.xValue);

          if (points.length === 0) {
            return null;
          }

          const svgPoints = points.map((point) => {
            const boundedXValue = Math.max(xMin, Math.min(xMax, point.xValue));
            const boundedYValue = Math.max(yMin, Math.min(yMax, point.yValue));
            return {
              xValue: point.xValue,
              yValue: point.yValue,
              x: leftPadding + ((boundedXValue - xMin) / xDenominator) * plotWidth,
              y:
                chartHeight -
                bottomPadding -
                ((boundedYValue - yMin) / yDenominator) * plotHeight,
            };
          });

          const path = svgPoints
            .map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`)
            .join(" ");

          return {
            runId: THROUGHPUT_SUM_SERIES_ID,
            label: "sum Mbps",
            shortLabel: "sum Mbps",
            clientSummary: "sum Mbps",
            color: "#eab308",
            data: [] as EmulatedPerSecondStat[],
            companionPoints: [] as Array<{ xValue: number; yValue: number }>,
            svgPoints,
            companionSvgPoints: [] as Array<{
              xValue: number;
              yValue: number;
              x: number;
              y: number;
            }>,
            companionPointsByPrimaryX: [] as Array<{
              xValue: number;
              yValue: number;
              x: number;
              y: number;
            }>,
            path,
            companionPath: "",
          };
        })()
      : null;
  const interactiveSeriesForRender =
    throughputSumForLegend &&
    !hiddenRunIds.includes(THROUGHPUT_SUM_SERIES_ID)
      ? [...seriesForRender, throughputSumForLegend]
      : seriesForRender;
  const legendSeries = throughputSumForLegend
    ? [...normalizedSeries, throughputSumForLegend]
    : normalizedSeries;
  const hasVisibleSeries = interactiveSeriesForRender.length > 0;

  const chartClassName = isExpanded
    ? "h-[min(58dvh,34rem)] min-h-[16rem] w-full touch-pan-y overflow-visible rounded-lg bg-card text-muted-foreground sm:h-[min(64dvh,38rem)]"
    : "h-48 w-full touch-pan-y overflow-visible rounded-lg bg-card text-muted-foreground sm:h-56";
  const axisTickTextClass = isExpanded
    ? "fill-slate-500 text-[16px] font-medium dark:fill-slate-300"
    : "fill-slate-500 text-[11px] dark:fill-slate-400";
  const axisLabelTextClass = isExpanded
    ? "fill-slate-600 text-[18px] font-medium dark:fill-slate-300"
    : "fill-slate-500 text-[11px] dark:fill-slate-400";
  const hoverActivationRadius = 10;
  const hoverTargetPointRadius = isExpanded ? 14 : 10;
  const pointDotRadius = isExpanded ? 2.8 : 2.2;
  const pointHitRadius = hoverActivationRadius;
  const pointCalloutWidth = isCwndMetric
    ? isExpanded
      ? 340
      : 220
    : isExpanded
      ? 280
      : 180;
  const pointCalloutHeight = isCwndMetric
    ? isExpanded
      ? 68
      : 60
    : isExpanded
      ? 50
      : 44;
  const pointCalloutGapFromXAxis = isExpanded ? 8 : 6;
  const selectedPointRingRadius = isExpanded ? 9 : 7;
  const sliceTooltipWidth = isCwndMetric
    ? isExpanded
      ? 380
      : 320
    : isExpanded
      ? 260
      : 220;
  const sliceTooltipPaddingX = isExpanded ? 10 : 8;
  const sliceTooltipRowHeight = isExpanded ? 15 : 13;

  const toHoveredPoint = (
    runSeries: (typeof interactiveSeriesForRender)[number],
    point: {
      xValue: number;
      yValue: number;
      x: number;
      y: number;
    },
  ): HoveredChartPoint => ({
    runId: runSeries.runId,
    runSummary: runSeries.clientSummary,
    color: runSeries.color,
    x: point.x,
    y: point.y,
    xValue: point.xValue,
    yValue: point.yValue,
    companionYValue:
      getNearestPointByXValue(runSeries.companionSvgPoints, point.xValue)?.yValue ??
      null,
  });

  const setHoveredPointForRun = (
    runSeries: (typeof interactiveSeriesForRender)[number],
    point: {
      xValue: number;
      yValue: number;
      x: number;
      y: number;
    },
  ) => {
    setHoveredPoint((current) => {
      if (
        current?.runId === runSeries.runId &&
        current.xValue === point.xValue &&
        current.yValue === point.yValue
      ) {
        return current;
      }
      return toHoveredPoint(runSeries, point);
    });
  };

  const getSvgPositionFromMouse = (
    clientX: number,
    clientY: number,
    svgElement: SVGSVGElement,
  ) => {
    const ctm = svgElement.getScreenCTM();
    if (!ctm) {
      return null;
    }

    const svgPoint = svgElement.createSVGPoint();
    svgPoint.x = clientX;
    svgPoint.y = clientY;

    const transformedPoint = svgPoint.matrixTransform(ctm.inverse());
    if (
      !Number.isFinite(transformedPoint.x) ||
      !Number.isFinite(transformedPoint.y)
    ) {
      return null;
    }

    if (
      transformedPoint.x < 0 ||
      transformedPoint.x > chartWidth ||
      transformedPoint.y < 0 ||
      transformedPoint.y > chartHeight
    ) {
      return null;
    }

    return {
      x: transformedPoint.x,
      y: transformedPoint.y,
    };
  };

  const getBoundedPlotPositionFromMouse = (
    clientX: number,
    clientY: number,
    svgElement: SVGSVGElement,
  ) => {
    const position = getSvgPositionFromMouse(clientX, clientY, svgElement);
    if (!position) {
      return null;
    }

    const minX = leftPadding;
    const maxX = chartWidth - rightPadding;
    const minY = topPadding;
    const maxY = chartHeight - bottomPadding;

    if (
      position.x < minX ||
      position.x > maxX ||
      position.y < minY ||
      position.y > maxY
    ) {
      return null;
    }

    return {
      x: Math.max(minX, Math.min(maxX, position.x)),
      y: Math.max(minY, Math.min(maxY, position.y)),
    };
  };

  const getHoveredSliceAtPosition = (
    boundedPosition: { x: number },
  ): HoveredSlice | null => {
    if (interactiveSeriesForRender.length === 0) {
      return null;
    }

    const boundedX = boundedPosition.x;
    const minX = leftPadding;
    const xValue = xMin + ((boundedX - minX) / Math.max(plotWidth, 1)) * xDenominator;
    const values: HoveredSliceValue[] = interactiveSeriesForRender.map(
      (runSeries) => {
      const nearestPoint = runSeries.svgPoints.reduce((closest, point) =>
        Math.abs(point.xValue - xValue) < Math.abs(closest.xValue - xValue)
          ? point
          : closest,
      );
      return {
        runId: runSeries.runId,
        shortLabel: runSeries.shortLabel,
        color: runSeries.color,
        yValue: nearestPoint.yValue,
        companionYValue:
          getNearestPointByXValue(runSeries.companionSvgPoints, nearestPoint.xValue)
            ?.yValue ?? null,
        pointX: nearestPoint.x,
        pointY: nearestPoint.y,
      };
      },
    );

    return {
      x: boundedX,
      xValue,
      values,
    };
  };
  const toggleRunVisibility = (runId: number) => {
    const isCurrentlyHidden = hiddenRunIds.includes(runId);

    if (!isCurrentlyHidden) {
      if (hoveredRunId === runId) {
        setHoveredRunId(null);
        setHoveredPoint(null);
      }

      if (pinnedRunId === runId) {
        setPinnedRunId(null);
        setPinnedPoint(null);
        setHoveredRunId(null);
        setHoveredPoint(null);
        setHoveredSlice(null);
      }
    }

    setHiddenRunIds((current) =>
      current.includes(runId)
        ? current.filter((currentRunId) => currentRunId !== runId)
        : [...current, runId],
    );
  };
  const crosshairX = hoveredSlice?.x ?? hoveredCursorX ?? null;
  const sliceTooltipHeight = hoveredSlice
    ? 26 +
      hoveredSlice.values.length * sliceTooltipRowHeight +
      2
    : 0;

  const chartSvg = (
    <svg
      viewBox={`0 0 ${chartWidth} ${chartHeight}`}
      className={chartClassName}
      role="img"
      aria-label={`${title} over time`}
      onMouseMove={(event) => {
        if (!areInlineChartInteractionsEnabled) {
          return;
        }
        const boundedPosition = getBoundedPlotPositionFromMouse(
          event.clientX,
          event.clientY,
          event.currentTarget,
        );
        if (!boundedPosition) {
          setHoveredSlice(null);
          setHoveredCursorX(null);
          return;
        }
        setHoveredCursorX(boundedPosition.x);
        const nextSlice = getHoveredSliceAtPosition(boundedPosition);
        setHoveredSlice(nextSlice);
      }}
      onMouseLeave={() => {
        if (!areInlineChartInteractionsEnabled) {
          return;
        }
        setHoveredSlice(null);
        setHoveredCursorX(null);
      }}
    >
      {xTicks.map((tick) => {
        const x = leftPadding + ((tick - xMin) / xDenominator) * plotWidth;
        const labelY =
          chartHeight - bottomPadding + (isExpanded ? 19 : 14);
        return (
          <g key={`x-${tick}`}>
            <line
              x1={x}
              x2={x}
              y1={topPadding}
              y2={chartHeight - bottomPadding}
              stroke="currentColor"
              strokeDasharray="3 5"
              strokeWidth={0.9}
              opacity={0.45}
            />
            <line
              x1={x}
              x2={x}
              y1={chartHeight - bottomPadding}
              y2={chartHeight - bottomPadding + 4}
              stroke="currentColor"
              strokeWidth={1}
            />
            <text
              x={x}
              y={labelY}
              transform={`rotate(-45 ${x} ${labelY})`}
              textAnchor="end"
              className={axisTickTextClass}
            >
              {formatSecondsValue(tick)}
            </text>
          </g>
        );
      })}
      {yTicks.map((tick) => {
        const y =
          chartHeight -
          bottomPadding -
          ((tick - yMin) / yDenominator) * plotHeight;
        return (
          <g key={`y-${tick}`}>
            <line
              x1={leftPadding}
              x2={chartWidth - rightPadding}
              y1={y}
              y2={y}
              stroke="currentColor"
              strokeDasharray="4 4"
              strokeWidth={1}
            />
            <line
              x1={leftPadding - 4}
              x2={leftPadding}
              y1={y}
              y2={y}
              stroke="currentColor"
              strokeWidth={1}
            />
            <text
              x={leftPadding - (isExpanded ? 12 : 7)}
              y={y + 3}
              textAnchor="end"
              className={axisTickTextClass}
            >
              {formatScaleValue(tick)}
            </text>
          </g>
        );
      })}
      <line
        x1={leftPadding}
        x2={leftPadding}
        y1={topPadding}
        y2={chartHeight - bottomPadding}
        stroke="currentColor"
        strokeWidth={1}
      />
      <line
        x1={leftPadding}
        x2={chartWidth - rightPadding}
        y1={chartHeight - bottomPadding}
        y2={chartHeight - bottomPadding}
        stroke="currentColor"
        strokeWidth={1}
      />
      {!hasVisibleSeries ? (
        <text
          x={leftPadding + plotWidth / 2}
          y={topPadding + plotHeight / 2}
          textAnchor="middle"
          className={isExpanded ? "fill-slate-500 text-[12px]" : "fill-slate-500 text-[11px]"}
        >
          All series hidden. Use the legend to show them again.
        </text>
      ) : null}
          {interactiveSeriesForRender.map((runSeries) => (
        <g key={runSeries.runId}>
          {isCwndMetric && runSeries.companionSvgPoints.length >= 2 ? (
            <path
              d={runSeries.companionPath}
              fill="none"
              stroke={runSeries.color}
              pointerEvents="none"
              strokeWidth={activeRunId === runSeries.runId ? 2.4 : 1.8}
              strokeDasharray={isExpanded ? "9 7" : "7 5"}
              strokeLinecap="round"
              opacity={
                activeRunId === null || activeRunId === runSeries.runId ? 0.72 : 0.2
              }
              style={{
                transition: "stroke-width 140ms ease, opacity 140ms ease",
              }}
            />
          ) : null}
          {runSeries.svgPoints.length >= 2 ? (
            <>
              <path
                d={runSeries.path}
                fill="none"
                stroke={runSeries.color}
                pointerEvents="none"
                strokeWidth={
                  activeRunId === runSeries.runId
                    ? runSeries.runId === THROUGHPUT_SUM_SERIES_ID
                      ? 4.2
                      : 3.8
                    : activeRunId === null
                      ? runSeries.runId === THROUGHPUT_SUM_SERIES_ID
                        ? 2.8
                        : 2.2
                      : 1.6
                }
                strokeLinecap="round"
                opacity={
                  activeRunId === null || activeRunId === runSeries.runId
                    ? 1
                    : 0.28
                }
                style={{
                  transition: "stroke-width 140ms ease, opacity 140ms ease",
                  filter:
                    activeRunId === runSeries.runId
                      ? "drop-shadow(0 0 4px rgba(15, 23, 42, 0.24))"
                      : "none",
                }}
              />
            </>
          ) : null}
          {(
            <>
              {runSeries.svgPoints.map((point, index) => (
                <circle
                  key={`dot-${runSeries.runId}-${point.xValue}-${index}`}
                  cx={point.x}
                  cy={point.y}
                  r={pointDotRadius}
                  fill={runSeries.color}
                  pointerEvents="none"
                  opacity={activeRunId === runSeries.runId ? 0.95 : 0}
                  style={{
                    transition: "opacity 120ms ease",
                  }}
                />
              ))}
              {runSeries.svgPoints.map((point, index) => (
                <circle
                  key={`hit-${runSeries.runId}-${point.xValue}-${index}`}
                  cx={point.x}
                  cy={point.y}
                  r={pointHitRadius}
                  fill="transparent"
                  pointerEvents={areInlineChartInteractionsEnabled ? "all" : "none"}
                  onMouseEnter={areInlineChartInteractionsEnabled ? (event) => {
                    event.stopPropagation();
                    setHoveredSlice(null);
                    setHoveredCursorX(null);
                    if (pinnedRunId !== null) {
                      if (pinnedRunId === runSeries.runId) {
                        const pinned = toHoveredPoint(runSeries, point);
                        setPinnedPoint(pinned);
                        setHoveredRunId(runSeries.runId);
                        setHoveredPoint(pinned);
                      }
                      return;
                    }
                    setHoveredRunId(runSeries.runId);
                    setHoveredPointForRun(runSeries, point);
                  } : undefined}
                  onMouseMove={areInlineChartInteractionsEnabled ? (event) => {
                    event.stopPropagation();
                    setHoveredSlice(null);
                    setHoveredCursorX(null);
                    if (pinnedRunId !== null) {
                      if (pinnedRunId === runSeries.runId) {
                        const pinned = toHoveredPoint(runSeries, point);
                        setPinnedPoint(pinned);
                        setHoveredRunId(runSeries.runId);
                        setHoveredPoint(pinned);
                      }
                      return;
                    }
                    setHoveredRunId(runSeries.runId);
                    setHoveredPointForRun(runSeries, point);
                  } : undefined}
                  onMouseLeave={areInlineChartInteractionsEnabled ? (event) => {
                    event.stopPropagation();
                    setHoveredRunId(null);
                    setHoveredPoint(null);
                  } : undefined}
                  onClick={areInlineChartInteractionsEnabled ? (event) => {
                    event.stopPropagation();
                    if (pinnedRunId !== null) {
                      return;
                    }
                    const pinned = toHoveredPoint(runSeries, point);
                    setPinnedRunId(runSeries.runId);
                    setPinnedPoint(pinned);
                    setHoveredRunId(runSeries.runId);
                    setHoveredPoint(pinned);
                    setHoveredSlice(null);
                    setHoveredCursorX(null);
                  } : undefined}
                />
              ))}
            </>
          )}
          {displayedPoint && displayedPoint.runId === runSeries.runId ? (
            <>
              {isCwndMetric && displayedPoint.companionYValue !== null ? (() => {
                const companionPoint = getNearestPointByXValue(
                  runSeries.companionPointsByPrimaryX,
                  displayedPoint.xValue,
                );

                if (!companionPoint) {
                  return null;
                }

                return (
                  <circle
                    cx={companionPoint.x}
                    cy={companionPoint.y}
                    r={4.6}
                    fill="var(--card)"
                    stroke={runSeries.color}
                    strokeWidth={1.8}
                    pointerEvents="none"
                    opacity={0.95}
                  />
                );
              })() : null}
              <circle
                cx={displayedPoint.x}
                cy={displayedPoint.y}
                r={hoverTargetPointRadius}
                fill="transparent"
                pointerEvents="none"
              />
              <circle
                cx={displayedPoint.x}
                cy={displayedPoint.y}
                r={selectedPointRingRadius}
                fill="rgba(255, 250, 253, 0.82)"
                stroke={runSeries.color}
                strokeWidth={2.2}
                pointerEvents="none"
                opacity={1}
                style={{
                  transition: "r 120ms ease",
                }}
              />
              <circle
                cx={displayedPoint.x}
                cy={displayedPoint.y}
                r={4.4}
                fill={runSeries.color}
                pointerEvents="none"
                opacity={1}
                style={{
                  transition: "r 120ms ease",
                }}
              />
            </>
          ) : null}
        </g>
      ))}
      {areInlineChartInteractionsEnabled && crosshairX !== null ? (
        <g pointerEvents="none">
          <line
            x1={crosshairX}
            x2={crosshairX}
            y1={topPadding}
            y2={chartHeight - bottomPadding}
            stroke="#64748b"
            strokeWidth={1.2}
            strokeDasharray="4 4"
            opacity={0.55}
          />
          {hoveredSlice
            ? (() => {
                let tooltipX = crosshairX + 12;
                if (tooltipX + sliceTooltipWidth > chartWidth - rightPadding) {
                  tooltipX = crosshairX - sliceTooltipWidth - 12;
                }
                tooltipX = Math.max(
                  leftPadding + 4,
                  Math.min(
                    chartWidth - rightPadding - sliceTooltipWidth - 2,
                    tooltipX,
                  ),
                );

                let tooltipY = topPadding + 8;
                if (
                  tooltipY + sliceTooltipHeight >
                  chartHeight - bottomPadding - 4
                ) {
                  tooltipY = chartHeight - bottomPadding - sliceTooltipHeight - 4;
                }
                tooltipY = Math.max(topPadding + 4, tooltipY);

                const headerY = tooltipY + (15);
                const firstRowY = tooltipY + (30);

                return (
                  <>
                    <rect
                      x={tooltipX}
                      y={tooltipY}
                      width={sliceTooltipWidth}
                      height={sliceTooltipHeight}
                      rx={8}
                      fill="rgba(255, 250, 253, 0.96)"
                      stroke="#64748b"
                      strokeWidth={1.2}
                    />
                    <text
                      x={tooltipX + sliceTooltipPaddingX}
                      y={headerY}
                      className={
                        "fill-slate-900 text-[11px]"
                      }
                      fontWeight={700}
                    >
                      x (seconds): {formatSecondsValue(hoveredSlice.xValue)}
                    </text>
                    {hoveredSlice.values.map((value, index) => {
                      const rowY = firstRowY + index * sliceTooltipRowHeight;
                      return (
                        <g
                          key={`slice-value-${value.runId}`}
                          transform={`translate(${tooltipX + sliceTooltipPaddingX}, ${rowY})`}
                        >
                          <circle cx={4} cy={-4} r={2.6} fill={value.color} />
                          <text
                            x={10}
                            y={0}
                            className={
                              "fill-slate-700 text-[11px]"
                            }
                          >
                            {isCwndMetric
                              ? `${value.shortLabel}: cwnd ${formatScaleValue(value.yValue)} ${unit}, in-flight ${
                                  value.companionYValue === null
                                    ? "n/a"
                                    : `${formatScaleValue(value.companionYValue)} ${unit}`
                                }`
                              : `${value.shortLabel}: ${formatScaleValue(value.yValue)} ${unit}`}
                          </text>
                        </g>
                      );
                    })}
                  </>
                );
              })()
            : null}
        </g>
      ) : null}
      {areInlineChartInteractionsEnabled && displayedPoint ? (() => {
        const plotBottomY = chartHeight - bottomPadding;
        const calloutY = plotBottomY - pointCalloutHeight - pointCalloutGapFromXAxis;
        const calloutX = Math.max(
          leftPadding + 4,
          Math.min(
            chartWidth - rightPadding - pointCalloutWidth - 2,
            displayedPoint.x - pointCalloutWidth / 2,
          ),
        );
        const lineBottomY = calloutY;
        const connectorColor = displayedPoint.color;

        return (
          <g pointerEvents="none">
            <line
              x1={displayedPoint.x}
              x2={displayedPoint.x}
              y1={displayedPoint.y + selectedPointRingRadius}
              y2={lineBottomY}
              stroke={connectorColor}
              strokeWidth={1.4}
              strokeDasharray="5 5"
              opacity={0.72}
            />
            <circle
              cx={displayedPoint.x}
              cy={displayedPoint.y}
              r={selectedPointRingRadius + 2.5}
              fill="none"
              stroke={connectorColor}
              strokeWidth={1}
              opacity={0.34}
            />
            <rect
              x={calloutX}
              y={calloutY}
              width={pointCalloutWidth}
              height={pointCalloutHeight}
              rx={7}
              fill="rgba(255, 250, 253, 0.98)"
              stroke={connectorColor}
              strokeWidth={1.4}
            />
            <line
              x1={displayedPoint.x}
              x2={Math.max(calloutX, Math.min(calloutX + pointCalloutWidth, displayedPoint.x))}
              y1={calloutY}
              y2={calloutY}
              stroke={connectorColor}
              strokeWidth={1.4}
              opacity={0.72}
            />
            <text
              x={calloutX + 10}
              y={calloutY + (15)}
              className={"fill-slate-900 text-[11px]"}
              fontWeight={700}
            >
              {displayedPoint.runSummary}
            </text>
            <text
              x={calloutX + 10}
              y={calloutY + (31)}
              className={"fill-slate-700 text-[11px]"}
            >
              {isCwndMetric
                ? `cwnd (${unit}): ${formatScaleValue(displayedPoint.yValue)}`
                : `y (${unit}): ${formatScaleValue(displayedPoint.yValue)}`}
            </text>
            <text
              x={calloutX + 10}
              y={calloutY + (43)}
              className={"fill-slate-700 text-[11px]"}
            >
              {isCwndMetric
                ? `in-flight (${unit}): ${
                    displayedPoint.companionYValue === null
                      ? "n/a"
                      : formatScaleValue(displayedPoint.companionYValue)
                  }`
                : `x (seconds): ${formatSecondsValue(displayedPoint.xValue)}`}
            </text>
            {isCwndMetric ? (
              <text
                x={calloutX + 10}
                y={calloutY + (55)}
                className={"fill-slate-700 text-[11px]"}
              >
                x (seconds): {formatSecondsValue(displayedPoint.xValue)}
              </text>
            ) : null}
          </g>
        );
      })() : null}
      <text
        x={leftPadding + plotWidth / 2}
        y={isExpanded ? chartHeight - 44 : chartHeight - 4}
        textAnchor="middle"
        className={axisLabelTextClass}
      >
        elapsed seconds
      </text>
      <text
        x={14}
        y={topPadding + plotHeight / 2}
        transform={`rotate(-90 14 ${topPadding + plotHeight / 2})`}
        textAnchor="middle"
        className={axisLabelTextClass}
      >
        {unit}
      </text>
    </svg>
  );

  return (
    <div
      className={cardShellClassName}
      onMouseEnter={() => onCardHoverStart?.()}
      onMouseLeave={() => {
        setHoveredRunId(null);
        setHoveredPoint(null);
        setHoveredSlice(null);
        onCardHoverEnd?.();
      }}
    >
        <article
          className={`${cardClassName} ${onExpand ? "cursor-pointer" : ""}`}
          onClick={onExpand}
        >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-sm font-semibold text-foreground">
            {title}
          </h2>
          {onExpand ? (
            <span className="hidden text-xs text-muted-foreground sm:inline">
              Click chart to enlarge
            </span>
          ) : null}
        </div>
        <div
          className={
            onExpand
              ? "mt-3 touch-pan-y rounded-lg"
              : "mt-3"
          }
        >
          {onExpand ? (
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={onExpand}
              className="h-auto whitespace-normal block w-full touch-pan-y cursor-pointer rounded-lg p-0 text-left outline-none hover:bg-transparent focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`Expand ${title} chart`}
            >
              {chartSvg}
            </Button>
          ) : (
            chartSvg
          )}
        </div>
        {isCwndMetric ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Solid line shows cwnd. Dashed line shows in-flight packets for the
            same client.
          </p>
        ) : null}
        <div className="mt-3 flex min-w-0 flex-wrap gap-2">
          {legendSeries.map((runSeries) => {
            const isHidden = hiddenRunIds.includes(runSeries.runId);
            const isActive = !isHidden && (
              activeRunId === null || activeRunId === runSeries.runId
            );

            return (
            <Button
              variant="ghost"
              size="sm"
              key={runSeries.runId}
              type="button"
              aria-pressed={!isHidden}
              className={`h-auto whitespace-normal group max-w-full rounded-lg border bg-card px-2.5 py-1 text-left text-xs text-foreground transition-[border-color,box-shadow,opacity] ${
                isHidden
                  ? "border-border opacity-45"
                  : isActive
                    ? "cursor-pointer border-border hover:border-border "
                    : "cursor-pointer border-border opacity-60"
              }`}
              title={runSeries.label}
              onClick={(event) => {
                event.stopPropagation();
                toggleRunVisibility(runSeries.runId);
              }}
              onMouseEnter={() => {
                if (isHidden) {
                  return;
                }
                if (pinnedRunId !== null) {
                  return;
                }
                setHoveredRunId(runSeries.runId);
                setHoveredPoint(null);
              }}
              onMouseLeave={() => {
                if (isHidden) {
                  return;
                }
                if (pinnedRunId !== null) {
                  return;
                }
                setHoveredRunId(null);
                setHoveredPoint(null);
              }}
              onDoubleClick={(event) => {
                event.stopPropagation();
                if (isHidden) {
                  return;
                }
                if (pinnedRunId !== null) {
                  return;
                }
                setPinnedRunId(runSeries.runId);
                setPinnedPoint(null);
                setHoveredRunId(runSeries.runId);
                setHoveredPoint(null);
              }}
            >
              <span
                className={`mr-1.5 inline-block h-2 w-2 rounded-full align-middle transition-transform duration-150 ${
                  !isHidden && activeRunId === runSeries.runId
                    ? "scale-150 shadow-[0_0_0_3px_rgba(15,23,42,0.08)] dark:shadow-[0_0_0_3px_rgba(148,163,184,0.22)]"
                    : isHidden
                      ? ""
                      : "group-hover:scale-150 group-hover:shadow-[0_0_0_3px_rgba(15,23,42,0.08)] dark:group-hover:shadow-[0_0_0_3px_rgba(148,163,184,0.22)]"
                }`}
                style={{ backgroundColor: runSeries.color }}
              />
              <span className={`break-words ${isHidden ? "line-through" : ""}`}>
              {runSeries.shortLabel}
              </span>
            </Button>
            );
          })}
        </div>
      </article>
    </div>
  );
}
