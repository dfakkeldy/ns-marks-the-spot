import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
const pack = JSON.parse(gunzipSync(readFileSync(new URL('../public/poker/data.json.gz', import.meta.url))).toString());
const record = pack.addresses.find((a: { civic: unknown; mailing: { postalCode: string } }) => a.civic && a.mailing.postalCode === 'B0E1P0');
for (const viewport of [{width:390,height:844},{width:320,height:568},{width:844,height:390},{width:1440,height:1000}]) {
  test(`short Poker URL restores address, trace and offline map at ${viewport.width}`, async ({page,context}, info) => {
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if(m.type()==='error') errors.push(m.text()); });
    await page.goto('/poker');
    await expect(page).toHaveTitle('Poker — address & driveway map');
    await expect(page.locator('.poker-map .leaflet-container')).toBeVisible();
    const input = page.getByRole('searchbox',{name:'Search civic address'});
    await input.fill(`${record.mailing.number} ${record.mailing.street}`);
    await page.locator('.poker-results li button').filter({hasText:record.mailing.city}).filter({hasText:record.mailing.number}).first().click();
    await expect(page.locator('.poker-number').first()).toBeVisible();
    const map = page.locator('.poker-map .leaflet-container');
    const box = (await map.boundingBox())!;
    await map.click({position:{x:box.width*.4,y:box.height*.4}});
    await map.click({position:{x:box.width*.6,y:box.height*.6}});
    await page.getByRole('button',{name:'Finish',exact:true}).click();
    const readout = (await page.locator('.poker-readout').textContent())!;
    const session = await page.evaluate(() => JSON.parse(localStorage.getItem('ns-marks:poker:v1')!));
    expect(session.points).toHaveLength(2); expect(session.finished).toBe(true);
    await page.getByRole('button',{name:'Save offline',exact:true}).click();
    await expect(page.locator('.poker-connection')).toContainText('Saved for offline use',{timeout:45000});
    await expect(page).toHaveURL(/\/poker$/);
    // Repair a partially evicted download using the unchanged installed worker.
    await page.evaluate(async () => {
      const name = (await caches.keys()).find(name => name.startsWith('ns-poker-'))!;
      const cache = await caches.open(name);
      for (const request of await cache.keys()) if (request.url.endsWith('/poker/source.json')) await cache.delete(request);
    });
    await page.getByRole('button', {name:'Update offline copy'}).click();
    await expect(page.locator('.poker-notice')).toContainText('Saved offline', {timeout:45000});
    // A present but mismatched data/receipt pair must also be detected and repaired.
    await page.evaluate(async () => {
      const name = (await caches.keys()).find(name => name.startsWith('ns-poker-'))!;
      const cache = await caches.open(name);
      const request = (await cache.keys()).find(request => request.url.endsWith('/poker/source.json'))!;
      await cache.put(request, new Response(JSON.stringify({ sha256: 'bad', decodedSha256: 'bad', totalAddresses: 0 })));
    });
    await page.reload();
    await expect(page.getByRole('alert')).toContainText('Saved address files do not match');
    await page.getByRole('button', {name:/^(Save offline|Update offline copy)$/}).click();
    await expect(page.locator('.poker-notice')).toContainText('Saved offline', {timeout:45000});
    await expect(page.locator('.poker-map .leaflet-container')).toBeVisible();
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('.poker-connection')).toContainText('Offline · using saved Atlas');
    await expect(input).toHaveValue(session.query);
    await expect(page.locator('.poker-readout')).toHaveText(readout);
    await expect(page.locator('.poker-number').first()).toBeVisible();
    const reopened = await page.evaluate(() => JSON.parse(localStorage.getItem('ns-marks:poker:v1')!));
    expect(reopened.points).toEqual(session.points); expect(reopened.center[0]).toBeCloseTo(session.center[0],4); expect(reopened.zoom).toBe(session.zoom);
    await input.fill('B0E2W0');
    await expect(page.locator('.poker-results')).toContainText('PORT HOOD');
    await page.getByRole('button',{name:'Close results'}).click();
    await page.screenshot({path:info.outputPath('poker-offline.png')});
    await page.getByRole('button',{name:'Clear trace'}).click();
    await page.reload();
    await expect(page.getByRole('button',{name:'Undo point'})).toBeDisabled();
    await page.goto('/poker/');
    await expect(page).toHaveTitle('Poker — address & driveway map');
    await expect(page.getByRole('searchbox',{name:'Search civic address'})).toBeVisible();
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

test('aerial preference survives refresh, retains its licence gate, and is never saved offline', async ({page,context}) => {
  let requests = 0;
  await page.route('https://nsgiwa.novascotia.ca/**', route => {
    requests++;
    return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#ccd2bb"/></svg>'});
  });
  await page.goto('/poker');
  await expect(page.locator('.poker-map .leaflet-container')).toBeVisible();
  await page.getByRole('button',{name:'Aerial (online)',exact:true}).click();
  await expect(page.getByRole('dialog')).toContainText('Provincial aerial imagery');
  expect(requests).toBe(0);
  await page.getByRole('button',{name:'Accept and show aerial'}).click();
  await expect.poll(() => requests).toBeGreaterThan(0);
  await page.reload();
  await expect(page.getByRole('button',{name:'Use Atlas map'})).toBeVisible();
  await page.getByRole('button',{name:'Save offline',exact:true}).click();
  await expect(page.locator('.poker-connection')).toContainText('Saved for offline use',{timeout:45000});
  await page.waitForLoadState('networkidle');
  expect(await page.evaluate(async () => {
    const names = (await caches.keys()).filter(name=>name.startsWith('ns-poker-'));
    const urls = (await Promise.all(names.map(async name => (await (await caches.open(name)).keys()).map(request=>request.url)))).flat();
    return urls.some(url=>url.includes('nsgiwa.novascotia.ca'));
  })).toBe(false);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('.poker-map .leaflet-container')).toBeVisible();
  await expect(page.getByRole('button',{name:'Aerial (online)',exact:true})).toBeDisabled();
});
