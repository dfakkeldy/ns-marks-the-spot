import { expect, test } from '@playwright/test';
import { createCanvas } from 'canvas';

const revision = 'fletcher-full-sheets-20260913.1';
// Transport fixture: the real R2 pixels are checked separately during publication.
const canvas = createCanvas(256, 256);
const context = canvas.getContext('2d');
context.fillStyle = '#dccca1'; context.fillRect(0, 0, 256, 256);
const png = canvas.toBuffer('image/png');

for (const width of [390, 1440]) test(`Fletcher mosaic stays single and overzooms at ${width}px`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 900 });
  const requests: string[] = [], errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('https://**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname === 'tiles.kinnokilabs.com' && /fletcher-/.test(url.pathname)) requests.push(url.pathname);
    if (route.request().resourceType() === 'image') return route.fulfill({ contentType: 'image/png', body: png });
    if (route.request().resourceType() === 'stylesheet') return route.fulfill({ contentType: 'text/css', body: '' });
    return route.fulfill({ json: { type: 'FeatureCollection', features: [] } });
  });
  await page.goto('/?layers=fletcher&basemap=osm&taxSale=off&position=46.095,-61.35,14');
  const tiles = page.locator(`img.leaflet-tile[src*="/${revision}/"]`);
  await expect.poll(() => tiles.count()).toBeGreaterThan(0);
  await expect.poll(() => tiles.evaluateAll(images => images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth === 256))).toBe(true);
  const layer = page.locator('.leaflet-tile-pane > .leaflet-layer').filter({ has: tiles });
  await expect(layer).toHaveCount(1);
  if (width === 390) await page.getByRole('button', { name: 'Search & layers', exact: true }).click();
  await page.getByRole('button', { name: /Historical Maps/ }).click();
  const beforeOpacity = requests.length;
  await page.locator('#fletcher-opacity').press('Home');
  await expect(layer).toHaveCSS('opacity', '0.15');
  expect(requests.length).toBe(beforeOpacity);
  if (width === 390) await page.keyboard.press('Escape');
  const mapPane = page.locator('.leaflet-map-pane');
  for (const zoom of [15, 16, 17]) {
    // The URL can update while Leaflet is still animating. A second click in
    // that interval is ignored, so wait for the rendered camera to settle.
    await expect(mapPane).not.toHaveClass(/leaflet-zoom-anim/);
    await page.locator('.leaflet-control-zoom-in').click();
    await expect.poll(() => new URL(page.url()).searchParams.get('position')?.split(',')[2]).toBe(String(zoom));
    await expect(mapPane).not.toHaveClass(/leaflet-zoom-anim/);
  }
  await expect(layer).toHaveCount(1);
  expect(requests.length).toBeGreaterThan(0);
  expect(requests.every(path => path.startsWith(`/${revision}/`) && !path.includes('/sheet-'))).toBe(true);
  expect(requests.every(path => Number(path.split('/')[2]) <= 15)).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath(`fletcher-mosaic-${width}.png`) });
});
