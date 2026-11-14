import { userLayerUse } from "./sourceMatch";
import { tileUrl } from "./tileUrls";
import type { UserLayerRecord } from "./types";

export async function probeLayer(record: UserLayerRecord, licenceAccepted: boolean, center: { lat: number; lng: number }, zoom: number) {
  const gate = userLayerUse(record, "same-lock", licenceAccepted);
  if (gate.view !== "allowed") throw new Error(gate.reason ?? "Accept the source licence before testing.");
  const z = Math.max(record.minZoom, Math.min(record.maxNativeZoom, Math.floor(zoom)));
  const n = 2 ** z; const lat = Math.max(-85, Math.min(85, center.lat)) * Math.PI / 180;
  const x = Math.floor(((center.lng + 180) / 360) * n);
  const y = Math.floor((1 - Math.asinh(Math.tan(lat)) / Math.PI) / 2 * n);
  const url = tileUrl(record, { x, y, z });
  const display = new Promise<boolean>(resolve => { const img = new Image(); img.onload = () => resolve(true); img.onerror = () => resolve(false); img.src = url; });
  const readable = fetch(url, { mode: "cors" }).then(response => response.ok && response.blob().then(blob => blob.type.startsWith("image/"))).catch(() => false);
  const [draws, corsReadable] = await Promise.all([display, readable]);
  return { display: draws, corsReadable, at: new Date().toISOString() };
}
