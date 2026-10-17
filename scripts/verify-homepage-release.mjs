import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

// Fixed public reads only: no credentials, arbitrary origins or write actions.
const args = process.argv.slice(2);
assert.ok(args.length <= 1 && (!args.length || ["--built", "--production"].includes(args[0])));
const origin = args[0] === "--production" ? "https://jumpserve.quaint-lab.org" : args[0] === "--built" ? "http://localhost:6101" : "http://localhost:6001";
const path = "/research-verification";
const ideasPath = "/research-ideas";
const protocol = await readFile(new URL("../docs/homepage-release-protocol-v1.json", import.meta.url));
const amendment = await readFile(new URL("../docs/homepage-release-amendment-v2.json", import.meta.url));
const directory = `.test-artifacts/homepage-release/${new Date().toISOString().replaceAll(":", "-")}`;
await mkdir(directory, { recursive: true });
const report = {
  origin, protocol: "homepage-release-protocol-v1", protocol_sha256: createHash("sha256").update(protocol).digest("hex"),
  amendment: "homepage-release-amendment-v2", amendment_sha256: createHash("sha256").update(amendment).digest("hex"),
  scope: "Two-pathway homepage layout and navigation; earlier workflow, filter and previous-results checks retired. Original release protocols remain historical context.",
  started_at: new Date().toISOString(), checks: [], errors: [], browser_errors: [],
  reviewer: { identity: "Primary Codex AI implementer", type: "AI", independent: false },
  conditional_gaps: ["No legitimate Google session: provider round trip, authenticated homepage continuation and owner actions not exercised.", "No authenticated chat, new scientific experiments or model evaluations in this presentation release."],
  measured_charges_usd: null, model_calls: 0,
};
async function check(name, action) {
  try { report.checks.push({ name, passed: true, evidence: await action() }); console.log(`PASS ${name}`); }
  catch (error) { report.errors.push({ name, reason: error.message }); throw error; }
}
async function homepageTextContrast(page) {
  return page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d");
    function pixel() { return [...context.getImageData(0, 0, 1, 1).data].slice(0, 3); }
    function background(element) {
      const ancestors = [];
      for (let node = element; node; node = node.parentElement) ancestors.unshift(node);
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = "#fff"; context.fillRect(0, 0, 1, 1);
      for (const node of ancestors) { context.fillStyle = getComputedStyle(node).backgroundColor; context.fillRect(0, 0, 1, 1); }
      return pixel();
    }
    function foreground(element) {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = getComputedStyle(element).color;
      context.fillRect(0, 0, 1, 1);
      return pixel();
    }
    function luminance(channels) {
      const linear = channels.map(value => { const c = value / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
      return .2126 * linear[0] + .7152 * linear[1] + .0722 * linear[2];
    }
    return [...document.querySelectorAll("main h1, main h2, main p, main a")].map(element => {
      const bg = background(element), fg = foreground(element);
      const a = luminance(fg), b = luminance(bg);
      return { text: element.textContent.trim(), foreground_rgb: fg, background_rgb: bg, contrast_ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05) };
    });
  });
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
      await page.getByRole("heading", { name: "Choose your research path.", exact: true }).waitFor();
      // The root page defines its own title; the layout template applies to descendants.
      assert.equal(await page.title(), "Research Verification");
      const pathways = page.getByRole("region", { name: "Research pathways", exact: true });
      assert.deepEqual(await pathways.getByRole("heading", { level: 2 }).allTextContents(), ["Verify Existing Claims", "Develop a New Idea"]);
      // Base UI's Button renders these anchors with role=button and nativeButton=false.
      const primary = pathways.getByRole("button", { name: "Start verification", exact: true });
      assert.equal(await primary.getAttribute("href"), path + "/new-study");
      assert.equal(await pathways.getByRole("button", { name: "Start developing", exact: true }).getAttribute("href"), ideasPath + "/new-idea");
      await page.waitForFunction(dark => document.documentElement.classList.contains("dark") === dark, theme === "dark");
      const contrast = await homepageTextContrast(page);
      assert.ok(contrast.length > 0 && contrast.every(row => row.contrast_ratio >= 4.5), `Homepage text contrast below 4.5:1: ${JSON.stringify(contrast.filter(row => row.contrast_ratio < 4.5))}`);
      const headerBounds = await page.locator('[data-slot="site-header"]').boundingBox();
      const viewportWidth = await page.evaluate(() => document.documentElement.clientWidth);
      assert.ok(Math.abs(headerBounds.x) < 1 && Math.abs(headerBounds.x + headerBounds.width - viewportWidth) < 1, "Header must span the available viewport width");
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: `${directory}/homepage-${width}-${theme}.png`, fullPage: true });
      if (width === 1365 && theme === "light") {
        await primary.click(); await page.waitForURL(/\/login\?/);
        assert.equal(new URL(page.url()).searchParams.get("next"), path + "/new-study");
        await page.goto(origin, { waitUntil: "domcontentloaded" });
        await page.getByRole("link", { name: "View previous", exact: true }).click();
        await page.waitForURL(origin + path + "/test-results");
        const ids = ["a0c13133-7f02-5aae-93d0-43fb1332e0ad", "8672163c-c3c1-51bb-9115-c6fa94875071", "10f01fe6-ebe3-5d1f-8789-915581de9c0a", "83ae477c-3bc1-5d87-8a6d-90e1a018be14", "99689ce0-e872-52ec-a8e5-a08e217019c0"];
        for (const id of ids) await page.locator(`a[href="${path}/studies/${id}"]`).waitFor();
        await page.screenshot({ path: directory + "/published-catalogue.png", fullPage: true });
      }
      return { pathways: ["Verify Existing Claims", "Develop a New Idea"], header_width_px: headerBounds.width, viewport_width_px: viewportWidth, text_contrast: contrast };
    });
    await check(`sign-in return paths ${width} ${theme}`, async () => {
      const routes = [path + "/new-study", ideasPath + "/new-idea", path + "/workspace/76c70fd9-0217-464e-8c26-0a47832409a3?view=gaps"];
      for (const route of routes) {
        await page.goto(origin + route, { waitUntil: "domcontentloaded" });
        const url = new URL(page.url()); assert.equal(url.pathname, "/login"); assert.equal(url.searchParams.get("next"), route);
        await page.getByRole("heading", { name: "Sign in to continue", exact: true }).waitFor();
      }
      return { paths: routes, actual_authentication: "Not exercised" };
    });
    await check(`scrolling page header ${width} ${theme}`, async () => {
      await page.goto(origin + path + "/methods", { waitUntil: "domcontentloaded" });
      const geometry = await page.evaluate(async () => {
        window.scrollTo(0, 500);
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const root = document.documentElement;
        const bounds = document.querySelector('[data-slot="site-header"]').getBoundingClientRect();
        return { scroll_y: window.scrollY, header_top: bounds.top, header_left: bounds.left, header_right: bounds.right, viewport_width: root.clientWidth, horizontal_overflow: root.scrollWidth > root.clientWidth };
      });
      assert.ok(geometry.scroll_y > 0);
      assert.ok(Math.abs(geometry.header_top) < 1 && Math.abs(geometry.header_left) < 1 && Math.abs(geometry.header_right - geometry.viewport_width) < 1);
      assert.equal(geometry.horizontal_overflow, false);
      return geometry;
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
