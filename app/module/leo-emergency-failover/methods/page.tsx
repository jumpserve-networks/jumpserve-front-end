import { LeoHeader } from "@/app/components/leo-study/header";
import { Table } from "@/app/components/ui/table";
import { getLeoCampaign, getLeoClaims } from "@/lib/leo-study-server";
import { LEO_SATURATION_ID } from "@/lib/leo-study";
export const dynamic = "force-dynamic";
export default async function LeoMethodsPage() {
  const [campaign, claims, saturation] = await Promise.all([getLeoCampaign(), getLeoClaims(), getLeoCampaign(LEO_SATURATION_ID)]);
  return <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6"><LeoHeader title="Methods, provenance, and claim coverage" description="Numerical agreement applies to the declared model and inputs. It does not establish real-world emergency service capacity." />
    {campaign ? <div className="space-y-6">
      {saturation ? <section className="rounded-lg border p-5"><h2 className="mb-3 font-semibold">Exploratory saturation follow-up</h2><p className="text-sm text-muted-foreground">This separately frozen design followed the initial results. It preserves the first campaign and tests four larger terminal budgets; the fifteen-state summary uses two million terminals.</p><dl className="mt-3 space-y-3 text-sm">{Object.entries(saturation.protocol).filter(([,v])=>typeof v==="string").map(([key,value])=><div key={key}><dt className="font-medium capitalize">{key.replaceAll("_"," ")}</dt><dd className="mt-1 text-muted-foreground">{String(value)}</dd></div>)}</dl><p className="mt-3 break-all text-xs">Protocol SHA-256: {saturation.protocol_sha256}</p></section> : null}
      <section className="rounded-lg border p-5"><h2 className="mb-3 font-semibold">Recorded protocol</h2><dl className="space-y-3 text-sm">{Object.entries(campaign.protocol).filter(([, v]) => typeof v === "string").map(([key, value]) => <div key={key}><dt className="font-medium capitalize">{key.replaceAll("_", " ")}</dt><dd className="mt-1 text-muted-foreground">{String(value)}</dd></div>)}</dl></section>
      <section className="rounded-lg border p-5"><h2 className="mb-3 font-semibold">Artifact corrections</h2><ul className="list-disc space-y-2 pl-5 text-sm">{(campaign.protocol.corrections as string[] ?? []).map(v => <li key={v}>{v}</li>)}</ul></section>
      <section className="rounded-lg border p-5"><h2 className="mb-3 font-semibold">Limitations</h2><ul className="list-disc space-y-2 pl-5 text-sm">{campaign.limitations.map(v => <li key={v}>{v}</li>)}</ul></section>
      <section className="overflow-x-auto rounded-lg border"><Table className="w-full text-left text-sm"><caption className="p-4 text-left font-semibold">Coverage by published claim</caption><thead className="bg-muted"><tr><th className="p-3">Claim</th><th className="p-3">Coverage</th><th className="p-3">Interpretation limit</th></tr></thead><tbody>{claims.map(c => <tr key={c.claim_id} className="border-t align-top"><td className="p-3">{c.figure}: {c.description}</td><td className="p-3">{c.coverage}</td><td className="p-3 text-muted-foreground">{c.limitation}</td></tr>)}</tbody></Table></section>
      <details className="rounded-lg border p-5 text-sm"><summary className="cursor-pointer font-medium">Source hashes and execution provenance</summary><p className="mt-3 break-all">Protocol SHA-256: {campaign.protocol_sha256}</p><p className="break-all">Artifact commit: {campaign.artifact_commit}</p><pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify(campaign.provenance, null, 2)}</pre></details>
    </div> : <p>No recorded protocol is available.</p>}
  </main>;
}
