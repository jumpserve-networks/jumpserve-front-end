"use client";

import { SignInToRun } from "./sign-in-to-run";
import { BenchmarkForm } from "./benchmark-form";
import { BenchmarkStatus } from "./benchmark-status";
import { Card, CardContent } from "@/app/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/app/components/ui/tabs";

export function BenchmarkTabs({ userEmail }: { userEmail?: string }) {
  return (
    <Tabs defaultValue="configure" className="mt-6 gap-6">
      <TabsList variant="line" aria-label="Benchmarks" className="w-full justify-start border-b border-border">
        <TabsTrigger value="configure" className="flex-none px-5">Configure</TabsTrigger>
        <TabsTrigger value="history" className="flex-none px-5">Run History</TabsTrigger>
      </TabsList>
      <TabsContent value="configure">
        <Card>
          <CardContent>{userEmail ? <BenchmarkForm /> : <SignInToRun nextPath="/benchmarks" />}</CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="history"><BenchmarkStatus canManage={Boolean(userEmail)} /></TabsContent>
    </Tabs>
  );
}
