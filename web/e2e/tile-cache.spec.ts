import { createServer } from 'node:http';
import { expect, test } from '@playwright/test';

// Real HTTP caching matters here: Playwright routing disables the browser cache.
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64');
for (const cors of [false, true]) test(`terrain reads cached ${cors ? 'CORS' : 'opaque'} 2D imagery`, async ({ page }) => {
  let corsRequests = 0;
  const server = createServer((request, response) => {
    response.setHeader('Content-Type', 'image/png');
    response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    if (request.headers.origin) {
      corsRequests++;
      response.setHeader('Access-Control-Allow-Origin', request.headers.origin);
      response.setHeader('Vary', 'Origin');
    }
    response.end(png);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No fixture port');
  try {
    const tile = `http://127.0.0.1:${address.port}/tile.png`;
    await page.goto(`/e2e/tile-cache.html?tile=${encodeURIComponent(tile)}&cors=${cors ? 1 : 0}`);
    await expect(page.getByRole('status')).toHaveText('Image cached');
    expect(corsRequests).toBe(cors ? 1 : 0);
    await page.getByRole('button', { name: 'Read for terrain' }).click();
    await expect(page.getByRole('status')).toHaveText(`Terrain bytes loaded: ${png.length}`);
    expect(corsRequests).toBe(1);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
