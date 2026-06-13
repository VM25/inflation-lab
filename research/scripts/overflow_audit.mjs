/**
 * Page-level horizontal-overflow audit (device-faithful + stateful).
 *
 *   1. npm run build && (cd out && python3 -m http.server 8788)
 *   2. node research/scripts/overflow_audit.mjs
 *
 * For each width it: (a) loads default, (b) opens every interactive
 * disclosure (weight editor, holdings table, all accordion items, ledger
 * toggle), (c) repeats with webfonts disabled so fallback metrics apply
 * (the "inconsistent across devices" font-race case). Reports offending
 * elements, excluding the intentional .chart-scroll / .thin-scroll areas.
 */
import puppeteer from "puppeteer-core";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = "http://localhost:8788/";
const WIDTHS = [320, 360, 390, 414, 768, 820, 912, 1024, 1280];

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "shell", args: ["--no-first-run"] });
const page = await browser.newPage();

const exercise = () =>
  page.evaluate(() => {
    const clicks = [
      ...document.querySelectorAll('#book button'),
      ...document.querySelectorAll('#notes [data-state] button, #notes button'),
    ];
    // open weight editor + holdings in Book
    document.querySelectorAll("#book button").forEach((b) => {
      if (/adjust sleeve weights|six instruments/i.test(b.textContent)) b.click();
    });
    // expand every accordion trigger in Notes
    document.querySelectorAll('#notes [class*="Accordion"] button, #notes button').forEach((b) => {
      if (b.getAttribute("aria-expanded") === "false") b.click();
    });
  });

const probe = () =>
  page.evaluate(() => {
    const de = document.documentElement;
    const clientW = de.clientWidth;
    const docW = de.scrollWidth;
    const before = window.scrollX;
    window.scrollTo(9999, window.scrollY);
    const scrolled = Math.round(window.scrollX);
    window.scrollTo(before, window.scrollY);
    const offenders = [];
    if (docW > clientW + 0.5 || scrolled > 0) {
      for (const el of document.querySelectorAll("body *")) {
        if (el.closest(".chart-scroll") || el.closest(".thin-scroll")) continue;
        const r = el.getBoundingClientRect();
        if (r.right > clientW + 0.5 || r.left < -0.5) {
          offenders.push({
            tag: el.tagName.toLowerCase(),
            cls: (el.getAttribute("class") || "").slice(0, 60),
            id: el.id || "",
            sec: (el.closest("section")?.id) || "",
            right: Math.round(r.right * 10) / 10,
            w: Math.round(r.width),
            txt: (el.textContent || "").trim().slice(0, 24),
          });
        }
      }
    }
    return { clientW, docW, scrolled, offenders };
  });

let allClean = true;
const report = (label, res) => {
  const bad = res.docW > res.clientW + 0.5 || res.scrolled > 0;
  if (bad) allClean = false;
  console.log(`  ${label.padEnd(26)} ${bad ? "OVERFLOW" : "ok"} client=${res.clientW} scrollW=${res.docW} panned=${res.scrolled}`);
  if (bad) {
    const seen = new Set();
    res.offenders.sort((a, b) => b.right - a.right)
      .filter((o) => { const k = `${o.sec}.${o.tag}.${o.cls}`; if (seen.has(k)) return false; seen.add(k); return true; })
      .slice(0, 6)
      .forEach((o) => console.log(`      §${o.sec} right=${o.right} w=${o.w} <${o.tag}${o.id ? "#" + o.id : ""} "${o.cls}"> "${o.txt}"`));
  }
};

for (const w of WIDTHS) {
  console.log(`\n[${w}px]`);
  // pass 1: webfonts on, default state
  await page.setViewport({ width: w, height: 880, isMobile: w < 500, hasTouch: w < 900 });
  await page.goto(BASE, { waitUntil: "networkidle0" });
  await page.waitForSelector("#notes");
  await new Promise((r) => setTimeout(r, 300));
  report("default", await probe());

  // pass 2: same, all disclosures open
  await exercise();
  await new Promise((r) => setTimeout(r, 250));
  report("all-disclosures-open", await probe());

  // pass 3: webfonts disabled (fallback metrics), default
  await page.setRequestInterception(true);
  const block = (req) => {
    if (/fonts\.g|\.woff|\.ttf|\.otf/.test(req.url())) req.abort();
    else req.continue();
  };
  page.on("request", block);
  await page.goto(BASE, { waitUntil: "networkidle0" });
  await page.waitForSelector("#notes");
  await new Promise((r) => setTimeout(r, 300));
  report("fallback-fonts", await probe());
  await exercise();
  await new Promise((r) => setTimeout(r, 250));
  report("fallback + disclosures", await probe());
  page.off("request", block);
  await page.setRequestInterception(false);
}

console.log(`\n${allClean ? "ALL CLEAN (states + fallback fonts)" : "OVERFLOW PRESENT"}`);
await browser.close();
