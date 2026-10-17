import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { TEST_MODULES } from "../lib/test-modules.ts";

// Fixed local/production UI and public-read checks. No authenticated actions or experiment launches.
const args = process.argv.slice(2);
assert.ok(args.length <= 1 && (!args.length || ["--built", "--production"].includes(args[0])));
const origin = args[0] === "--production" ? "https://jumpserve.quaint-lab.org" : args[0] === "--built" ? "http://localhost:6101" : "http://localhost:6001";
const paper = "/research-verification", ideas = "/research-ideas";
const modules = [
  { base: paper, name: "Verify Existing Claims", methods: "Verification Methods", heading: "Verify claims in an academic paper", results: "Published research assessments" },
  { base: ideas, name: "Develop a New Idea", methods: "Idea Development Methods", heading: "From idea to experiment", results: "Published idea experiments" },
];
const directory = `.test-artifacts/research-pathways/${new Date().toISOString().replaceAll(":", "-")}`;
await mkdir(directory, { recursive: true });
const report = { origin, started_at: new Date().toISOString(), checks: [], errors: [], browser_errors: [], conditional_gaps: ["No legitimate Google session: authenticated saved-idea continuation and experiment execution were not exercised.", "No database migrations, new scientific campaigns, or model evaluations are part of this module split."], reviewer: { identity: "Primary Codex AI implementer", type: "AI", independent: false } };
async function check(name, action) {
  try { report.checks.push({ name, passed: true, evidence: await action() }); console.log(`PASS ${name}`); }
  catch (error) { report.errors.push({ name, reason: error.message }); throw error; }
}
async function pathwayColors(page, base, theme, expectPortal = false) {
  const expected = base === paper ? (theme === "dark" ? "#69a7ff" : "#163b67") : (theme === "dark" ? "#ed7fdb" : "#8a2435");
  const expectedRgb = `rgb(${expected.slice(1).match(/../g).map(value => parseInt(value, 16)).join(", ")})`;
  try {
    await page.waitForFunction(({ color, rgb }) => getComputedStyle(document.documentElement).getPropertyValue("--primary").trim() === color && [...document.querySelectorAll('main h1, main h2, main h3, main h4, main h5, main h6, [data-slot="button"][data-variant="outline"]')].filter(element => !element.closest("details:not([open])") && element.getClientRects().length > 0).every(element => getComputedStyle(element).color === rgb), { color: expected, rgb: expectedRgb });
  } catch (error) {
    const actual = await page.evaluate(() => ({ path: location.pathname, mode: document.documentElement.className, primary: getComputedStyle(document.documentElement).getPropertyValue("--primary"), elements: [...document.querySelectorAll('main h1, main h2, main h3, main h4, main h5, main h6, [data-slot="button"][data-variant="outline"]')].map(element => ({ text: element.textContent.trim(), color: getComputedStyle(element).color })) }));
    throw new Error(`${error.message}; expected ${expectedRgb}; actual ${JSON.stringify(actual)}`);
  }
  const evidence = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const token = name => root.getPropertyValue(name).trim();
    const canvas = document.createElement("canvas"); canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d");
    function rgb(color) { context.clearRect(0, 0, 1, 1); context.fillStyle = color; context.fillRect(0, 0, 1, 1); return [...context.getImageData(0, 0, 1, 1).data].slice(0, 3); }
    function luminance(channels) { const values = channels.map(value => { const c = value / 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; }); return .2126 * values[0] + .7152 * values[1] + .0722 * values[2]; }
    function contrast(a, b) { const x = luminance(rgb(a)), y = luminance(rgb(b)); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); }
    const primary = token("--primary"), primaryRgb = rgb(primary).join(",");
    const headings = [...document.querySelectorAll("main h1, main h2, main h3, main h4, main h5, main h6")].filter(element => !element.closest("details:not([open])") && element.getClientRects().length > 0);
    const outlineButtons = [...document.querySelectorAll('[data-slot="button"][data-variant="outline"]')].filter(element => !element.closest("details:not([open])") && element.getClientRects().length > 0);
    const portal = document.querySelector('[role="dialog"], [data-slot="select-content"]');
    const selected = document.querySelector('main a[aria-current="page"]');
    return {
      marker: document.querySelector("[data-module-theme]")?.getAttribute("data-module-theme"), primary,
      related_tokens: ["--ring", "--info", "--highlight", "--sidebar-primary"].map(token),
      heading_count: headings.length, headings_use_primary: headings.every(element => rgb(getComputedStyle(element).color).join(",") === primaryRgb),
      header_uses_primary: rgb(getComputedStyle(document.querySelector('a[aria-label="JumpServe home"]')).color).join(",") === primaryRgb,
      outline_buttons_use_primary: outlineButtons.every(element => rgb(getComputedStyle(element).color).join(",") === primaryRgb),
      contrast: { page_text: contrast(primary, token("--background")), card_text: contrast(primary, token("--card")), primary_button: contrast(token("--primary-foreground"), primary), selected_navigation: contrast(token("--sidebar-accent-foreground"), token("--sidebar-accent")) },
      portal: portal ? { primary: getComputedStyle(portal).getPropertyValue("--primary").trim(), outside_route_marker: !portal.closest("[data-module-theme]") } : null,
      selected_evidence_tab: selected ? { foreground: rgb(getComputedStyle(selected).color), expected_foreground: rgb(token("--primary-foreground")) } : null,
    };
  });
  assert.equal(evidence.primary, expected);
  assert.equal(evidence.marker, base.slice(1));
  assert.ok(evidence.heading_count > 0 && evidence.headings_use_primary && evidence.header_uses_primary && evidence.outline_buttons_use_primary);
  assert.ok(evidence.related_tokens.every(color => color === expected));
  assert.ok(Object.values(evidence.contrast).every(value => value >= 4.5), JSON.stringify(evidence.contrast));
  if (expectPortal) { assert.ok(evidence.portal?.outside_route_marker); assert.equal(evidence.portal.primary, expected); }
  if (evidence.selected_evidence_tab) assert.deepEqual(evidence.selected_evidence_tab.foreground, evidence.selected_evidence_tab.expected_foreground);
  return evidence;
}
let browser, paperStudyId;
try {
  const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  browser = await chromium.launch({ headless: true, executablePath: existsSync(chrome) ? chrome : undefined });
  await check("mobile menu accepts its first click only after client scripts are ready", async () => {
    const context = await browser.newContext({ viewport: { width: 390, height: 900 } });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.on("pageerror", error => report.browser_errors.push(error.message));
    let releaseScripts;
    let blockedScripts = 0;
    const scripts = new Promise(resolve => { releaseScripts = resolve; });
    await page.route("**/*", async route => {
      const url = new URL(route.request().url());
      if (url.origin === origin && url.pathname.startsWith("/_next/static/") && route.request().resourceType() === "script") {
        blockedScripts++;
        await scripts;
      }
      await route.continue();
    });
    try {
      assert.equal((await page.goto(origin + paper, { waitUntil: "commit", timeout: 30000 })).status(), 200);
      const trigger = page.getByRole("button", { name: "Open module menu", exact: true });
      await trigger.waitFor();
      assert.equal(await trigger.isDisabled(), true, "The server-rendered menu must not accept a click before its event handlers exist");
      releaseScripts();
      await trigger.click();
      const menu = page.getByRole("dialog").getByRole("navigation", { name: "Verify Existing Claims navigation", exact: true });
      await menu.waitFor();
      assert.ok(blockedScripts > 0, "The check must actually hold back client scripts");
      await page.screenshot({ path: directory + "/mobile-menu-after-first-click.png" });
      return { client_scripts_withheld: blockedScripts, disabled_before_hydration: true, successful_clicks: 1, navigation_visible: true };
    } finally {
      releaseScripts();
      await context.close();
    }
  });
  for (const width of [1365, 390]) for (const theme of ["light", "dark"]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: theme });
    await context.addInitScript(value => localStorage.setItem("theme-preference", value), theme);
    const page = await context.newPage(); page.setDefaultTimeout(15000);
    page.on("pageerror", error => report.browser_errors.push(error.message));
    for (const testModule of modules) await check(`${testModule.name} menu and results ${width} ${theme}`, async () => {
      assert.equal((await page.goto(origin + testModule.base, { waitUntil: "domcontentloaded" })).status(), 200);
      await page.getByRole("heading", { name: testModule.name, exact: true }).waitFor();
      const overviewColors = await pathwayColors(page, testModule.base, theme);
      const menu = width < 1024 ? page.getByRole("dialog") : page.locator('[data-slot="module-sidebar"]');
      if (width < 1024) await page.getByRole("button", { name: "Open module menu", exact: true }).click();
      const navigation = menu.getByRole("navigation", { name: `${testModule.name} navigation`, exact: true });
      await navigation.waitFor();
      const menuColors = await pathwayColors(page, testModule.base, theme, width < 1024);
      const links = await navigation.locator("a").evaluateAll(elements => elements.map(element => element.getAttribute("href")));
      assert.ok(links.length >= 4 && links.every(href => href === testModule.base || href.startsWith(testModule.base + "/")));
      if (testModule.base === paper) assert.deepEqual(await navigation.locator("a").allTextContents(), ["Overview", "Assess a Paper", "Previous Assessments", "My Workspace", "Experiment Queue", "Verification Methods"]);
      assert.equal(await navigation.locator('[aria-current="page"]').getAttribute("href"), testModule.base);
      assert.equal(await menu.getByRole("combobox", { name: "Theme", exact: true }).count(), 0);
      await navigation.getByRole("link", { name: testModule.methods, exact: true }).click();
      await page.waitForURL(origin + testModule.base + "/methods");
      await page.getByRole("heading", { name: testModule.heading, exact: true }).waitFor();
      const methodColors = await pathwayColors(page, testModule.base, theme);
      if (width === 1365 && theme === "light") {
        await page.locator('[data-slot="site-header"]').getByRole("button", { name: "Dark Mode", exact: true }).click();
        await pathwayColors(page, testModule.base, "dark");
        await page.locator('[data-slot="site-header"]').getByRole("button", { name: "Light Mode", exact: true }).click();
        await pathwayColors(page, testModule.base, "light");
      }
      await page.getByText("Explore an illustrative claim queue", { exact: true }).click();
      await pathwayColors(page, testModule.base, theme);
      await page.getByRole("combobox", { name: "Queue example state", exact: true }).click();
      await page.getByRole("option", { name: "Claims with no queued jobs", exact: true }).waitFor();
      const selectColors = await pathwayColors(page, testModule.base, theme, true);
      await page.keyboard.press("Escape");
      await page.getByText("Explore an illustrative claim queue", { exact: true }).click();
      const headerLinks = await page.locator("main header a").evaluateAll(elements => elements.map(element => element.getAttribute("href")));
      assert.deepEqual(headerLinks, [], "Workflow navigation belongs in the sidebar, without a duplicate header button row");
      if (width < 1024) await page.getByRole("button", { name: "Open module menu", exact: true }).click();
      assert.equal(await navigation.locator('[aria-current="page"]').getAttribute("href"), testModule.base + "/methods");
      if (width < 1024) await page.keyboard.press("Escape");
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({ path: `${directory}/${testModule.base.split("/").at(-1)}-${width}-${theme}.png`, animations: "disabled" });
      assert.equal((await page.goto(origin + testModule.base + "/test-results", { waitUntil: "domcontentloaded" })).status(), 200);
      await page.getByRole("heading", { name: testModule.results, exact: true }).waitFor();
      const resultColors = await pathwayColors(page, testModule.base, theme);
      const cards = page.locator("main article");
      const count = await cards.count();
      assert.ok(count > 0 || await page.getByRole("heading", { name: /No published|No matching/ }).count() === 1);
      const resultLinks = await cards.locator("a").evaluateAll(elements => elements.map(element => element.getAttribute("href")));
      assert.ok(resultLinks.every(href => href.startsWith(testModule.base + "/studies/")));
      if (testModule.base === paper && count > 0) paperStudyId = resultLinks[0].split("/studies/")[1];
      await page.getByRole("link", { name: "JumpServe home", exact: true }).click();
      await page.waitForURL(origin + "/");
      await page.waitForFunction(() => !document.querySelector("[data-module-theme]"));
      assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--primary").trim()), theme === "dark" ? "#45ddf5" : "#294d72");
      return { menu_links: links, page_navigation: headerLinks, published_cards: count, colors: { overview: overviewColors, menu: menuColors, methods: methodColors, select_popup: selectColors, results: resultColors }, default_palette_restored_after_client_navigation: true };
    });
    await context.close();
  }
  const context = await browser.newContext();
  const page = await context.newPage();
  await check("all module overviews and legacy namespaces", async () => {
    const evidence = [];
    for (const testModule of TEST_MODULES) {
      const response = await page.goto(origin + testModule.href, { waitUntil: "domcontentloaded" });
      assert.equal(response.status(), 200);
      assert.equal(new URL(page.url()).pathname, `/${testModule.id}`);
      await page.getByRole("heading", { name: testModule.name, exact: true }).waitFor();
      const navigation = page.locator('[data-slot="module-sidebar"]').getByRole("navigation");
      const links = await navigation.locator("a").evaluateAll(elements => elements.map(element => element.getAttribute("href")));
      assert.ok(links.every(href => href === testModule.href || href.startsWith(testModule.href + "/")));
      const suffix = testModule.sections[0].href.slice(testModule.href.length);
      for (const prefix of ["/module", "/modules"]) for (const tail of ["", suffix + "?view=results&tag=a%26b&tag=c"]) {
        const redirected = await context.request.get(origin + prefix + testModule.href + tail, { maxRedirects: 0 });
        assert.equal(redirected.status(), 308);
        assert.equal(new URL(redirected.headers().location, origin).href, origin + testModule.href + tail);
      }
      evidence.push({ id: testModule.id, canonical_path: testModule.href, menu_links: links, legacy_redirects: 4 });
    }
    const missing = await context.request.get(origin + "/unregistered-module");
    assert.equal(missing.status(), 404);
    return evidence;
  });
  await check("study downloads preserve bytes at top-level paths", async () => {
    const evidence = [];
    for (const id of ["ipv6-dns-study", "reliable-sketch-study", "http2-compliance-study"]) {
      for (const filename of await readdir(`public/${id}`)) {
        const path = `/${id}/${filename}`;
        const response = await context.request.head(origin + path);
        assert.equal(response.status(), 200);
        const bytes = (await stat(`public${path}`)).size;
        assert.equal(Number(response.headers()["content-length"]), bytes);
        const redirect = await context.request.head(origin + "/module" + path, { maxRedirects: 0 });
        assert.equal(redirect.status(), 308);
        assert.equal(new URL(redirect.headers().location, origin).pathname, path);
        evidence.push({ path, byte_count: bytes, status: 200, legacy_status: 308 });
      }
    }
    const path = "/ipv6-dns-study/data.zip";
    const response = await context.request.get(origin + path);
    assert.equal(response.status(), 200);
    const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
    const digest = sha256(await response.body());
    assert.equal(digest, sha256(await readFile(`public${path}`)));
    return { files: evidence, downloaded_archive: { path, verified_sha256: digest } };
  });
  await check("legacy idea redirects and sign-in return paths", async () => {
    const id = "aca80acc-0aee-4ee4-836d-e833d2c6bd0b";
    for (const prefix of [paper, "/module/research-verification", "/modules/research-verification"]) for (const suffix of ["/new-idea?mode=guided", `/ideas/${id}?view=gaps&tag=a%26b&tag=c`]) {
      const response = await context.request.get(origin + prefix + suffix, { maxRedirects: 0 });
      assert.equal(response.status(), 308);
      assert.equal(new URL(response.headers().location, origin).href, origin + ideas + suffix);
      await page.goto(origin + prefix + suffix, { waitUntil: "domcontentloaded" });
      const url = new URL(page.url());
      assert.equal(url.pathname, "/login");
      assert.equal(url.searchParams.get("next"), ideas + suffix);
    }
    for (const route of [paper + "/new-study", ideas + "/workspace", ideas + `/workspace/${id}?view=gaps`]) {
      await page.goto(origin + route, { waitUntil: "domcontentloaded" });
      assert.equal(new URL(page.url()).searchParams.get("next"), route);
    }
    return { legacy_status: 308, canonical_idea_module: ideas, query_and_repeated_parameters_preserved: true, actual_authentication: "Not exercised" };
  });
  await check("public snapshot and exports retain the recorded pathway", async () => {
    assert.ok(paperStudyId, "A public paper assessment is required for the read-only export check");
    const json = await context.request.get(`${origin}${paper}/api/studies/${paperStudyId}/export`);
    assert.equal(json.status(), 200);
    const snapshot = await json.json(); assert.equal(snapshot.study.id, paperStudyId); assert.notEqual(snapshot.study.study_kind, "idea");
    await page.goto(`${origin}${paper}/studies/${paperStudyId}`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: snapshot.study.title, exact: true }).waitFor();
    const detailColors = await pathwayColors(page, paper, "light");
    assert.ok(detailColors.selected_evidence_tab);
    await page.goto(origin + ideas + "/studies/invalid", { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Research assessment unavailable", exact: true }).waitFor();
    const unavailableColors = await pathwayColors(page, ideas, "light");
    const csv = await context.request.get(`${origin}${paper}/api/studies/${paperStudyId}/export?format=csv`);
    assert.equal(csv.status(), 200); assert.match(await csv.text(), /^run_id,observation_id,configuration_identity,metric,units,status,value,reason/);
    for (const suffix of [`/api/studies/${paperStudyId}/export?format=csv`, `/studies/${paperStudyId}?view=gaps&tag=a%26b`]) {
      const response = await context.request.get(origin + ideas + suffix, { maxRedirects: 0 });
      assert.equal(response.status(), 308);
      assert.equal(new URL(response.headers().location, origin).href, origin + paper + suffix);
    }
    return { study_id: paperStudyId, measurements: snapshot.records.measurements.length, formats: ["json", "csv"], incorrect_namespace_status: 308, detail_colors: detailColors, unavailable_colors: unavailableColors };
  });
  await context.close();
} catch (error) {
  if (!report.errors.some(item => item.reason === error.message)) report.errors.push({ name: "browser setup or runtime", reason: error.message });
} finally {
  if (browser) await browser.close();
  report.ended_at = new Date().toISOString(); report.passed = !report.errors.length && !report.browser_errors.length;
  await writeFile(directory + "/report.json", JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ directory, ...report }, null, 2));
  if (!report.passed) process.exitCode = 1;
}
