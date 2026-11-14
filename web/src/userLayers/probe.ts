import { userLayerUse } from "./sourceMatch";
import { tileUrl } from "./tileUrls";
import type { UserLayerRecord } from "./types";

export async function probeLayer(record: UserLayerRecord, licenceAccepted: boolean, center: { lat: number; lng: number }, zoom: number) {
  const gate = userLayerUse(record, undefined, licenceAccepted);
  if (gate.view !== "allowed") throw new Error(gate.reason ?? "Accept the source licence before testing.");
  const z = Math.max(record.minZoom, Math.min(record.maxNativeZoom, Math.floor(zoom)));
  const n = 2 ** z; const lat = Math.max(-85, Math.min(85, center.lat)) * Math.PI / 180;
  const x = Math.floor(((center.lng + 180) / 360) * n);
  const y = Math.floor((1 - Math.asinh(Math.tan(lat)) / Math.PI) / 2 * n);
  const url = tileUrl(record, { x, y, z });
  const display = new Promise<boolean>(resolve => { const img = new Image(); const timer = setTimeout(() => { img.removeAttribute("src"); resolve(false); }, 15000); img.onload = () => { clearTimeout(timer); resolve(true); }; img.onerror = () => { clearTimeout(timer); resolve(false); }; img.src = url; });
  const readable = fetch(url, { mode: "cors", signal: AbortSignal.timeout(15000) }).then(async response => {
    const blob = await response.blob();
    if (response.ok && blob.type.startsWith("image/")) return { corsReadable: true, diagnostic: undefined };
    const text = await blob.text();
    const http = response.ok ? "" : ` (HTTP ${response.status})`;
    return { corsReadable: false, diagnostic: /invalid(?:crs|srs)|unsupported.*(?:crs|srs)|projection/i.test(text) ? `This server cannot serve the map projection the app uses${http}.` : `The server did not return an image${http}.` };
  }).catch(() => ({ corsReadable: false, diagnostic: undefined }));
  const [draws, result] = await Promise.all([display, readable]);
  return { display: draws, ...result, at: new Date().toISOString() };
}
