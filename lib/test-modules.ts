export type TestModuleSection = {
  href: string;
  label: string;
  description: string;
  paths: readonly string[];
};

export type TestModule = {
  id: string;
  name: string;
  description: string;
  status: "available" | "coming-soon";
  href: string;
  sections: readonly TestModuleSection[];
};

export const EMULATED_TESTS_MODULE = {
  id: "congestion-control-emulated",
  name: "Congestion Control Emulated Tests",
  description:
    "Run controlled network experiments and compare congestion control algorithms, throughput, latency, and fairness.",
  status: "available",
  href: "/modules/congestion-control-emulated",
  sections: [
    {
      href: "/test-lookup",
      label: "Test Lookup",
      description: "Search individual tests and inspect their run details.",
      paths: ["/test-lookup", "/parent-run"],
    },
    {
      href: "/aggregate-graphs",
      label: "Aggregate Graphs",
      description: "Compare emulation metrics across groups of runs.",
      paths: ["/aggregate-graphs"],
    },
    {
      href: "/benchmarks",
      label: "Run Benchmark",
      description: "Configure workloads, network conditions, and congestion control algorithms.",
      paths: ["/benchmarks"],
    },
    {
      href: "/chat",
      label: "Chat with AI",
      description: "Query experiment results and discuss congestion control behavior.",
      paths: ["/chat"],
    },
  ],
} as const satisfies TestModule;

export const TEST_MODULES: readonly TestModule[] = [
  EMULATED_TESTS_MODULE,
  {
    id: "congestion-control-real-world",
    name: "Congestion Control Real World Tests",
    description:
      "Measure congestion control across AWS network paths using a server, a shared bottleneck, and independently placed receivers.",
    status: "available",
    href: "/modules/congestion-control-real-world",
    sections: [{ href: "/real-world", label: "Real World Tests", description: "Launch EC2 tests, choose machine locations, and inspect results.", paths: ["/real-world"] }],
  },
];

export function getTestModule(id: string) {
  return TEST_MODULES.find((module) => module.id === id);
}

export function isModuleSectionActive(section: TestModuleSection, pathname: string) {
  return section.paths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

// Existing tool URLs belong to the emulated module. Keep bookmarks and saved
// links working while new modules get their own routes and data sources.
export function getTestModuleForPath(path: string) {
  if (!path.startsWith("/") || path.startsWith("//") || /[\\\s]/.test(path)) return undefined;
  const pathname = path.split(/[?#]/, 1)[0];
  return TEST_MODULES.find(
    (module) => module.status === "available" && (
      pathname === module.href ||
      pathname.startsWith(`${module.href}/`) ||
      module.sections.some((section) => isModuleSectionActive(section, pathname))
    ),
  );
}
