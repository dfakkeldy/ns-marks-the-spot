import { expect, test, type Page } from '@playwright/test';

/** The page's own files are served locally; everything off-site gets an empty answer. */
async function isolateExternal(page: Page) {
  await page.route('https://**/*', route => {
    if (route.request().resourceType() === 'image') return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e5ebde"/></svg>' });
    const url = route.request().url();
    if (url.includes('/query') || url.includes('.geojson') || url.includes('/items') || url.includes('/resource/')) return route.fulfill({ json: { type: 'FeatureCollection', features: [] } });
    return route.fulfill({ contentType: 'text/css', body: '' });
  });
}

function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  return errors;
}

for (const width of [1440, 390]) test(`the /pointtupper page shows its sourced summary, key places, turbines and map key at ${width}px`, async ({ page }) => {
  test.setTimeout(90000);
  const phone = width === 390;
  await page.setViewportSize({ width, height: phone ? 844 : 900 });
  const errors = collectErrors(page);
  await isolateExternal(page);
  // basemap is not share state, so a phone still opens on the page summary.
  await page.goto('/pointtupper?basemap=osm');

  await expect(page).toHaveTitle('Point Tupper — data-centre site brief');
  await expect(page.getByRole('heading', { level: 2, name: 'Point Tupper' })).toBeVisible();
  await expect(page.getByText('Built by Dan Fakkeldy with Claude Code, from public sources.', { exact: true })).toBeVisible();
  await expect(page.getByText(/campus footprint has not been published/).first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Every source, and what it supports' })).toHaveAttribute('href', /\/docs\/point-tupper-sources\.md$/);
  await expect(page.getByRole('heading', { level: 2, name: 'Seventy years on the Strait' })).toBeAttached();
  for (const name of [/^Tax Sale/, /^My Maps/, /^Historical Maps/, /^Elections & Districts/]) {
    await expect(page.getByRole('button', { name })).toHaveCount(0);
  }
  await expect(page.getByRole('combobox', { name: 'Map setup' })).toHaveCount(0);

  // The opening view holds the jetty, the generating station and Landrie Lake.
  await expect(page.locator('.leaflet-context-point-tupper-sites-pane .leaflet-interactive')).toHaveCount(3);
  await expect(page).toHaveURL(/layers=[^&]*point-tupper-sites/);
  await expect(page).toHaveURL(/layers=[^&]*transmission-lines/);
  await expect(page).toHaveURL(/layers=[^&]*canadian-wind-turbines/);
  await expect(page).toHaveURL(/layers=[^&]*planned-wind-turbines/);
  // Goose Harbour Lake's turbines, across the Strait, are in every opening view.
  await expect.poll(() => page.locator('.leaflet-context-planned-wind-turbines-pane .context-marker-turbine').count()).toBeGreaterThan(0);

  // The map key: open on a desktop, folded on a phone; each row switches its layer.
  const key = page.getByRole('complementary', { name: 'Map key' });
  const keyToggle = key.getByRole('button', { name: 'Map key' });
  await expect(keyToggle).toHaveAttribute('aria-expanded', phone ? 'false' : 'true');
  if (!phone) {
    await expect(key.getByRole('button', { name: /Wind turbines, planned/ })).toHaveAttribute('aria-pressed', 'true');
    // Rows keep their height as status lines arrive, so a press lands on the row it aimed at.
    await key.getByRole('button', { name: /Transmission lines/ }).click();
    await expect(key.getByRole('button', { name: /Transmission lines/ })).toHaveAttribute('aria-pressed', 'false');
    await expect(page).not.toHaveURL(/layers=[^&]*transmission-lines/);
    await expect(key.getByRole('button', { name: /Property lines/ })).toContainText('Needs the Province licence');
  }

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  expect(errors).toEqual([]);
});
