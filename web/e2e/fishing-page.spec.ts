import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const harbourFixture = (name: string) => readFileSync(resolve('src/test/fixtures/dfo-small-craft-harbours', name), 'utf8');

/** The page's own files are served locally; everything off-site gets a fixture or an empty answer. */
async function isolateExternal(page: Page) {
  await page.route('https://**/*', route => {
    const url = route.request().url();
    if (route.request().resourceType() === 'image') return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e5ebde"/></svg>' });
    if (url.includes('/small_craft_harbours_en/MapServer/0/query')) return route.fulfill({ contentType: 'application/geo+json', body: harbourFixture('core-ns.json') });
    if (url.includes('/small_craft_harbours_en/MapServer/1/query')) return route.fulfill({ contentType: 'application/geo+json', body: harbourFixture('non-core-ns.json') });
    if (url.includes('/query') || url.includes('.geojson') || url.includes('/items')) return route.fulfill({ json: { type: 'FeatureCollection', features: [] } });
    return route.fulfill({ contentType: 'text/css', body: '' });
  });
}

function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  return errors;
}

/** The standing bridge rule is shown until its review date in rules.json. */
const standingRulesInForce = new Date() <= new Date(2027, 9, 12, 23, 59);

const pins = (page: Page) => page.locator('.fishing-spot-marker');
const cards = (page: Page) => page.locator('.fishing-spot');
const card = (page: Page, id: string) => page.locator(`#fishing-spot-${id}`);
// A replaced popup fades out for a moment beside the new one; the new one is last.
const popup = (page: Page) => page.locator('.fishing-spot-popup').last();

for (const width of [1440, 390]) test(`the /fishing page filters its spots by month and opens a card at ${width}px`, async ({ page }) => {
  test.setTimeout(120000);
  const phone = width === 390;
  await page.setViewportSize({ width, height: phone ? 844 : 900 });
  const errors = collectErrors(page);
  await isolateExternal(page);
  // basemap is not share state, so a phone still opens on the page summary.
  await page.goto('/fishing?basemap=osm');

  await expect(page).toHaveTitle('Fishing spots — Cape Breton and the Strait of Canso');
  await expect(page.getByRole('heading', { level: 2, name: 'Fishing spots' })).toBeVisible();
  await expect(page.getByText('For Darrell, who never needed a reason to go fishing.', { exact: true })).toBeVisible();
  await expect(page.getByText(/Rules summary for the 2026 licence year|rules summary passed its date/)).toBeVisible();
  for (const name of [/^Tax Sale/, /^My Maps/, /^Historical Maps/, /^Elections & Districts/, /^Forestry & Ecology/]) {
    await expect(page.getByRole('button', { name })).toHaveCount(0);
  }
  await expect(page.getByRole('combobox', { name: 'Map setup' })).toHaveCount(0);

  await expect(cards(page)).toHaveCount(27);
  await expect(pins(page)).toHaveCount(27);
  await page.getByRole('combobox', { name: 'Month' }).selectOption('1');
  await expect(cards(page)).toHaveCount(5);
  await expect(pins(page)).toHaveCount(5);
  await expect(page.locator('.fishing-filter-result')).toContainText('5 of 27 spots for January');
  // The address bar is updated at most every 500 ms, so let it settle.
  await expect(page).toHaveURL(/\/fishing\?.*month=1(?:&|$)/);

  await card(page, 'S25').getByRole('button', { name: /^Spot 25:/ }).click();
  await expect(card(page, 'S25').getByRole('button', { name: /^Spot 25:/ })).toHaveAttribute('aria-expanded', 'true');
  await expect(page).toHaveURL(/spot=S25/);
  const google = card(page, 'S25').getByRole('link', { name: 'Directions in Google Maps' });
  await expect(google).toHaveAttribute('href', /^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=45\.528\d\d%2C-61\.974\d\d$/);
  await expect(card(page, 'S25').getByRole('link', { name: 'Directions in Apple Maps' })).toHaveAttribute('href', /^https:\/\/maps\.apple\.com\/\?daddr=45\.528/);
  await card(page, 'S25').getByText('Rules to check here').click();
  await expect(card(page, 'S25').getByRole('link', { name: "Nova Scotia Anglers' Handbook (current edition)" })).toHaveAttribute('href', 'https://www.novascotia.ca/documents/anglers-handbook');
  if (standingRulesInForce) await expect(card(page, 'S25').getByText(/Angling from any bridge in Nova Scotia/)).toBeVisible();

  // Card to pin: the map brings the spot forward with its pin ringed.
  await card(page, 'S25').getByRole('button', { name: 'Show on the map' }).click();
  await expect(page.locator('.fishing-spot-marker.is-selected')).toHaveCount(1);
  await expect(page.locator('.fishing-spot-marker.is-selected')).toHaveAttribute('data-spot-id', 'S25');
  await expect(popup(page)).toContainText('Gillis and Cameron lakes');
  if (phone) {
    // Pin to card: the popup reopens the sheet on the card.
    await expect(page.getByRole('heading', { level: 2, name: 'Fishing spots' })).toBeHidden();
    await popup(page).getByRole('button', { name: 'Open the spot card' }).click();
    await expect(card(page, 'S25').getByRole('button', { name: /^Spot 25:/ })).toBeFocused();
  }

  await page.getByRole('combobox', { name: 'Month' }).selectOption('');
  await expect(pins(page)).toHaveCount(27);
  await expect(page).not.toHaveURL(/month=/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  // The panel's screen-reader text must not stretch the document past the
  // viewport, or scrolling past the rail's end scrolls the whole page away.
  await page.locator('.fishing-calendar > summary').click();
  expect(await page.evaluate(() => document.scrollingElement!.scrollHeight <= innerHeight)).toBe(true);
  expect(errors).toEqual([]);
});

test('a pin opens its card, and a species filter that matches nothing says so', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const errors = collectErrors(page);
  await isolateExternal(page);
  await page.goto('/fishing?basemap=osm');
  await expect(pins(page)).toHaveCount(27);

  await page.locator('.fishing-spot-marker[data-spot-id="S04"]').click();
  await expect(card(page, 'S04').getByRole('button', { name: /^Spot 4:/ })).toHaveAttribute('aria-expanded', 'true');
  await expect(page).toHaveURL(/spot=S04/);
  await popup(page).locator('.leaflet-popup-close-button').click();
  await expect(card(page, 'S04').getByRole('button', { name: /^Spot 4:/ })).toHaveAttribute('aria-expanded', 'false');

  // A pin is a keyboard button too.
  await page.locator('.fishing-spot-marker[data-spot-id="S16"]').focus();
  await page.keyboard.press('Enter');
  await expect(card(page, 'S16').getByRole('button', { name: /^Spot 16:/ })).toHaveAttribute('aria-expanded', 'true');
  await expect(page).toHaveURL(/spot=S16/);
  await popup(page).locator('.leaflet-popup-close-button').click();

  await page.getByRole('combobox', { name: 'Month' }).selectOption('1');
  await page.getByRole('combobox', { name: 'Species' }).selectOption('atlantic_mackerel');
  await expect(cards(page)).toHaveCount(0);
  await expect(pins(page)).toHaveCount(0);
  await expect(page.locator('.fishing-empty')).toContainText('None of the curated spots is listed for January and Atlantic mackerel');
  await page.locator('.fishing-empty').getByRole('button', { name: 'Clear filters' }).click();
  await expect(pins(page)).toHaveCount(27);

  // Salmon and eel are rules-only in the species calendar.
  await page.locator('.fishing-calendar > summary').click();
  const salmon = page.getByRole('row', { name: /^Atlantic salmon/ });
  await expect(salmon).toContainText('Rules only: no months shown.');
  await expect(salmon.locator('.is-good, .is-peak')).toHaveCount(0);
  await expect(page.getByRole('row', { name: /^American eel/ })).toContainText('Rules only');
  expect(errors).toEqual([]);
});

test('a shared spot link opens its card, and the full-map link leaves the page state behind', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await isolateExternal(page);
  await page.goto('/fishing/?month=10&spot=S04&basemap=osm');
  await expect(page).toHaveURL(/\/fishing\?/);
  // Month and spot are not shared map state, so a phone opens on the summary.
  await expect(page.getByRole('heading', { level: 2, name: 'Fishing spots' })).toBeVisible();
  await expect(card(page, 'S04').getByRole('button', { name: /^Spot 4:/ })).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.fishing-filter-result')).toContainText('for October');
  await expect(page).toHaveURL(/month=10/);
  const full = new URL((await page.getByRole('link', { name: /Open this view in the full NS Marks map/ }).getAttribute('href'))!);
  expect(full.pathname).toBe('/');
  expect(full.searchParams.has('month')).toBe(false);
  expect(full.searchParams.has('spot')).toBe(false);
  expect(full.searchParams.get('layers')).toContain('fishing-spots');
  // The site's separate static guide; not followed, as external hosts are stubbed.
  await expect(page.locator('.fishing-focus-footer').getByRole('link', { name: "Strait and Bras d'Or fishing map" })).toHaveAttribute('href', 'https://kinnokilabs.com/fishing/');
});

test('the /fishing page follows a dark system appearance', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.setViewportSize({ width: 1440, height: 900 });
  const errors = collectErrors(page);
  await isolateExternal(page);
  await page.goto('/fishing?basemap=osm&spot=S10');
  await expect(page.locator('html')).toHaveAttribute('data-map-appearance', 'night');
  const colours = await card(page, 'S10').evaluate(element => {
    const style = getComputedStyle(element);
    const text = getComputedStyle(element.querySelector('.fishing-spot-facts dd')!);
    return { background: style.backgroundColor, text: text.color };
  });
  // The raised card is the night surface (--white, #1b3940) under light ink.
  expect(colours.background).toBe('rgb(27, 57, 64)');
  expect(colours.text).toBe('rgb(232, 241, 240)');
  expect(errors).toEqual([]);
});
