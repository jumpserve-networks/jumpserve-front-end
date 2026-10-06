export const EMULATED_MODULE_PATH = "/module/congestion-control-emulated";
export const REAL_WORLD_MODULE_PATH = "/module/congestion-control-real-world";
export const DELAY_STUDY_MODULE_PATH = "/module/propagation-delay-study";
export const LEO_STUDY_MODULE_PATH = "/module/leo-emergency-failover";
export const HTTP2_STUDY_MODULE_PATH = "/module/http2-compliance-study";
export const IPV6_STUDY_MODULE_PATH = "/module/ipv6-dns-study";
export const RELIABLE_STUDY_MODULE_PATH = "/module/reliable-sketch-study";

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
  { source: "/modules/leo-emergency-failover", destination: LEO_STUDY_MODULE_PATH },
  { source: "/modules/http2-compliance-study", destination: HTTP2_STUDY_MODULE_PATH },
  { source: "/modules/ipv6-dns-study", destination: IPV6_STUDY_MODULE_PATH },
  { source: "/modules/reliable-sketch-study", destination: RELIABLE_STUDY_MODULE_PATH },
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
    id: "ipv6-dns-study", name: "IPv6 DNS Study",
    description: "Assess historical DNS over IPv6 measurements, released-code discrepancies, standards wording and evidence limits.",
    status: "available", href: IPV6_STUDY_MODULE_PATH,
    sections: [
      { href: `${IPV6_STUDY_MODULE_PATH}/test-results`, label: "Test Results", description: "Compare archived DNS configurations with published values and coverage.", paths: [`${IPV6_STUDY_MODULE_PATH}/test-results`] },
      { href: `${IPV6_STUDY_MODULE_PATH}/methods`, label: "Methods & Claims", description: "Inspect frozen protocols, controls, discrepancies and limitations.", paths: [`${IPV6_STUDY_MODULE_PATH}/methods`] },
      { href: `${IPV6_STUDY_MODULE_PATH}/literature`, label: "Literature", description: "Inspect direct sources, byte hashes, retrieval attempts and review gaps.", paths: [`${IPV6_STUDY_MODULE_PATH}/literature`] },
      { href: `${IPV6_STUDY_MODULE_PATH}/chat`, label: "Chat with AI", description: "Discuss saved DNS evidence with module-specific read-only tools.", paths: [`${IPV6_STUDY_MODULE_PATH}/chat`] },
    ],
  },
  {
    id: "reliable-sketch-study",
    name: "ReliableSketch Study",
    description: "Assess stream-counting bounds, released CPU behavior, memory accounting, source coverage, and limits of the IMC 2025 reproduction.",
    status: "available",
    href: RELIABLE_STUDY_MODULE_PATH,
    sections: [
      { href: `${RELIABLE_STUDY_MODULE_PATH}/test-results`, label: "Test Results", description: "Compare matched CPU configurations and separate published values from new synthetic measurements.", paths: [`${RELIABLE_STUDY_MODULE_PATH}/test-results`] },
      { href: `${RELIABLE_STUDY_MODULE_PATH}/methods`, label: "Methods & Claims", description: "Inspect frozen protocols, correctness controls, coverage and release limitations.", paths: [`${RELIABLE_STUDY_MODULE_PATH}/methods`] },
      { href: `${RELIABLE_STUDY_MODULE_PATH}/literature`, label: "Literature", description: "Review direct sources, hashes, access attempts and explicit reading gaps.", paths: [`${RELIABLE_STUDY_MODULE_PATH}/literature`] },
      { href: `${RELIABLE_STUDY_MODULE_PATH}/chat`, label: "Chat with AI", description: "Discuss recorded counting evidence with module-specific read-only research tools.", paths: [`${RELIABLE_STUDY_MODULE_PATH}/chat`] },
    ],
  },
  {
    id: "http2-compliance-study",
    name: "HTTP/2 Compliance Study",
    description: "Assess archived protocol measurements, reproduce published counts, and inspect discrepancies, source coverage and independent framing controls.",
    status: "available",
    href: HTTP2_STUDY_MODULE_PATH,
    sections: [
      { href: `${HTTP2_STUDY_MODULE_PATH}/test-results`, label: "Test Results", description: "Compare published results, original classification and evidence-preserving sensitivity.", paths: [`${HTTP2_STUDY_MODULE_PATH}/test-results`] },
      { href: `${HTTP2_STUDY_MODULE_PATH}/methods`, label: "Methods & Claims", description: "Read frozen protocols, validation and claim coverage.", paths: [`${HTTP2_STUDY_MODULE_PATH}/methods`] },
      { href: `${HTTP2_STUDY_MODULE_PATH}/literature`, label: "Literature", description: "Inspect direct references, retrieved versions, hashes and review gaps.", paths: [`${HTTP2_STUDY_MODULE_PATH}/literature`] },
      { href: `${HTTP2_STUDY_MODULE_PATH}/chat`, label: "Chat with AI", description: "Discuss saved HTTP/2 evidence with source and analysis provenance.", paths: [`${HTTP2_STUDY_MODULE_PATH}/chat`] },
    ],
  },
  {
    id: "leo-emergency-failover",
    name: "LEO Emergency Failover Study",
    description: "Reproduce national satellite failover capacity estimates and inspect model discrepancies, placement policies, and source evidence.",
    status: "available",
    href: LEO_STUDY_MODULE_PATH,
    sections: [
      { href: `${LEO_STUDY_MODULE_PATH}/test-results`, label: "Test Results", description: "Compare the paper with recorded capacity simulations and sensitivity experiments.", paths: [`${LEO_STUDY_MODULE_PATH}/test-results`] },
      { href: `${LEO_STUDY_MODULE_PATH}/methods`, label: "Methods & Claims", description: "Inspect the protocol, artifact corrections, and limits of the reproduction.", paths: [`${LEO_STUDY_MODULE_PATH}/methods`] },
      { href: `${LEO_STUDY_MODULE_PATH}/literature`, label: "Literature", description: "Review cited sources, retrieval coverage, and reading notes.", paths: [`${LEO_STUDY_MODULE_PATH}/literature`] },
      { href: `${LEO_STUDY_MODULE_PATH}/chat`, label: "Chat with AI", description: "Discuss saved simulation results and the evidence behind each claim.", paths: [`${LEO_STUDY_MODULE_PATH}/chat`] },
    ],
  },
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
