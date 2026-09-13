import { expect, test, type Locator } from '@playwright/test';
import { createCanvas } from 'canvas';

function tile(color: string) {
  const canvas = createCanvas(256, 256), ctx = canvas.getContext('2d');
  ctx.fillStyle = color; ctx.fillRect(0, 0, 256, 256);
  return canvas.toBuffer('image/png');
}
// Synthetic level terrain isolates camera/selection mechanics from DEM accuracy.
const dem = tile('rgb(128,0,0)'), background = tile('#d7dec7');
const transparent = createCanvas(256, 256).toBuffer('image/png');
test.use({ deviceScaleFactor: 3, hasTouch: true, colorScheme: 'dark', launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } });

async function expectReadable(locator: Locator) {
  const ratio = await locator.evaluate(element => {
    const style = getComputedStyle(element);
    const luminance = (color: string) => {
      const channels = color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(v => v / 255)
        .map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
      return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
    };
    const a = luminance(style.color), b = luminance(style.backgroundColor);
    return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
  });
  expect(ratio).toBeGreaterThanOrEqual(4.5);
}

for (const width of [390, 1440]) test.describe(`${width}px profile`, () => {
  test.use({ deviceScaleFactor: width === 390 ? 3 : 1, hasTouch: width === 390 });
  test(`3D parcel identify and return to 2D at ${width}px`, async ({ page }, testInfo) => {
    // Hosted software rendering is substantially slower than a desktop GPU;
    // keep individual assertions bounded while allowing the full gesture flow.
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: 900 });
    const activate = (locator: Locator) => width === 390 ? locator.tap() : locator.click();
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
    const pixels = await canvas.evaluate(element => {
      const image = element as HTMLCanvasElement;
      return image.width * image.height / (image.clientWidth * image.clientHeight);
    });
    expect(pixels).toBeLessThanOrEqual(2.25);
    await expectReadable(page.locator('.research-terrain-controls'));
    await expectReadable(page.getByRole('button', { name: 'Return to 2D', exact: true }));
    await expect.poll(async () => ({ status: await page.locator('.research-terrain-status').allTextContents(), errors }), { timeout: 25000 }).toEqual({ status: [], errors: [] });
    const settings = page.getByRole('button', { name: '3D settings', exact: true });
    await expect(page.getByRole('slider', { name: 'Map tilt', exact: true })).toBeHidden();
    expect((await page.locator('.research-terrain-controls').boundingBox())!.height).toBeLessThanOrEqual(60);
    await activate(settings);
    await test.step('Tilt, direction, touch gestures and appearance', async () => {
      const tilt = page.getByRole('slider', { name: 'Map tilt', exact: true });
      await expect(tilt).toHaveValue('50');
      const compass = page.locator('.research-terrain-map .maplibregl-ctrl-compass .maplibregl-ctrl-icon');
      const tilted = await compass.getAttribute('style');
      await tilt.press('Home');
      await expect(tilt).toHaveValue('0');
      await expect(compass).not.toHaveAttribute('style', tilted!);
      await activate(page.getByRole('button', { name: 'Rotate right', exact: true }));
      await expect(page.locator('.terrain-bearing output')).toHaveText('30°');
      await activate(page.getByRole('button', { name: 'North up', exact: true }));
      await expect(page.locator('.terrain-bearing output')).toHaveText('0°');
      await tilt.press('End');
      await expect(tilt).toHaveValue('65');
      if (width === 390) {
        // Exercise the real two-finger handler, rather than dispatching a DOM
        // event that might never reach MapLibre's gesture machinery.
        const touch = await page.context().newCDPSession(page);
        const points = (y: number) => [{ x: 95, y, id: 1 }, { x: 165, y, id: 2 }];
        await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(500) });
        for (let y = 508; y <= 580; y += 8) {
          await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(y) });
        }
        await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await expect(tilt).not.toHaveValue('65');
        await touch.detach();
      }
      await expect(page.locator(width === 390 ? '.terrain-touch-help' : '.terrain-mouse-help')).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath('terrain-dark-controls.png'), scale: 'css' });
      await page.emulateMedia({ colorScheme: 'light' });
      await expectReadable(page.locator('.research-terrain-controls'));
      await expectReadable(page.getByRole('button', { name: 'Return to 2D', exact: true }));
    });
    await test.step('Height and low-ground relief', async () => {
      await page.getByText('Terrain height', { exact: true }).click();
      const height = page.getByRole('slider', { name: /^Height exaggeration/ });
      await height.press('End'); await expect(height).toHaveValue('10');
      await height.press('Home');
      await page.getByRole('checkbox', { name: 'Separate low-ground scale' }).check();
      const low = page.getByRole('slider', { name: /^Low-ground exaggeration/ });
      await low.press('End'); await expect(low).toHaveValue('10');
      await page.getByRole('combobox', { name: 'Low-ground band' }).selectOption('100');
      await expect(page.locator('.research-terrain-status')).toHaveCount(0, { timeout: 15000 });
      await page.getByText('Terrain height', { exact: true }).click();
    });
    await activate(settings);
    await expect(page.getByRole('slider', { name: 'Map tilt', exact: true })).toBeHidden();
    await test.step('Parcel selection, short screens and return to 2D', async () => {
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
      if (width === 390) {
        for (const size of [{ width: 320, height: 568 }, { width: 844, height: 390 }]) {
          await page.setViewportSize(size);
          await activate(settings);
          await page.getByText('Terrain height', { exact: true }).click();
          await page.getByRole('slider', { name: /^Low-ground exaggeration/ }).scrollIntoViewIfNeeded();
          await expect(page.getByRole('button', { name: 'Return to 2D', exact: true })).toBeInViewport({ ratio: 1 });
          await page.screenshot({ path: testInfo.outputPath(`terrain-${size.width}x${size.height}.png`), scale: 'css' });
          await page.getByText('Terrain height', { exact: true }).click();
          await activate(settings);
        }
      }
      await page.getByRole('button', { name: 'Return to 2D', exact: true }).click();
      await expect(page.locator('.research-terrain-map')).toHaveCount(0);
      expect(await page.locator('.leaflet-map-pane').evaluate(el => getComputedStyle(el).visibility)).toBe('visible');
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
      expect(errors).toEqual([]);
    });
  });
});

test('3D names the failed source and recovers with one retry', async ({ page }) => {
  let unavailable = true;
  await page.setViewportSize({ width: 390, height: 700 });
  await page.route('https://**/*', route => {
    if (route.request().url().includes('elevation-tiles-prod')) return unavailable ? route.fulfill({ status: 503, body: 'Unavailable' }) : route.fulfill({ contentType: 'image/png', body: dem });
    if (route.request().resourceType() === 'image') return route.fulfill({ contentType: 'image/png', body: background });
    return route.fulfill({ contentType: 'text/css', body: '' });
  });
  await page.goto('/?basemap=osm&layers=modern&taxSale=off');
  await page.getByRole('button', { name: '3D terrain', exact: true }).tap();
  const status = page.locator('.research-terrain-status');
  await expect(status).toContainText('Mapzen terrain');
  await expect(status).toContainText('503');
  await expectReadable(status);
  await page.getByRole('button', { name: '3D settings', exact: true }).tap();
  await page.getByText('Terrain height', { exact: true }).click();
  await page.getByRole('slider', { name: /^Height exaggeration/ }).press('End');
  // A display-setting update cannot clear an unresolved source failure.
  await expect(status).toContainText('Mapzen terrain');
  await page.getByRole('button', { name: '3D settings', exact: true }).tap();
  await page.emulateMedia({ colorScheme: 'light' });
  await expectReadable(status);
  unavailable = false;
  await page.getByRole('button', { name: 'Retry 3D', exact: true }).tap();
  await expect(status).toHaveCount(0, { timeout: 25000 });
  await expect(page.locator('.research-terrain-map canvas')).toBeVisible();
  await page.getByRole('button', { name: 'Return to 2D', exact: true }).tap();
  await expect(status).toHaveCount(0);
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
});
