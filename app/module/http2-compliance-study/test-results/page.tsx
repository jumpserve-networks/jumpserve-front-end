import { Http2Header } from "@/app/components/http2-study/header";
import { Http2Dashboard } from "@/app/components/http2-study/dashboard";
import { getHttp2Data } from "@/lib/http2-study-server";
export const dynamic = "force-dynamic";
export default async function Results() {
  const data = await getHttp2Data();
  return <main className="mx-auto max-w-7xl px-4 py-6"><Http2Header title="HTTP/2 results and discrepancies" description="The Developer, the RFC, and the Middlebox (IMC 2025): published counts, archived measurements, classification sensitivity, and separately recorded loopback controls." />{data ? <Http2Dashboard data={data} /> : <p>Study data is unavailable. No missing results have been replaced with zero.</p>}</main>;
}
