import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/app/components/ui/card";
import type { TestModule } from "@/lib/test-modules";

export function LandingPageShell({ module }: { module: TestModule }) {
  return (
    <main className="min-h-[var(--page-height)] bg-background px-5 py-10 sm:px-10 sm:py-14">
      <div className="mx-auto max-w-5xl">
        <p className="text-sm font-medium text-muted-foreground">Test module</p>
        <h1 className="mt-2 max-w-3xl text-3xl font-semibold tracking-tight text-foreground">
          {module.name}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{module.description}</p>
        <nav aria-label={`${module.name} tools`} className="mt-8 grid gap-4 sm:grid-cols-2">
          {module.sections.map((section) => (
            <Card key={section.href} className="gap-3">
              <CardHeader><h2 className="text-base font-semibold">{section.label}</h2></CardHeader>
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
