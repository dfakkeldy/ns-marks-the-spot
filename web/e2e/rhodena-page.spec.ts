import { expect, test, type Page } from '@playwright/test';

async function isolateExternal(page: Page) {
  await page.route('https://**/*', route => {
    if (route.request().resourceType() === 'image') return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e5ebde"/></svg>' });
    if (route.request().url().includes('/query') || route.request().url().includes('.geojson')) return route.fulfill({ json: { type: 'FeatureCollection', features: [] } });
    return route.fulfill({ contentType: 'text/css', body: '' });
  });
}

for (const width of [1440, 390]) test(`the /rhodena page leads with the project and checks a viewpoint at ${width}px`, async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.addInitScript(() => localStorage.setItem('ns-marks-the-spot:province-license:v1', 'accepted'));
  await isolateExternal(page);
  // basemap is not share state, so a phone still opens on the project summary.
  await page.goto('/rhodena?basemap=osm');

  await expect(page).toHaveTitle('Rhodena Wind — proposed turbine map');
  await expect(page.getByRole('heading', { level: 2, name: 'Rhodena Wind' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Rhodena Wind Project/ })).toBeAttached();
  for (const name of [/^Tax Sale/, /^My Maps/, /^Historical Maps/, /^Elections & Districts/]) {
    await expect(page.getByRole('button', { name })).toHaveCount(0);
  }
  await expect(page.getByRole('combobox', { name: 'Map setup' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Check the view from a spot' }).click();
  await expect(page.getByText('Tap the map near your home to compare all six turbines.', { exact: true })).toBeVisible({ timeout: 90000 });
  // The panel shrinks to its prompt while a place is being chosen.
  await expect(page.getByRole('combobox', { name: 'Viewshed selection' })).toBeHidden();
  const map = page.locator('.leaflet-container').first();
  const bounds = await map.boundingBox();
  await map.click({ position: { x: bounds!.width * 0.4, y: bounds!.height * 0.35 } });
  await expect(page.locator('.rhodena-viewpoint-results li')).toHaveCount(6);
  await expect(page.getByText(/This point stays in this browser/)).toBeVisible();

  const url = new URL(page.url());
  expect(url.pathname).toBe('/rhodena');
  expect(url.searchParams.get('layers')?.split(',')).toContain('rhodena-visibility');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  expect(errors).toEqual([]);
});

test('a shared /rhodena view opens on its map and links back to the full map', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await isolateExternal(page);
  await page.goto('/rhodena/?layers=modern,rhodena-turbines,mineral-tenure&taxSale=on&position=45.78,-61.4,13&basemap=osm');
  await expect(page).toHaveURL(/\/rhodena\?/);
  await expect(page.locator('.position-readout')).toContainText('45.780');
  // A shared view goes straight to the map rather than the summary sheet.
  await expect(page.getByRole('heading', { level: 2, name: 'Rhodena Wind' })).toBeHidden();
  await expect.poll(() => new URL(page.url()).searchParams.get('layers')).toBe('modern,rhodena-turbines');
  await page.getByRole('button', { name: 'Rhodena Wind — summary and layers' }).click();
  const full = new URL((await page.getByRole('link', { name: /Open this view in the full NS Marks map/ }).getAttribute('href'))!);
  expect(full.pathname).toBe('/');
  expect(full.searchParams.get('layers')).toBe('modern,rhodena-turbines');
});
