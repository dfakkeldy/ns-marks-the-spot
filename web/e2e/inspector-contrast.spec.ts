import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

for (const width of [390, 1440]) {
  for (const appearance of ['day', 'night', 'fletcher', 'handdrawn']) {
    test(`inspector evidence stays readable and header seals scroll edge: ${appearance} ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.setContent(`<html data-map-appearance="${appearance}"><head><style>${css}</style></head><body>
        <aside class="parcel-inspector" style="height:600px">
          <header class="inspector-header"><h2>PID 50233139</h2><button class="inspector-close">×</button></header>
          ${['assessment-evidence', 'mapped-context', 'mapped-context-status', 'parcel-resources', 'flood-hazard-evidence', 'historical-outcome-card'].map(name => `<section class="${name}"><h3>Evidence</h3><p class="assessment-match">Source match</p><div class="assessment-account"><h4>AAN 09143726</h4><dl><dt>Assessed value</dt><dd>$421,600</dd></dl></div><p class="assessment-source"><a href="#source">Source and licence</a></p></section>`).join('')}
          <div style="height:1000px"></div>
        </aside></body></html>`);
      // Use actual computed colours, including inherited tokens and links.
      const ratios = await page.locator('section').evaluateAll(cards => {
        const channels = (color: string) => color.match(/[\d.]+/g)!.slice(0, 3).map(Number);
        const luminance = (rgb: number[]) => rgb.map(v => { const c = v / 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; }).reduce((sum, c, i) => sum + c * [.2126, .7152, .0722][i], 0);
        return cards.flatMap(card => {
          const bg = luminance(channels(getComputedStyle(card).backgroundColor));
          return [...card.querySelectorAll('h3, p, h4, dt, dd, a')].map(el => {
            const fg = luminance(channels(getComputedStyle(el).color));
            return (Math.max(bg, fg) + .05) / (Math.min(bg, fg) + .05);
          });
        });
      });
      expect(Math.min(...ratios)).toBeGreaterThanOrEqual(4.5);
      await page.locator('.parcel-inspector').evaluate(el => { el.scrollTop = 300; });
      const panel = (await page.locator('.parcel-inspector').boundingBox())!;
      const header = (await page.locator('.inspector-header').boundingBox())!;
      expect(Math.abs(header.y - panel.y - 1)).toBeLessThanOrEqual(1);
      await expect(page.locator('.inspector-close')).toBeInViewport();
    });
  }
}
