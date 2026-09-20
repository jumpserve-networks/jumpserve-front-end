import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/app/components/ui/card";
import type { TestModule } from "@/lib/test-modules";

export function LandingPageShell({ module }: { module: TestModule }) {
  return (
    <main className="space-atmosphere relative min-h-[var(--page-height)] px-5 py-10 sm:px-10 sm:py-16">
      <div className="relative z-10 mx-auto max-w-5xl">
        <p className="text-sm font-semibold tracking-widest text-primary uppercase">Test module</p>
        <h1 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          {module.name}
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-foreground/80">{module.description}</p>
        <nav aria-label={`${module.name} tools`} className="mt-8 grid gap-5 sm:grid-cols-2">
          {module.sections.map((section) => (
            <Card key={section.href} className="gap-4 rounded-2xl bg-card/95 shadow-lg shadow-black/5">
              <CardHeader><h2 className="text-xl font-semibold">{section.label}</h2></CardHeader>
              <CardContent className="flex-1">
                <p className="text-sm leading-6 text-muted-foreground">{section.description}</p>
              </CardContent>
              <CardFooter>
                <Button variant="outline" nativeButton={false} render={<Link href={section.href} />}>
                  {section.label}<ArrowRight aria-hidden="true" />
                </Button>
              </CardFooter>
            </Card>
          ))}
        </nav>
      </div>
    </main>
  );
}
