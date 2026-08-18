// Batch-export the ad HTMLs to 1080x1350 PNGs for Meta.
// Setup once:  npm i playwright && npx playwright install chromium
// Run:         node export-ads.mjs
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';
const dir = path.dirname(fileURLToPath(import.meta.url));
const files = ['ad-lauren-4x5','ad-coti-4x5','ad-guardrail-4x5','ad-2am-4x5','ad-callie-4x5'];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 });
for (const f of files) {
  await page.goto('file://' + path.join(dir, f + '.html'));
  await page.waitForLoadState('networkidle'); // let Google Fonts land
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(dir, f + '.png') });
  console.log('exported', f + '.png');
}
await browser.close();
