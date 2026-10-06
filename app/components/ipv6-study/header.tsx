import Link from "next/link";
import { IPV6_STUDY_MODULE_PATH as PATH } from "@/lib/test-modules";
import { Button } from "@/app/components/ui/button";
export function IPv6Header({ title, description }: { title: string; description: string }) {
 return <header className="mb-6 space-y-3"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">IPv6 DNS Study · IMC 2025</p><h1 className="text-2xl font-semibold tracking-tight">{title}</h1><p className="max-w-4xl text-sm text-muted-foreground">{description}</p><nav aria-label="IPv6 study" className="flex flex-wrap gap-2">{[["test-results", "Results"], ["methods", "Methods & claims"], ["literature", "Literature"], ["chat", "Chat with AI"]].map(([path, label]) => <Button key={path} size="sm" variant="outline" render={<Link href={`${PATH}/${path}`} />} nativeButton={false}>{label}</Button>)}<Button size="sm" variant="outline" render={<a href="/module/ipv6-dns-study/data.zip" download />} nativeButton={false}>Download data</Button></nav></header>;
}
