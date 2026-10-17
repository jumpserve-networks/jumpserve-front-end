import { IPv6Header } from "@/app/components/ipv6-study/header";
import { IPv6Dashboard } from "@/app/components/ipv6-study/dashboard";
import { getIPv6Data } from "@/lib/ipv6-study-server";
export const dynamic = "force-dynamic";
export default async function Results() {
 const data = await getIPv6Data();
 return <main className="mx-auto max-w-7xl px-4 py-6"><IPv6Header title="DNS over IPv6: results and evidence limits" description="Assessment of ‘How I learned to stop worrying and love IPv6’. Historical archive reanalysis, released-code controls and explicit claim coverage." />{data ? <IPv6Dashboard data={data} /> : <p role="status">Study data is unavailable. Missing observations have not been replaced with zero.</p>}</main>;
}
