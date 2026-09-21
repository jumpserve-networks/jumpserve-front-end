import assert from "node:assert/strict";
import { test } from "node:test";
import { getPostLoginPath, getSafeNextPath } from "../lib/auth-redirect.ts";
import { EMULATED_TESTS_MODULE, TEST_MODULES, getTestModule, getTestModuleForPath, isModuleSectionActive } from "../lib/test-modules.ts";

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
});

test("navigation highlights the parent tool for detail pages with path boundaries", () => {
  const lookup = EMULATED_TESTS_MODULE.sections[0];
  assert.equal(isModuleSectionActive(lookup, `${EMULATED_TESTS_MODULE.href}/parent-run/2352`), true);
  assert.equal(isModuleSectionActive(lookup, `${EMULATED_TESTS_MODULE.href}/parent-runs`), false);
  assert.equal(isModuleSectionActive(lookup, `${EMULATED_TESTS_MODULE.href}/chat`), false);
});

test("module overviews and every navigation section use the singular module namespace", () => {
  for (const testModule of TEST_MODULES) {
    assert.equal(testModule.href, `/module/${testModule.id}`);
    for (const section of testModule.sections) {
      assert.ok(section.href.startsWith(`${testModule.href}/`));
      assert.equal(getTestModuleForPath(section.href), testModule);
      for (const path of section.paths) assert.ok(path.startsWith(`${testModule.href}/`));
    }
  }
});

test("canonical result, launch and chat URLs preserve their module and login destination", () => {
  for (const [path, id] of [
    ["/module/congestion-control-emulated/parent-run/2352?page=3", "congestion-control-emulated"],
    ["/module/congestion-control-emulated/chat?parentRunId=2352", "congestion-control-emulated"],
    ["/module/congestion-control-emulated/test-lookup?page=2&search=cubic%20vs%20bbr&tag=a%26b%3Fc", "congestion-control-emulated"],
    ["/module/congestion-control-emulated/benchmarks/job-123", "congestion-control-emulated"],
    ["/module/congestion-control-real-world/run-a-test/job-123", "congestion-control-real-world"],
    ["/module/congestion-control-real-world/test-results?selected=a%2Cb", "congestion-control-real-world"],
    ["/module/congestion-control-real-world/test-results/job-123", "congestion-control-real-world"],
  ]) {
    assert.equal(getTestModuleForPath(path)?.id, id);
    assert.equal(getPostLoginPath(path), path);
    assert.equal(getPostLoginPath(`/?${new URLSearchParams({ next: path })}`), path);
  }
});

test("legacy overview URLs still identify the intended module", () => {
  for (const testModule of TEST_MODULES) {
    assert.equal(getTestModuleForPath(`/modules/${testModule.id}`), testModule);
  }
});
