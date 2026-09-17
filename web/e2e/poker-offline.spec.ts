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
