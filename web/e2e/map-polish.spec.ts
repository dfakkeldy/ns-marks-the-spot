import { expect, test } from '@playwright/test';

for (const width of [390, 1440]) test(`appearance is independent of basemap at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('https://**/*', route => {
    if (route.request().resourceType() === 'image') return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#d4dfc8"/></svg>' });
    return route.fulfill({ contentType: 'text/css', body: '' });
  });
  await page.goto('/?layers=modern&taxSale=off&basemap=osm');
  await expect(page).toHaveTitle(/NS Marks The Spot/);
  await expect(page.locator('.app-header')).toHaveCount(0);
  if (width === 390) await page.getByRole('button', { name: 'Search & layers', exact: true }).click();
  const appearance = page.getByRole('combobox', { name: 'Interface appearance' });
  await appearance.selectOption('night');
  await expect(page.locator('html')).toHaveAttribute('data-map-appearance', 'night');
  await expect(page.locator('.layer-rail')).toHaveCSS('color', 'rgb(232, 241, 240)');
  await page.reload();
  if (width === 390) await page.getByRole('button', { name: 'Search & layers', exact: true }).click();
  await expect(appearance).toHaveValue('night');
  await appearance.selectOption('day');
  await expect(page.locator('html')).toHaveAttribute('data-map-appearance', 'day');
  expect(new URL(page.url()).searchParams.get('basemap')).toBe('osm');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  expect(errors).toEqual([]);
});
