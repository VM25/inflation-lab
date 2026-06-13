/**
 * Capture section screenshots of the built static site for the README.
 *
 *   1. npm run build && (cd out && python3 -m http.server 8788)
 *   2. node research/scripts/capture_screenshots.mjs
 */
import puppeteer from "puppeteer-core";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = "http://localhost:8788/";

const SHOTS = [
  { id: null, file: "01_overview.png", height: 940 },
  { id: "event", file: "03_curve_shock.png", height: 1150 },
  { id: "book", file: "04_portfolio.png", height: 860 },
  { id: "damage", file: "05_shock_engine.png", height: 820 },
  { id: "gap", file: "06_repricing.png", height: 700 },
  { id: "hedge", file: "07_hedge_overlay.png", height: 1000 },
  { id: "ledger", file: "08_attribution.png", height: 880 },
  { id: "beyond", file: "09_stochastic_var.png", height: 1150 },
  { id: "notes", file: "10_methodology.png", height: 860 },
];

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "shell",
  args: ["--force-prefers-reduced-motion", "--hide-scrollbars"],
});

const page = await browser.newPage();
for (const shot of SHOTS) {
  // deviceScaleFactor 2 = retina-crisp README images
  await page.setViewport({ width: 1440, height: shot.height, deviceScaleFactor: 2 });
  await page.goto(BASE, { waitUntil: "networkidle0" });
  await page.waitForSelector("#notes", { timeout: 20000 });
  if (shot.id) {
    await page.evaluate((id) => {
      document.getElementById(id).scrollIntoView({ behavior: "instant" });
    }, shot.id);
  }
  await new Promise((r) => setTimeout(r, 900));
  await page.screenshot({ path: `assets/screenshots/${shot.file}` });
  console.log("captured", shot.file);
}

await browser.close();
