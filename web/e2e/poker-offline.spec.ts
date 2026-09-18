import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
const pack = JSON.parse(gunzipSync(readFileSync(new URL('../public/poker/data.json.gz', import.meta.url))).toString());
const record = pack.addresses.find((a: { civic: unknown; mailing: { postalCode: string } }) => a.civic && a.mailing.postalCode === 'B0E1P0');
async function openOptions(page: Page) {
  await page.getByRole('button', {name:'Map options', exact:true}).click();
}
async function closeOptions(page: Page) {
  await page.getByRole('button', {name:'Close map options', exact:true}).click();
}
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
    expect(box.height).toBeGreaterThanOrEqual(viewport.height - 1);
    expect(box.width).toBe(viewport.width);
    await expect(page.getByRole('button', {name:'Map options',exact:true})).toBeInViewport({ratio:1});
    await expect(page.getByRole('button', {name:'Finish',exact:true})).toBeInViewport({ratio:1});
    await expect(page.locator('.poker-measurement')).toHaveCSS('position','absolute');
    await expect(page.locator('.poker-header,.poker-selected')).toHaveCount(0);
    await map.click({position:{x:box.width*.4,y:box.height*.4}});
    await map.click({position:{x:box.width*.6,y:box.height*.6}});
    await page.getByRole('button',{name:'Finish',exact:true}).click();
    const readout = (await page.locator('.poker-readout').textContent())!;
    await expect(page.locator('.poker-distance')).toContainText('m');
    await expect(page.locator('.poker-distance')).toBeInViewport({ratio:1});
    const session = await page.evaluate(() => JSON.parse(localStorage.getItem('ns-marks:poker:v1')!));
    expect(session.points).toHaveLength(2); expect(session.finished).toBe(true);
    await openOptions(page);
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
    await openOptions(page);
    await page.getByRole('button', {name:/^(Save offline|Update offline copy)$/}).click();
    await expect(page.locator('.poker-notice')).toContainText('Saved offline', {timeout:45000});
    await expect(page.locator('.poker-map .leaflet-container')).toBeVisible();
    await closeOptions(page);
    await context.setOffline(true);
    await page.reload();
    await openOptions(page);
    await expect(page.locator('.poker-connection')).toContainText('Offline · using saved Atlas');
    await closeOptions(page);
    await expect(input).toHaveValue(session.query);
    await expect(page.locator('.poker-readout')).toHaveText(readout);
    await expect(page.locator('.poker-number').first()).toBeVisible();
    const reopened = await page.evaluate(() => JSON.parse(localStorage.getItem('ns-marks:poker:v1')!));
    expect(reopened.points).toEqual(session.points); expect(reopened.center[0]).toBeCloseTo(session.center[0],4); expect(reopened.zoom).toBe(session.zoom);
    await input.fill('B0E2W0');
    await expect(page.locator('.poker-results')).toContainText('PORT HOOD');
    await page.getByRole('button',{name:'Close results'}).click();
    await openOptions(page);
    await expect(page.getByRole('dialog', {name:'Poker', exact:true})).toBeInViewport({ratio:1});
    await page.getByRole('combobox', {name:'Postal area'}).selectOption('B0E1P0');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('.poker-results')).toContainText('JUDIQUE');
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
  await openOptions(page);
  await page.getByRole('button',{name:'Save offline',exact:true}).click();
  await expect(page.locator('.poker-connection')).toContainText('Saved for offline use',{timeout:45000});
  await closeOptions(page);
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

test('one tap retries aerial imagery after a source failure', async ({page}) => {
  let failing = true;
  await page.addInitScript(() => localStorage.setItem('ns-marks-the-spot:province-license:v1','accepted'));
  await page.route('https://nsgiwa.novascotia.ca/**', route => failing
    ? route.fulfill({status:503,body:'Unavailable'})
    : route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"/>'}));
  await page.goto('/poker');
  await expect(page.locator('.poker-map .leaflet-container')).toBeVisible();
  await page.getByRole('button',{name:'Aerial (online)',exact:true}).click();
  await expect(page.locator('.poker-map-notice')).toContainText('Aerial imagery unavailable');
  failing = false;
  await page.getByRole('button',{name:'Aerial (online)',exact:true}).click();
  await expect(page.getByRole('button',{name:'Use Atlas map'})).toBeVisible();
  await expect(page.locator('.poker-map-notice')).toHaveCount(0);
});

test('search results cover zoom controls with the phone keyboard open', async ({page}) => {
  await page.setViewportSize({width:390,height:340});
  await page.goto('/poker');
  await page.locator('.leaflet-container').waitFor();
  await page.getByRole('searchbox').fill(`${record.mailing.number} ${record.mailing.street}`);
  const result = page.locator('.poker-results li button').first();
  await expect(result).toBeVisible();
  const zoom = (await page.locator('.leaflet-control-zoom').boundingBox())!;
  const row = (await result.boundingBox())!;
  const top = Math.max(zoom.y, row.y), bottom = Math.min(zoom.y + zoom.height, row.y + row.height);
  expect(bottom).toBeGreaterThan(top);
  const point = {x: Math.max(zoom.x,row.x) + 12, y:(top + bottom)/2};
  expect(await page.evaluate(p => Boolean(document.elementFromPoint(p.x,p.y)?.closest('.poker-results')),point)).toBe(true);
  await page.mouse.click(point.x,point.y);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('ns-marks:poker:v1')!).selectedId)).toBe(record.mailing.id);
});

test('Finish exposes the distance label for endpoints near the top and side', async ({page}) => {
  await page.setViewportSize({width:390,height:640});
  await page.goto('/poker');
  const map = page.locator('.leaflet-container');
  await map.waitFor();
  await page.getByRole('searchbox').fill(`${record.mailing.number} ${record.mailing.street}`);
  await page.locator('.poker-results li button').first().click();
  await expect(page.locator('.poker-number').first()).toBeVisible();
  for (const end of [{x:387,y:230},{x:195,y:62}]) {
    await map.click({position:{x:190,y:300}});
    await map.click({position:end});
    await page.getByRole('button',{name:'Finish',exact:true}).click();
    const label = page.locator('.poker-distance:has(strong)');
    await expect(label).toBeInViewport({ratio:1});
    await expect.poll(async () => {
      const box = (await label.boundingBox())!;
      const zoom = (await page.locator('.leaflet-control-zoom').boundingBox())!;
      return box.x >= 7 && box.x + box.width <= 383 && box.y >= zoom.y + zoom.height + 7;
    }).toBe(true);
    await page.getByRole('button',{name:'Clear trace'}).click();
  }
});

for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 1000 }]) {
  test(`117 Gussieville civic-only search, selection and offline restore at ${viewport.width}`, async ({ page, context }, info) => {
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/poker');
    await expect(page).toHaveTitle('Poker — address & driveway map');
    await expect(page.locator('.poker-map .leaflet-container')).toBeVisible();
    const input = page.getByRole('searchbox', { name: 'Search civic address' });
    await input.fill('117 gussieville');
    const result = page.locator('.poker-results li button');
    await expect(result).toHaveCount(1);
    await expect(result).toContainText('117 Gussieville Rd, Judique North');
    await expect(result).toContainText('Provincial civic address · postal code unverified');
    await expect(result).toContainText('Approx. Location on Parcel');
    await expect(result).toBeEnabled();
    await page.getByRole('button', { name: 'Close results' }).click();
    await openOptions(page);
    await page.getByRole('combobox', { name: 'Postal area' }).selectOption('B0E1P0');
    await input.fill('117 Gussieville Road');
    await expect(result).toHaveCount(1);
    await expect(page.locator('.poker-results')).toContainText('Also showing regional civic addresses with unverified postal codes.');
    await expect(result).toBeInViewport({ ratio: 1 });
    await page.screenshot({ path: info.outputPath('gussieville-search.png') });
    await result.click();
    const civic = pack.civic.find((a: { pntid: string }) => a.pntid === '400216889');
    const selectedId = `civic:${civic.pntid}:${civic.label}`;
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('ns-marks:poker:v1')!).selectedId)).toBe(selectedId);
    const session = await page.evaluate(() => JSON.parse(localStorage.getItem('ns-marks:poker:v1')!));
    expect(session.zoom).toBe(18);
    expect(session.center[0]).toBeCloseTo(civic.coordinates[1], 4);
    expect(session.center[1]).toBeCloseTo(civic.coordinates[0], 4);
    await expect(page.locator('.poker-number').filter({ hasText: /^117$/ })).toBeVisible();
    await openOptions(page);
    await page.getByRole('button', { name: 'Save offline', exact: true }).click();
    await expect(page.locator('.poker-connection')).toContainText('Saved for offline use', { timeout: 45000 });
    await closeOptions(page);
    await context.setOffline(true);
    await page.reload();
    await expect(input).toHaveValue(civic.label);
    await expect(page.locator('.poker-number').filter({ hasText: /^117$/ })).toBeVisible();
    await input.fill('117 Guss');
    await expect(result).toHaveCount(1);
    await result.click();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('ns-marks:poker:v1')!).selectedId)).toBe(selectedId);
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 1000 }]) {
  test(`Finish prepares the next search without clearing the completed trace at ${viewport.width}`, async ({ page }, info) => {
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/poker');
    const map = page.locator('.poker-map .leaflet-container');
    await expect(map).toBeVisible();
    const input = page.getByRole('searchbox', { name: 'Search civic address' });
    await input.fill(`${record.mailing.number} ${record.mailing.street}`);
    await page.locator('.poker-results li button').first().click();
    const bounds = (await map.boundingBox())!;
    await map.click({ position: { x: bounds.width * .4, y: bounds.height * .4 } });
    await map.click({ position: { x: bounds.width * .6, y: bounds.height * .6 } });
    await page.getByRole('button', { name: 'Finish', exact: true }).click();
    await expect(input).toBeFocused();
    expect(await input.evaluate((element: HTMLInputElement) => [element.selectionStart, element.selectionEnd])).toEqual([0, (await input.inputValue()).length]);
    await expect(page.locator('.poker-results')).toHaveCount(0);
    await expect(page.locator('.poker-distance')).toBeVisible();
    await expect(page.getByText('Tap the house, then trace the driveway to your route.', { exact: true })).toHaveCount(0);
    await page.screenshot({ path: info.outputPath('finish-ready-for-search.png') });
    // Model the reduced visible area while the phone keyboard is open.
    if (viewport.width < 500) await page.setViewportSize({ width: viewport.width, height: 340 });
    await expect(input).toBeInViewport({ ratio: 1 });
    await page.keyboard.type('117 Gussieville');
    await expect(input).toHaveValue('117 Gussieville');
    const result = page.locator('.poker-results li button');
    await expect(result).toHaveCount(1);
    await expect(result).toBeInViewport({ ratio: 1 });
    const finished = await page.evaluate(() => JSON.parse(localStorage.getItem('ns-marks:poker:v1')!));
    expect(finished.finished).toBe(true);
    expect(finished.points).toHaveLength(2);
    await result.click();
    const next = await page.evaluate(() => JSON.parse(localStorage.getItem('ns-marks:poker:v1')!));
    expect(next.finished).toBe(false);
    expect(next.points).toEqual([]);
    await expect(input).not.toBeFocused();
    await expect(page.getByText('Tap the house, then trace the driveway to your route.', { exact: true })).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}
