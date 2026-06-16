import { NextResponse } from "next/server";
import { fetchParentRunsForIndexPage } from "@/lib/emulated-runs-data";

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 30;

function parseNonNegativeInteger(value: string | null, fallback: number) {
  if (value === null) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function parseNumberList(values: string[]) {
  return values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
}

function parseStringList(values: string[]) {
  return values
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const pageNumber = Math.max(
    1,
    parseNonNegativeInteger(searchParams.get("page"), DEFAULT_PAGE),
  );
  const requestedPageSize = parseNonNegativeInteger(
    searchParams.get("pageSize"),
    DEFAULT_PAGE_SIZE,
  );
  const pageSize = Math.min(Math.max(requestedPageSize, 1), MAX_PAGE_SIZE);

  try {
    const pageData = await fetchParentRunsForIndexPage({
      page: pageNumber,
      pageSize,
      filters: {
        runSearchQuery: searchParams.get("search") ?? undefined,
        clientCounts: parseNumberList(searchParams.getAll("clientCount")),
        ccaLabels: parseStringList(searchParams.getAll("cca")),
        addedDelaysMs: parseNumberList(searchParams.getAll("addedDelayMs")),
        clientStartDelaysMs: parseNumberList(
          searchParams.getAll("clientStartDelayMs"),
        ),
        clientFileSizesMegabytes: parseNumberList(
          searchParams.getAll("clientFileSizeMb"),
        ),
        bottleneckRatesMegabit: parseNumberList(
          searchParams.getAll("bottleneckRateMbit"),
        ),
        queueBufferSizesKilobyte: parseNumberList(
          searchParams.getAll("queueBufferKbyte"),
        ),
      },
    });

    return NextResponse.json(pageData);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load parent runs.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
