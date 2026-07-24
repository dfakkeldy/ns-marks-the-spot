import { createHash } from "node:crypto";

const USER_AGENT = "NS-Marks-tax-sale-monitor/1.0";

export function sha256(input) {
  return createHash("sha256").update(input).digest("hex");
}

// The id_ suffix replays the original archived bytes with no toolbar injection,
// which is what keeps a recorded SHA-256 independently reproducible.
export function waybackIdUrl(timestamp, url) {
  return `https://web.archive.org/web/${timestamp}id_/${url}`;
}

export function parseSaveTimestamp(finalUrl) {
  return finalUrl.match(/\/web\/(\d{14})/u)?.[1] ?? null;
}

export function parseCdxTimestamps(body) {
  if (!body.trim()) {
    return [];
  }
  let rows;
  try {
    rows = JSON.parse(body);
  } catch {
    return [];
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    return [];
  }
  const [header, ...data] = rows;
  const column = header.indexOf("timestamp");
  return data
    .map((row) => row[column])
    .filter((value) => /^\d{14}$/u.test(value))
    .sort((left, right) => right.localeCompare(left));
}

export async function submitToWayback(url, { fetchImpl = fetch } = {}) {
  const response = await fetchImpl(`https://web.archive.org/save/${url}`, {
    headers: { "User-Agent": USER_AGENT },
    redirect: "follow",
  });
  if (!response.ok) {
    return null;
  }
  return parseSaveTimestamp(response.url ?? "");
}

export async function listCaptures(url, { fetchImpl = fetch } = {}) {
  const query = new URLSearchParams({
    url,
    matchType: "exact",
    output: "json",
    fl: "timestamp,original",
    collapse: "digest",
    limit: "40",
  });
  const response = await fetchImpl(
    `https://web.archive.org/cdx/search/cdx?${query}`,
    { headers: { "User-Agent": USER_AGENT } },
  );
  if (!response.ok) {
    return [];
  }
  return parseCdxTimestamps(await response.text());
}

export async function findHashableCapture(
  url,
  { fetchImpl = fetch, verify, timestamps },
) {
  const candidates = timestamps ?? (await listCaptures(url, { fetchImpl }));

  for (const timestamp of candidates) {
    const captureUrl = waybackIdUrl(timestamp, url);
    let body;
    try {
      const response = await fetchImpl(captureUrl, {
        headers: { "User-Agent": USER_AGENT },
      });
      if (!response.ok) {
        continue;
      }
      body = await response.text();
    } catch {
      continue;
    }
    // Save Page Now can store a bot-verification interstitial whose replay still
    // renders correctly. Only bytes that actually carry the table are hashable.
    if (verify(body)) {
      return { timestamp, url: captureUrl, sha256: sha256(body) };
    }
  }
  return null;
}
