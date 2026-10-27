import assert from "node:assert/strict";
import { test } from "node:test";
import { getPostLoginPath, getSafeNextPath } from "../lib/auth-redirect.ts";
import { ASSESSMENTS_PATH, MY_ASSESSMENTS_PATH, EMULATED_TESTS_MODULE, LEGACY_EXACT_MODULE_ROUTES, LEGACY_MODULE_ROUTES, NEW_ASSESSMENT_PATH, PREVIOUS_ASSESSMENTS_PATH, TEST_MODULES, getTestModule, getTestModuleForPath, isModuleSectionActive } from "../lib/test-modules.ts";

test("sign-in without a destination returns home", () => {
  for (const next of [null, "", "/", "/login", "/auth/callback?code=expired"]) {
    assert.equal(getPostLoginPath(next), "/");
  }
});

test("sign-in resumes the requested action or result, with the complete query", () => {
  for (const requested of [
    "/parent-run/2352?page=3",
    "/chat?parentRunId=2352",
    "/test-lookup?page=2&search=cubic%20vs%20bbr&tag=a%26b%3Fc",
    "/benchmarks/job-123",
    EMULATED_TESTS_MODULE.href,
  ]) {
    const chooser = new URL(getPostLoginPath(requested), "https://jumpserve.example");
    assert.equal(`${chooser.pathname}${chooser.search}`, requested);
    assert.equal(getTestModuleForPath(requested), EMULATED_TESTS_MODULE);
  }
});

test("re-authenticating from a pending module choice preserves the original destination", () => {
  const requested = "/parent-run/2352?page=4";
  const chooser = getPostLoginPath(requested);
  assert.equal(getPostLoginPath(chooser), chooser);
  assert.equal(getPostLoginPath(`/?${new URLSearchParams({ next: requested })}`), requested);
  assert.equal(getPostLoginPath("/?next=%2F"), "/");
  assert.equal(getPostLoginPath("/?next=%2F%3Fnext%3D%252Fchat"), "/");
});

test("untrusted redirect targets cannot leave the site or select a module", () => {
  for (const target of [
    "https://example.com/benchmarks", "//example.com/benchmarks", "javascript:alert(1)",
    "\\\\example.com/benchmarks", "/\\example.com/benchmarks", "benchmarks",
  ]) {
    assert.equal(getSafeNextPath(target), "/");
    assert.equal(getPostLoginPath(target), "/");
    assert.equal(getTestModuleForPath(getSafeNextPath(target)), undefined);
  }
  assert.equal(getPostLoginPath("/?next=https%3A%2F%2Fexample.com"), "/");
});

test("all existing tools and result URLs belong to the emulated module", () => {
  for (const path of ["/test-lookup", "/test-lookup?page=2", "/parent-run/2352", "/aggregate-graphs", "/benchmarks", "/benchmarks/a-job", "/chat?parentRunId=2352"]) {
    assert.equal(getTestModuleForPath(path)?.id, "congestion-control-emulated");
  }
});

test("global, unavailable, external and similarly prefixed routes do not inherit emulated tools", () => {
  for (const path of ["/", "/login", "/api/unrelated", "/benchmarks-other", "/chatty", "/modules/congestion-control-emulated-other", "/modules/cdn", "/module/cdn", "/module/congestion-control-emulated-other", "//example.com/chat", "/chat\\evil", "/chat\nevil"]) {
    assert.equal(getTestModuleForPath(path), undefined, path);
  }
  assert.equal(getTestModuleForPath(getSafeNextPath("/benchmarks/../login")), undefined);
});

test("real-world tools and results belong to their own available module", () => {
  const testModule = getTestModule("congestion-control-real-world");
  assert.equal(testModule.name, "Congestion Control Real World Tests");
  assert.equal(testModule.status, "available");
  for (const path of [
    testModule.href,
    `${testModule.href}/run-a-test`, `${testModule.href}/run-a-test/job-123`,
    `${testModule.href}/test-results`, `${testModule.href}/test-results/job-123`,
    `${testModule.href}/chat?jobId=11111111-1111-4111-8111-111111111111`,
    `${testModule.href}/real-world/job-123`, `${testModule.href}/real-world-reports/job-123`,
    "/real-world", "/real-world/job-123", "/real-world-reports", "/real-world-reports/job-123?selected=abc",
  ]) {
    assert.equal(getTestModuleForPath(path), testModule);
    assert.notEqual(getPostLoginPath(path), "/");
  }
  assert.equal(getTestModuleForPath("/real-world-other"), undefined);
  assert.equal(getTestModule("unknown"), undefined);
  assert.equal(testModule.sections[0].href, `${testModule.href}/run-a-test`);
  assert.equal(isModuleSectionActive(testModule.sections[0], `${testModule.href}/run-a-test/job-123`), true);
  assert.equal(isModuleSectionActive(testModule.sections[0], `${testModule.href}/test-results/job-123`), false);
  assert.equal(testModule.sections[1].href, `${testModule.href}/test-results`);
  assert.equal(isModuleSectionActive(testModule.sections[1], `${testModule.href}/test-results/job-123`), true);
  assert.equal(testModule.sections[2].label, "Chat with AI");
  assert.equal(testModule.sections[2].href, `${testModule.href}/chat`);
  assert.equal(isModuleSectionActive(testModule.sections[2], `${testModule.href}/chat`), true);
});

test("navigation highlights the parent tool for detail pages with path boundaries", () => {
  const lookup = EMULATED_TESTS_MODULE.sections[0];
  assert.equal(isModuleSectionActive(lookup, `${EMULATED_TESTS_MODULE.href}/parent-run/2352`), true);
  assert.equal(isModuleSectionActive(lookup, `${EMULATED_TESTS_MODULE.href}/parent-runs`), false);
  assert.equal(isModuleSectionActive(lookup, `${EMULATED_TESTS_MODULE.href}/chat`), false);
});
test("previous paper assessments have a canonical route with direct legacy aliases", () => {
  const paperModule = getTestModule("research-verification");
  assert.equal(paperModule.sections[1].href, PREVIOUS_ASSESSMENTS_PATH);
  assert.equal(PREVIOUS_ASSESSMENTS_PATH, "/research-verification/previous-assessments");
  assert.ok(isModuleSectionActive(paperModule.sections[1], PREVIOUS_ASSESSMENTS_PATH));
  for (const prefix of ["", "/module", "/modules"]) {
    const old = `${prefix}/research-verification/test-results`;
    assert.equal(LEGACY_MODULE_ROUTES.find(r => r.source === old)?.destination, PREVIOUS_ASSESSMENTS_PATH);
    assert.equal(getTestModuleForPath(old), paperModule);
  }
  assert.equal(getTestModule("research-ideas").sections[2].href, "/research-ideas/test-results");
});
test("new paper assessment route is canonical and old intake links remain usable", () => {
  const paperModule = getTestModule("research-verification");
  assert.equal(NEW_ASSESSMENT_PATH, "/research-verification/new-assessment");
  assert.equal(paperModule.sections[0].href, NEW_ASSESSMENT_PATH);
  assert.ok(isModuleSectionActive(paperModule.sections[0], NEW_ASSESSMENT_PATH));
  assert.equal(getPostLoginPath(NEW_ASSESSMENT_PATH + "?source=paper&tag=a%26b&tag=second"), NEW_ASSESSMENT_PATH + "?source=paper&tag=a%26b&tag=second");
  for (const prefix of ["", "/module", "/modules"]) {
    const old = `${prefix}/research-verification/new-study`;
    assert.equal(LEGACY_MODULE_ROUTES.find(r => r.source === old)?.destination, NEW_ASSESSMENT_PATH);
    assert.equal(getTestModuleForPath(old), paperModule);
  }
});

test("My Assessments owns the canonical list while published details and private work retain distinct navigation", () => {
  const paperModule = getTestModule("research-verification");
  const mine = paperModule.sections.find(s => s.label === "My Assessments");
  const previous = paperModule.sections.find(s => s.label === "Previous Assessments");
  assert.equal(MY_ASSESSMENTS_PATH, "/research-verification/my-assessments");
  assert.equal(mine.href, MY_ASSESSMENTS_PATH);
  assert.equal(isModuleSectionActive(mine, MY_ASSESSMENTS_PATH), true);
  assert.equal(isModuleSectionActive(previous, MY_ASSESSMENTS_PATH), false);
  assert.equal(isModuleSectionActive(previous, ASSESSMENTS_PATH + "/paper-id"), true);
  assert.equal(isModuleSectionActive(mine, ASSESSMENTS_PATH + "/paper-id"), false);
  assert.equal(isModuleSectionActive(mine, "/research-verification/workspace/paper-id"), true);
  assert.equal(isModuleSectionActive(previous, ASSESSMENTS_PATH + "-archive"), false);
  assert.equal(getPostLoginPath(MY_ASSESSMENTS_PATH + "?tag=a%26b&tag=second"), MY_ASSESSMENTS_PATH + "?tag=a%26b&tag=second");
  for (const prefix of ["", "/module", "/modules"]) {
    for (const suffix of ["workspace", "assessments", "studies"]) {
      const old = prefix + "/research-verification/" + suffix;
      assert.equal(LEGACY_EXACT_MODULE_ROUTES.find(r => r.source === old)?.destination, MY_ASSESSMENTS_PATH);
      assert.equal(getTestModuleForPath(old), paperModule);
    }
  }
});

test("module overviews and every navigation section use their top-level namespace", () => {
  for (const testModule of TEST_MODULES) {
    assert.equal(testModule.href, `/${testModule.id}`);
    for (const section of testModule.sections) {
      assert.ok(section.href.startsWith(`${testModule.href}/`));
      assert.equal(getTestModuleForPath(section.href), testModule);
      for (const path of section.paths) assert.ok(path.startsWith(`${testModule.href}/`));
    }
  }
});

test("canonical result, launch and chat URLs preserve their module and login destination", () => {
  for (const [path, id] of [
    ["/congestion-control-emulated/parent-run/2352?page=3", "congestion-control-emulated"],
    ["/congestion-control-emulated/chat?parentRunId=2352", "congestion-control-emulated"],
    ["/congestion-control-emulated/test-lookup?page=2&search=cubic%20vs%20bbr&tag=a%26b%3Fc", "congestion-control-emulated"],
    ["/congestion-control-emulated/benchmarks/job-123", "congestion-control-emulated"],
    ["/congestion-control-real-world/run-a-test/job-123", "congestion-control-real-world"],
    ["/congestion-control-real-world/test-results?selected=a%2Cb", "congestion-control-real-world"],
    ["/congestion-control-real-world/test-results/job-123", "congestion-control-real-world"],
  ]) {
    assert.equal(getTestModuleForPath(path)?.id, id);
    assert.equal(getPostLoginPath(path), path);
    assert.equal(getPostLoginPath(`/?${new URLSearchParams({ next: path })}`), path);
  }
});

test("legacy overview URLs still identify the intended module", () => {
  for (const testModule of TEST_MODULES) {
    for (const prefix of ["module", "modules"]) {
      assert.equal(getTestModuleForPath(`/${prefix}/${testModule.id}`), testModule);
      assert.equal(getTestModuleForPath(`/${prefix}/${testModule.id}/methods?view=gaps`), testModule);
    }
  }
});


test("legacy redirects target canonical routes without self-redirects or chains", () => {
  assert.equal(new Set(LEGACY_MODULE_ROUTES.map(route => route.source)).size, LEGACY_MODULE_ROUTES.length);
  for (const { source, destination } of LEGACY_MODULE_ROUTES) {
    assert.notEqual(source, destination);
    assert.ok(!/^\/modules?\//.test(destination));
    assert.ok(!LEGACY_MODULE_ROUTES.some(route => destination === route.source || destination.startsWith(route.source + "/")), destination);
    assert.equal(getTestModuleForPath(source), getTestModuleForPath(destination));
  }
});

test("canonical and legacy routes respect module name boundaries", () => {
  for (const testModule of TEST_MODULES) {
    for (const prefix of ["", "/module", "/modules"]) {
      assert.equal(getTestModuleForPath(`${prefix}/${testModule.id}-other`), undefined);
    }
  }
});
