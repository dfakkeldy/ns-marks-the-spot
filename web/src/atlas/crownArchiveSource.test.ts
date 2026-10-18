import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { crownArchiveSource, crownReceipt } from './crown';

const bytes = readFileSync(`public/atlas/crown/${crownReceipt.archive}`);
afterEach(() => vi.unstubAllGlobals());

it('serves requested ranges from one verified HTTP 200 download across concurrent readers', async () => {
  vi.stubGlobal('crypto', webcrypto);
  const fetch = vi.fn().mockResolvedValue(new Response(bytes));
  vi.stubGlobal('fetch', fetch);
  const source = crownArchiveSource('https://example.test/crown.pmtiles');
  const [header, directory] = await Promise.all([source.getBytes(0, 127), source.getBytes(127, 200)]);
  expect(Buffer.from(header.data)).toEqual(bytes.subarray(0, 127));
  expect(Buffer.from(directory.data)).toEqual(bytes.subarray(127, 327));
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('rejects mismatched bytes and retries the download instead of retaining a bad archive', async () => {
  vi.stubGlobal('crypto', webcrypto);
  const wrong = Buffer.from(bytes); wrong[200] ^= 1;
  const fetch = vi.fn().mockResolvedValueOnce(new Response(wrong)).mockResolvedValueOnce(new Response(bytes));
  vi.stubGlobal('fetch', fetch);
  const source = crownArchiveSource('https://example.test/crown.pmtiles');
  await expect(source.getBytes(0, 127)).rejects.toThrow('does not match its receipt');
  expect((await source.getBytes(0, 127)).data.byteLength).toBe(127);
  expect(fetch).toHaveBeenCalledTimes(2);
});

it('cancels one tile without discarding the archive needed by the other map', async () => {
  vi.stubGlobal('crypto', webcrypto);
  const fetch = vi.fn().mockResolvedValue(new Response(bytes));
  vi.stubGlobal('fetch', fetch);
  const source = crownArchiveSource('https://example.test/crown.pmtiles');
  const controller = new AbortController();
  const cancelled = source.getBytes(0, 127, controller.signal);
  controller.abort();
  await expect(cancelled).rejects.toThrow();
  expect((await source.getBytes(127, 200)).data.byteLength).toBe(200);
  expect(fetch).toHaveBeenCalledTimes(1);
});
