import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

// Fixed public reads only: no credentials, arbitrary origins or write actions.
const args = process.argv.slice(2);
assert.ok(args.length <= 1 && (!args.length || ["--built", "--production"].includes(args[0])));
const origin = args[0] === "--production" ? "https://jumpserve.quaint-lab.org" : args[0] === "--built" ? "http://localhost:6101" : "http://localhost:6001";
const path = "/module/research-verification";
const protocol = await readFile(new URL("../docs/homepage-release-protocol-v1.json", import.meta.url));
const directory = `.test-artifacts/homepage-release/${new Date().toISOString().replaceAll(":", "-")}`;
await mkdir(directory, { recursive: true });
const report = {
  origin, protocol: "homepage-release-protocol-v1", protocol_sha256: createHash("sha256").update(protocol).digest("hex"),
  started_at: new Date().toISOString(), checks: [], errors: [], browser_errors: [],
  reviewer: { identity: "Primary Codex AI implementer", type: "AI", independent: false },
  conditional_gaps: ["No legitimate Google session: provider round trip, authenticated homepage continuation and owner actions not exercised.", "No authenticated chat, new scientific experiments or model evaluations in this presentation release."],
  measured_charges_usd: null, model_calls: 0,
};
async function check(name, action) {
  try { report.checks.push({ name, passed: true, evidence: await action() }); console.log(`PASS ${name}`); }
  catch (error) { report.errors.push({ name, reason: error.message }); throw error; }
}
let browser;
try {
  const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  browser = await chromium.launch({ headless: true, executablePath: existsSync(chrome) ? chrome : undefined });
  for (const width of [1365, 390]) for (const theme of ["light", "dark"]) {
    const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, colorScheme: theme });
    await context.addInitScript(preference => localStorage.setItem("theme-preference", preference), theme);
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.on("pageerror", error => report.browser_errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") report.browser_errors.push(message.text()); });
    await check(`homepage ${width} ${theme}`, async () => {
      const response = await page.goto(origin, { waitUntil: "domcontentloaded", timeout: 30000 });
      assert.equal(response.status(), 200);
      await page.getByRole("heading", { name: "Assess research claims. Test new ideas.", exact: true }).waitFor();
      // The root page defines its own title; the layout template applies to descendants.
      assert.equal(await page.title(), "Research Verification");
      const overview = page.locator('section[aria-labelledby="overview-title"]');
      const previous = page.locator('section[aria-labelledby="previous-results-title"]');
      assert.match(await overview.innerText(), /academic research papers and test new claims that have not been published yet/);
      // Base UI's Button renders these anchors with role=button and nativeButton=false.
      const primary = overview.locator("a").filter({ hasText: "Research Verification" });
      assert.equal(await overview.locator("a").first().getAttribute("href"), path);
      const primaryBox = await primary.boundingBox(); const previousBox = await previous.boundingBox();
      assert.ok(previousBox.y > primaryBox.y);
      const widths = [];
      for (const [section, paragraph] of [[overview, overview.locator("p").nth(1)], [previous, previous.locator(":scope > p")]]) {
        const sectionBox = await section.boundingBox(); const paragraphBox = await paragraph.boundingBox();
        assert.ok(Math.abs(sectionBox.width - paragraphBox.width) < 1);
        widths.push(paragraphBox.width);
      }
      const input = page.getByRole("searchbox", { name: "Filter by title", exact: true });
      const count = previous.getByRole("status");
      async function filter(query, expected, expectedTitles) {
        await input.fill(query); await count.filter({ hasText: `${expected} of 7 titles` }).waitFor();
        assert.equal(await previous.getByRole("heading", { level: 3 }).count(), expected);
        if (expectedTitles) assert.deepEqual(await previous.getByRole("heading", { level: 3 }).allTextContents(), expectedTitles);
      }
      await filter("", 7);
      await filter("  iPv6  ", 1, ["IPv6 DNS Study"]);
      assert.equal(await previous.locator("a").filter({ hasText: "View results" }).getAttribute("href"), "/module/ipv6-dns-study/test-results");
      await filter("congestion", 2);
      await filter("claims", 0); await previous.getByText("No titles match your filter. Try a different title or clear the filter.", { exact: true }).waitFor();
      await previous.getByRole("button", { name: "Clear filter", exact: true }).click();
      await count.filter({ hasText: "7 of 7 titles" }).waitFor();
      assert.ok(await input.evaluate(element => document.activeElement === element));
      await filter("   ", 7); await filter("", 7);
      await page.waitForFunction(dark => document.documentElement.classList.contains("dark") === dark, theme === "dark");
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
      await page.screenshot({ path: `${directory}/homepage-${width}-${theme}.png`, fullPage: true });
      const resultLinks = await previous.locator("a").filter({ hasText: "View results" }).evaluateAll(links => links.map(link => link.getAttribute("href")));
      const methodsLinks = await previous.getByRole("link", { name: "Methods & tools", exact: true }).evaluateAll(links => links.map(link => link.getAttribute("href")));
      if (width === 1365 && theme === "light") {
        for (const href of new Set([...resultLinks, ...methodsLinks])) {
          assert.ok(href.startsWith("/module/"));
          const result = await context.request.get(origin + href); assert.equal(result.status(), 200, href);
          assert.ok(!(await result.text()).includes("Application error:"), href);
        }
        await primary.click(); await page.waitForURL(origin + path);
        await page.goto(origin, { waitUntil: "domcontentloaded" });
        await page.getByRole("link", { name: "View published assessments", exact: true }).click();
        await page.waitForURL(origin + path + "/test-results");
        const ids = ["a0c13133-7f02-5aae-93d0-43fb1332e0ad", "8672163c-c3c1-51bb-9115-c6fa94875071", "10f01fe6-ebe3-5d1f-8789-915581de9c0a", "83ae477c-3bc1-5d87-8a6d-90e1a018be14", "99689ce0-e872-52ec-a8e5-a08e217019c0"];
        for (const id of ids) await page.locator(`a[href="${path}/studies/${id}"]`).waitFor();
        await page.screenshot({ path: directory + "/published-catalogue.png", fullPage: true });
      }
      return { paragraph_widths_px: widths, title_cases: ["empty", "trimmed mixed-case", "multiple matches", "no title match", "clear and focus", "whitespace"], result_links: resultLinks, methods_links: methodsLinks };
    });
    await check(`sign-in return paths ${width} ${theme}`, async () => {
      const suffixes = ["/new-study", "/workspace/76c70fd9-0217-464e-8c26-0a47832409a3?view=gaps"];
      for (const suffix of suffixes) {
        await page.goto(origin + path + suffix, { waitUntil: "domcontentloaded" });
        const url = new URL(page.url()); assert.equal(url.pathname, "/login"); assert.equal(url.searchParams.get("next"), path + suffix);
        await page.getByRole("heading", { name: "Sign in to continue", exact: true }).waitFor();
      }
      return { paths: suffixes, actual_authentication: "Not exercised" };
    });
    await context.close();
  }
  if (args[0] === "--production") await check("canonical production callback origin", async () => {
    const response = await fetch(origin + "/auth/callback?next=" + encodeURIComponent(path + "/new-study"), { redirect: "manual" });
    assert.equal(response.status, 307);
    const location = new URL(response.headers.get("location"));
    assert.equal(location.origin, origin); assert.equal(location.pathname, "/login"); assert.equal(location.searchParams.get("next"), path + "/new-study");
    return { redirect_origin: location.origin, provider_round_trip: "Not exercised; callback missing-code path only" };
  });
} catch (error) {
  if (!report.errors.some(item => item.reason === error.message)) report.errors.push({ name: "browser setup or runtime", reason: error.message });
} finally {
  if (browser) await browser.close();
  report.ended_at = new Date().toISOString(); report.passed = !report.errors.length && !report.browser_errors.length;
  await writeFile(directory + "/browser-report.json", JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ directory, ...report }, null, 2));
  if (!report.passed) process.exitCode = 1;
}
