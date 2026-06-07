import type { Metadata } from "next";
import { TestLookupHome } from "@/app/components/test-lookup-home";

export const metadata: Metadata = {
  title: "Test Lookup",
  description: "Browse parent runs, upload animated assets, and inspect emulation results.",
};

type TestLookupPageProps = {
  searchParams: Promise<{ page?: string | string[] }>;
};

export default async function TestLookupPage({
  searchParams,
}: TestLookupPageProps) {
  const pageParam = (await searchParams).page;
  const parsedPage = Number.parseInt(
    Array.isArray(pageParam) ? pageParam[0] : (pageParam ?? ""),
    10,
  );
  const initialPageNumber =
    Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;

  return <TestLookupHome initialPageNumber={initialPageNumber} />;
}
