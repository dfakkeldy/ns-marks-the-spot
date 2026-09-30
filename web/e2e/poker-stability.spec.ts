import { expect, test } from '@playwright/test';

test('a stalled pack download offers Retry and a subsequent download recovers', async ({ page }) => {
  await page.clock.install();
  await page.route('**/poker/data.json.gz', () => {});
  await page.goto('/poker');
  await expect(page.locator('.poker-loading')).toBeVisible();
  await page.clock.fastForward(31_000);
  await expect(page.getByRole('alert')).toContainText(/timed out/i);
  await page.unroute('**/poker/data.json.gz');
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.locator('.leaflet-container')).toBeVisible();
});

test('Poker still loads without newer AbortSignal combinators', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(AbortSignal, 'any', { value: undefined }); });
  await page.goto('/poker');
  await expect(page.locator('.leaflet-container')).toBeVisible();
});

test('the loading deadline covers stalled verification and a retry can recover', async ({ page }) => {
  await page.clock.install();
  await page.addInitScript(() => {
    const digest = crypto.subtle.digest.bind(crypto.subtle);
    let first = true;
    crypto.subtle.digest = (...args) => {
      if (!first) return digest(...args);
      first = false;
      Object.assign(window, { reviewDigestPending: true });
      return new Promise<ArrayBuffer>(() => {});
    };
  });
  await page.goto('/poker');
  await expect.poll(() => page.evaluate(() => Boolean((window as unknown as { reviewDigestPending?: boolean }).reviewDigestPending))).toBe(true);
  await page.clock.fastForward(31_000);
  await expect(page.getByRole('alert')).toContainText(/timed out/i);
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.locator('.leaflet-container')).toBeVisible();
});

test('a graphics failure leaves Poker with an explanation and reload control', async ({ page }) => {
  await page.addInitScript(() => {
    HTMLCanvasElement.prototype.getContext = () => { throw Error('Graphics unavailable'); };
  });
  await page.goto('/poker');
  await expect(page.getByRole('heading', { name: 'The map stopped responding' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reload the map' })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText(/saved.*session/i);
});

test('typing an address does not redraw the regional map geometry', async ({ page }) => {
  await page.goto('/poker');
  await expect(page.locator('.leaflet-container')).toBeVisible();
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await page.evaluate(() => {
    const original = CanvasRenderingContext2D.prototype.stroke;
    Object.assign(window, { reviewStrokes: 0 });
    CanvasRenderingContext2D.prototype.stroke = function (path?: Path2D) {
      (window as unknown as { reviewStrokes: number }).reviewStrokes++;
      return Reflect.apply(original, this, path ? [path] : []);
    };
  });
  await page.getByRole('searchbox').fill('117');
  await expect(page.locator('.poker-results li')).not.toHaveCount(0);
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  expect(await page.evaluate(() => (window as unknown as { reviewStrokes: number }).reviewStrokes)).toBe(0);
});
