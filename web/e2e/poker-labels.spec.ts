import { test, expect, type Page } from '@playwright/test';

// Views from the real offline pack where unplaced labels used to pile up.
const views = [
  { name: 'Highway 19 at Long Point', center: [45.8035, -61.4845], zoom: 16, minimum: 18 },
  { name: 'Port Hood', center: [46.0152, -61.529], zoom: 16, minimum: 100 },
];

/** Every visible label's rotated outline, from its layout box and computed transform. */
async function labelOutlines(page: Page) {
  return page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.poker-number, .poker-road-label')].map(label => {
    const anchor = label.parentElement!.getBoundingClientRect(), m = new DOMMatrix(getComputedStyle(label).transform);
    const w = label.offsetWidth, h = label.offsetHeight, x = anchor.left + label.offsetLeft + w / 2, y = anchor.top + label.offsetTop + h / 2;
    return { text: label.textContent!, road: label.classList.contains('poker-road-label'), angle: Math.atan2(m.b, m.a) * 180 / Math.PI,
      corners: [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([cx, cy]) => ({ x: x + m.a * cx + m.c * cy + m.e, y: y + m.b * cx + m.d * cy + m.f })) };
  }).filter(label => label.corners.some(c => c.x > 0 && c.y > 0 && c.x < innerWidth && c.y < innerHeight)));
}
type Outline = Awaited<ReturnType<typeof labelOutlines>>[number];
function overlap(a: Outline, b: Outline): boolean {
  const axes = (o: Outline) => [0, 1].map(i => { const dx = o.corners[i + 1].x - o.corners[i].x, dy = o.corners[i + 1].y - o.corners[i].y, l = Math.hypot(dx, dy); return [-dy / l, dx / l]; });
  return [...axes(a), ...axes(b)].every(([ax, ay]) => {
    const pa = a.corners.map(c => c.x * ax + c.y * ay), pb = b.corners.map(c => c.x * ax + c.y * ay);
    return Math.min(Math.max(...pa), Math.max(...pb)) - Math.max(Math.min(...pa), Math.min(...pb)) > 0.5;
  });
}

for (const view of views) {
  test(`Poker labels do not collide: ${view.name}`, async ({ page }, info) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.addInitScript(session => localStorage.setItem('ns-marks:poker:v1', JSON.stringify(session)),
      { version: 1, basemap: 'atlas', query: '', postalCode: '', selectedId: null, center: view.center, zoom: view.zoom, points: [], finished: false });
    await page.goto('/poker');
    await expect(page.locator('.poker-number').first()).toBeVisible();
    // Placement reruns once the map controls have mounted.
    await expect.poll(async () => (await labelOutlines(page)).length).toBeGreaterThanOrEqual(view.minimum);
    const labels = await labelOutlines(page);
    await page.screenshot({ path: info.outputPath('poker-labels.png') });
    const collisions = labels.flatMap((a, i) => labels.slice(i + 1).filter(b => overlap(a, b)).map(b => `${a.text} × ${b.text}`));
    expect(collisions).toEqual([]);
    const controls = await page.locator('.poker-searchbar, .poker-options, .poker-basemap, .poker-locate, .poker-measurement, .poker-footer, .leaflet-control-zoom, .leaflet-control-scale')
      .evaluateAll(elements => elements.map(element => element.getBoundingClientRect().toJSON() as DOMRect));
    const covered = labels.filter(label => controls.some(r => label.corners.some(c => c.x > r.left && c.x < r.right && c.y > r.top && c.y < r.bottom)));
    expect(covered.map(label => label.text)).toEqual([]);
    expect(labels.filter(label => label.road).length).toBeGreaterThan(0);
    if (view.name.startsWith('Highway 19')) {
      // The highway runs nearly north-south here, so its name stands on end with it.
      const highway = labels.filter(label => label.text === 'Highway 19');
      expect(highway.length).toBeGreaterThan(0);
      for (const label of highway) expect(Math.abs(label.angle)).toBeGreaterThan(70);
      // Labels never take a tap meant for the trace.
      const number = labels.find(label => !label.road)!;
      const middle = number.corners.reduce((sum, c) => ({ x: sum.x + c.x / 4, y: sum.y + c.y / 4 }), { x: 0, y: 0 });
      await page.mouse.click(middle.x, middle.y);
      await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('ns-marks:poker:v1')!).points.length)).toBe(1);
    }
    expect(errors).toEqual([]);
  });
}
