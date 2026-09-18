import { test, expect } from '@playwright/test';

const position = { latitude: 45.9, longitude: -61.46, accuracy: 18 };
for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 1000 }]) {
  test(`locate centres the map without changing the selected address or trace at ${viewport.width}`, async ({ page, context }, info) => {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation(position);
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/poker');
    await expect(page.locator('.poker-map .leaflet-container')).toBeVisible();
    const locate = page.getByRole('button', { name: 'Use my location', exact: true });
    await expect(locate).toBeInViewport({ ratio: 1 });
    await expect(page.locator('.poker-location-label')).toHaveCount(0);
    await page.getByRole('searchbox').fill('117 Gussieville');
    await page.locator('.poker-results li button').click();
    const map = page.locator('.poker-map .leaflet-container');
    await map.click({ position: { x: 180, y: 300 } });
    await map.click({ position: { x: 220, y: 330 } });
    const before = await page.evaluate(() => JSON.parse(localStorage.getItem('ns-marks:poker:v1')!));
    await locate.click();
    await expect(page.locator('.poker-location-label')).toContainText('Last located here · ±18 m');
    await expect(page.locator('.poker-location-label')).toBeInViewport({ ratio: 1 });
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('ns-marks:poker:v1')!).center[0])).toBeCloseTo(position.latitude, 4);
    const after = await page.evaluate(() => JSON.parse(localStorage.getItem('ns-marks:poker:v1')!));
    expect(after.center[0]).toBeCloseTo(position.latitude, 4);
    expect(after.center[1]).toBeCloseTo(position.longitude, 4);
    expect(after.zoom).toBeGreaterThanOrEqual(17);
    expect(after.selectedId).toBe(before.selectedId);
    expect(after.query).toBe(before.query);
    expect(after.points).toEqual(before.points);
    await page.screenshot({ path: info.outputPath('poker-location.png') });
    await page.reload();
    await expect(map).toBeVisible();
    await expect(page.locator('.poker-location-label')).toHaveCount(0);
    await context.setGeolocation({ ...position, latitude: 45.901 });
    await locate.click();
    await expect(page.locator('.poker-location-label')).toBeVisible();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('ns-marks:poker:v1')!).center[0])).toBeCloseTo(45.901, 4);
    const refreshed = await page.evaluate(() => JSON.parse(localStorage.getItem('ns-marks:poker:v1')!));
    expect(refreshed.center[0]).toBeCloseTo(45.901, 4);
    expect(refreshed.points).toEqual(before.points);
    expect(errors).toEqual([]);
  });
}


test('saved offline Poker can request a fresh location', async ({ page, context, browserName }) => {
  // https://playwright.dev/docs/service-workers — SW testing is Chromium-only.
  test.skip(browserName !== 'chromium', 'Playwright service-worker offline navigation is supported only in Chromium.');
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation(position);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/poker');
  await expect(page.locator('.poker-map .leaflet-container')).toBeVisible();
  await page.getByRole('button', { name: 'Map options', exact: true }).click();
  await page.getByRole('button', { name: 'Save offline', exact: true }).click();
  await expect(page.locator('.poker-connection')).toContainText('Saved for offline use', { timeout: 45000 });
  await context.setOffline(true);
  await page.reload();
  const locate = page.getByRole('button', { name: 'Use my location', exact: true });
  await expect(locate).toBeEnabled();
  await expect(page.locator('.poker-location-label')).toHaveCount(0);
  await locate.click();
  await expect(page.locator('.poker-location-label')).toContainText('Last located here · ±18 m');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('ns-marks:poker:v1')!).center[0])).toBeCloseTo(position.latitude, 4);
});

for (const [code, message] of [[1, 'Location access is blocked'], [2, 'Your device could not find a location'], [3, 'Getting your location timed out']] as const) {
  test(`location failure ${code} explains the problem and permits retry`, async ({ page }) => {
    await page.addInitScript(code => {
      navigator.geolocation.getCurrentPosition = (_success, error) => error?.({ code, message: 'Test failure' } as GeolocationPositionError);
    }, code);
    await page.goto('/poker');
    const locate = page.getByRole('button', { name: 'Use my location', exact: true });
    await expect(locate).toBeEnabled();
    await locate.click();
    await expect(page.locator('.poker-location-notice')).toContainText(message);
    await expect(locate).toBeEnabled();
    await expect(page.locator('.poker-location-label')).toHaveCount(0);
  });
}

test('unsupported location and outside-pack positions do not move the map', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 44.65, longitude: -63.57 });
  await page.goto('/poker');
  const locate = page.getByRole('button', { name: 'Use my location', exact: true });
  await expect(locate).toBeEnabled();
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('ns-marks:poker:v1')!).center);
  await locate.click();
  await expect(page.locator('.poker-location-notice')).toContainText('outside Poker’s saved map area');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ns-marks:poker:v1')!).center)).toEqual(before);
  await page.evaluate(() => Object.defineProperty(navigator, 'geolocation', { value: undefined }));
  await locate.click();
  await expect(page.locator('.poker-location-notice')).toContainText('Location is not available in this browser');
  await expect(locate).toBeEnabled();
});

test('location starts only on tap and a late fix does not override a new address selection', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.geolocation.getCurrentPosition = success => {
      document.documentElement.dataset.locationRequested = 'yes';
      window.addEventListener('poker-test-fix', () => success({
        coords: { latitude: 45.9, longitude: -61.46, accuracy: 18, altitude: null }, timestamp: Date.now(),
      } as GeolocationPosition), { once: true });
    };
  });
  await page.goto('/poker');
  const locate = page.getByRole('button', { name: 'Use my location', exact: true });
  await expect(locate).toBeEnabled();
  expect(await page.locator('html').getAttribute('data-location-requested')).toBeNull();
  await locate.click();
  await expect(locate).toBeDisabled();
  await expect(page.locator('.poker-location-notice')).toContainText('Finding your location');
  await page.getByRole('searchbox').fill('117 Gussieville');
  await page.locator('.poker-results li button').click();
  const selected = await page.evaluate(() => JSON.parse(localStorage.getItem('ns-marks:poker:v1')!));
  await page.evaluate(async () => {
    window.dispatchEvent(new Event('poker-test-fix'));
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
  await expect(locate).toBeEnabled();
  await expect(page.locator('.poker-location-label')).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ns-marks:poker:v1')!).center)).toEqual(selected.center);
});
