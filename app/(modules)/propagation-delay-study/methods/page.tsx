import type { Metadata } from "next";
import ReactMarkdown from "react-markdown";
import { StudyHeader } from "@/app/components/delay-study/header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/app/components/ui/card";
import { getStudyCampaign, getStudyClaims } from "@/lib/delay-study-server";

export const metadata: Metadata = { title: "Propagation delay study — methods and claims" };
export const dynamic = "force-dynamic";
export default async function StudyMethodsPage() {
  const [campaign, claims] = await Promise.all([getStudyCampaign(), getStudyClaims()]);
  return <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6"><StudyHeader title="Methods & claims" description="The protocol was frozen before the campaign. Each comparison preserves algorithm identity, capacity, queue, duration, and matched repetition; only the specified delay intervention changes." />
    <div className="grid gap-4 lg:grid-cols-2">{claims.map(claim => <Card key={claim.claim_id}><CardHeader><CardDescription>{claim.figure} · {claim.coverage.replaceAll("_", " ")}</CardDescription><CardTitle className="text-base leading-6">{claim.description}</CardTitle></CardHeader><CardContent className="space-y-3 text-sm"><p className="text-muted-foreground">{claim.limitation}</p>{Object.keys(claim.published_values).length > 0 && <><dl className="space-y-1">{Object.entries(claim.published_values).map(([key, value]) => <div key={key} className="flex flex-wrap justify-between gap-2"><dt>{key.replaceAll("_", " ")}</dt><dd className="font-mono">{value}</dd></div>)}</dl><p className="pt-2 text-xs text-muted-foreground">Values reported in the source paper.</p></>}</CardContent></Card>)}</div>
    {campaign && <><Card><CardHeader><CardTitle>Protocol and provenance</CardTitle><CardDescription>Campaign {campaign.id}</CardDescription></CardHeader><CardContent><dl className="space-y-3 break-all text-xs"><div><dt className="font-medium">Protocol SHA-256</dt><dd className="mt-1 font-mono text-muted-foreground">{campaign.protocol_sha256}</dd></div><div><dt className="font-medium">Schedule SHA-256</dt><dd className="mt-1 font-mono text-muted-foreground">{campaign.manifest_sha256}</dd></div><div><dt className="font-medium">Linux / BBR source commit</dt><dd className="mt-1 font-mono text-muted-foreground">{campaign.kernel_commit}</dd></div><div><dt className="font-medium">Random seed</dt><dd>{campaign.random_seed}</dd></div></dl></CardContent></Card>
      <article className="prose prose-sm max-w-none dark:prose-invert"><ReactMarkdown>{campaign.protocol}</ReactMarkdown></article>
    </>}
  </main>;
}
