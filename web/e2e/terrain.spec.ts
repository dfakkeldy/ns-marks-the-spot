import { expect, test } from '@playwright/test';
import { createCanvas } from 'canvas';

function tile(color: string) {
  const canvas = createCanvas(256, 256), ctx = canvas.getContext('2d');
  ctx.fillStyle = color; ctx.fillRect(0, 0, 256, 256);
  return canvas.toBuffer('image/png');
}
// Synthetic level terrain isolates camera/selection mechanics from DEM accuracy.
const dem = tile('rgb(128,0,0)'), background = tile('#d7dec7');
const transparent = createCanvas(256, 256).toBuffer('image/png');
test.use({ launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } });

for (const width of [390, 1440]) test(`3D parcel identify and return to 2D at ${width}px`, async ({ page }) => {
  // Hosted software rendering is substantially slower than a desktop GPU;
  // keep individual assertions bounded while allowing the full gesture flow.
  test.setTimeout(120000);
  await page.setViewportSize({ width, height: 900 });
  await page.addInitScript(() => localStorage.setItem('ns-marks-the-spot:province-license:v1', 'accepted'));
  const errors: string[] = [], identified: number[][] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  let center = [-61.405, 45.835];
  await page.route('https://**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname === 's3.amazonaws.com') return route.fulfill({ contentType: 'image/png', body: dem });
    if (url.hostname.endsWith('tile.openstreetmap.org')) return route.fulfill({ contentType: 'image/png', body: background });
    if (url.pathname.includes('NSPRD') && url.pathname.endsWith('/query')) {
      if (url.searchParams.get('geometryType') === 'esriGeometryPoint') {
        center = url.searchParams.get('geometry')!.split(',').map(Number);
        identified.push(center);
      }
      const [x, y] = center;
      return route.fulfill({ json: { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { PID: '12345678' },
        geometry: { type: 'Polygon', coordinates: [[[x - .001, y - .001], [x + .001, y - .001], [x + .001, y + .001], [x - .001, y + .001], [x - .001, y - .001]]] } }] } });
    }
    if (url.pathname.includes('/export')) return route.fulfill({ contentType: 'image/png', body: transparent });
    if (route.request().resourceType() === 'stylesheet') return route.fulfill({ contentType: 'text/css', body: '' });
    return route.fulfill({ json: { type: 'FeatureCollection', features: [] } });
  });
  await page.goto('/?position=45.835,-61.405,15&layers=modern,nsprd&taxSale=off&basemap=osm');
  await page.getByRole('button', { name: '3D terrain', exact: true }).click();
  const canvas = page.locator('.research-terrain-map canvas');
  await expect(canvas).toBeVisible();
  await expect.poll(async () => ({ status: await page.locator('.research-terrain-status').allTextContents(), errors }), { timeout: 25000 }).toEqual({ status: [], errors: [] });
  const height = page.getByRole('slider', { name: /^Height exaggeration/ });
  await height.press('End'); await expect(height).toHaveValue('10');
  await height.press('Home');
  await page.getByRole('checkbox', { name: 'Separate low-ground scale' }).check();
  const low = page.getByRole('slider', { name: /^Low-ground exaggeration/ });
  await low.press('End'); await expect(low).toHaveValue('10');
  await page.getByRole('combobox', { name: 'Low-ground band' }).selectOption('100');
  await expect(page.locator('.research-terrain-status')).toHaveCount(0, { timeout: 15000 });
  const box = (await canvas.boundingBox())!;
  expect(box.height).toBeGreaterThan(200);
  await page.mouse.dblclick(box.x + box.width * .5, box.y + box.height * .5);
  await page.waitForTimeout(500);
  expect(identified).toHaveLength(0);
  // Offset from centre so a duplicate flat-map click would identify elsewhere.
  await page.mouse.click(box.x + box.width * .45, box.y + box.height * .55);
  await expect.poll(() => identified.length).toBe(1);
  expect(identified[0].every(Number.isFinite)).toBe(true);
  await expect(page.locator('.parcel-inspector')).toBeVisible();
  await expect(page.locator('.parcel-inspector')).toContainText('12345678');
  await page.getByRole('button', { name: 'Close parcel details', exact: true }).click();
  await page.getByRole('button', { name: 'Return to 2D', exact: true }).click();
  await expect(page.locator('.research-terrain-map')).toHaveCount(0);
  expect(await page.locator('.leaflet-map-pane').evaluate(el => getComputedStyle(el).visibility)).toBe('visible');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  expect(errors).toEqual([]);
});
