export const EMULATED_MODULE_PATH = "/module/congestion-control-emulated";
export const REAL_WORLD_MODULE_PATH = "/module/congestion-control-real-world";
export const DELAY_STUDY_MODULE_PATH = "/module/propagation-delay-study";

// Keep saved links and old bookmarks usable after moving module pages.
export const LEGACY_MODULE_ROUTES = [
  ...["test-lookup", "parent-run", "aggregate-graphs", "benchmarks", "chat", "api/parent-runs"].map((path) => ({
    source: `/${path}`, destination: `${EMULATED_MODULE_PATH}/${path}`,
  })),
  { source: "/real-world", destination: `${REAL_WORLD_MODULE_PATH}/run-a-test` },
  { source: `${REAL_WORLD_MODULE_PATH}/real-world`, destination: `${REAL_WORLD_MODULE_PATH}/run-a-test` },
  { source: "/real-world-reports", destination: `${REAL_WORLD_MODULE_PATH}/test-results` },
  { source: `${REAL_WORLD_MODULE_PATH}/real-world-reports`, destination: `${REAL_WORLD_MODULE_PATH}/test-results` },
  { source: "/modules/congestion-control-emulated", destination: EMULATED_MODULE_PATH },
  { source: "/modules/congestion-control-real-world", destination: REAL_WORLD_MODULE_PATH },
  { source: "/modules/propagation-delay-study", destination: DELAY_STUDY_MODULE_PATH },
];

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
  href: EMULATED_MODULE_PATH,
  sections: [
    {
      href: `${EMULATED_MODULE_PATH}/test-lookup`,
      label: "Test Lookup",
      description: "Search individual tests and inspect their run details.",
      paths: [`${EMULATED_MODULE_PATH}/test-lookup`, `${EMULATED_MODULE_PATH}/parent-run`],
    },
    {
      href: `${EMULATED_MODULE_PATH}/aggregate-graphs`,
      label: "Aggregate Graphs",
      description: "Compare emulation metrics across groups of runs.",
      paths: [`${EMULATED_MODULE_PATH}/aggregate-graphs`],
    },
    {
      href: `${EMULATED_MODULE_PATH}/benchmarks`,
      label: "Run Benchmark",
      description: "Configure workloads, network conditions, and congestion control algorithms.",
      paths: [`${EMULATED_MODULE_PATH}/benchmarks`],
    },
    {
      href: `${EMULATED_MODULE_PATH}/chat`,
      label: "Chat with AI",
      description: "Query experiment results and discuss congestion control behavior.",
      paths: [`${EMULATED_MODULE_PATH}/chat`],
    },
  ],
} as const satisfies TestModule;

export const TEST_MODULES: readonly TestModule[] = [
  EMULATED_TESTS_MODULE,
  {
    id: "propagation-delay-study",
    name: "Propagation Delay Study",
    description: "Assess the NINeS 2026 delay-equalization paper using balanced experiments, matched repetitions, and recorded evidence.",
    status: "available",
    href: DELAY_STUDY_MODULE_PATH,
    sections: [
      { href: `${DELAY_STUDY_MODULE_PATH}/test-results`, label: "Test Results", description: "Inspect delay sensitivity, confidence intervals, and throughput across matched configurations.", paths: [`${DELAY_STUDY_MODULE_PATH}/test-results`] },
      { href: `${DELAY_STUDY_MODULE_PATH}/methods`, label: "Methods & Claims", description: "Read the frozen protocol and the scope of each replication claim.", paths: [`${DELAY_STUDY_MODULE_PATH}/methods`] },
      { href: `${DELAY_STUDY_MODULE_PATH}/literature`, label: "Literature", description: "Review the paper's bibliography, source versions, and reading status.", paths: [`${DELAY_STUDY_MODULE_PATH}/literature`] },
    ],
  },
  {
    id: "congestion-control-real-world",
    name: "Congestion Control Real World Tests",
    description:
      "Measure congestion control across AWS network paths using a server, a shared bottleneck, and independently placed receivers.",
    status: "available",
    href: REAL_WORLD_MODULE_PATH,
    sections: [
      { href: `${REAL_WORLD_MODULE_PATH}/run-a-test`, label: "Run a Test", description: "Launch EC2 tests, choose machine locations, and inspect results.", paths: [`${REAL_WORLD_MODULE_PATH}/run-a-test`] },
      { href: `${REAL_WORLD_MODULE_PATH}/test-results`, label: "Test Results", description: "Explore shared measurements and compare matched configurations with replication counts and confidence intervals.", paths: [`${REAL_WORLD_MODULE_PATH}/test-results`] },
      { href: `${REAL_WORLD_MODULE_PATH}/chat`, label: "Chat with AI", description: "Ask about recorded EC2 test results, measurement quality, and matched comparisons.", paths: [`${REAL_WORLD_MODULE_PATH}/chat`] },
    ],
  },
];

export function getTestModule(id: string) {
  return TEST_MODULES.find((module) => module.id === id);
}

export function isModuleSectionActive(section: TestModuleSection, pathname: string) {
  return section.paths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

// Resolve legacy next destinations as well as canonical module routes.
export function getTestModuleForPath(path: string) {
  if (!path.startsWith("/") || path.startsWith("//") || /[\\\s]/.test(path)) return undefined;
  let pathname = path.split(/[?#]/, 1)[0];
  const legacy = LEGACY_MODULE_ROUTES.find(({ source }) => pathname === source || pathname.startsWith(`${source}/`));
  if (legacy) pathname = legacy.destination + pathname.slice(legacy.source.length);
  return TEST_MODULES.find(
    (module) => module.status === "available" && (
      pathname === module.href ||
      pathname.startsWith(`${module.href}/`) ||
      module.sections.some((section) => isModuleSectionActive(section, pathname))
    ),
  );
}
