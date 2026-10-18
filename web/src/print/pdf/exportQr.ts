import QRCode from "qrcode";

/**
 * PNG (not the print system's SVG) because pdf-lib embeds raster images
 * natively. 512 px stays crisp at the templates' 96 pt block. Null on
 * failure — the QR is a courtesy, never an export blocker.
 */
export async function buildExportQrPng(url: string): Promise<Uint8Array | null> {
  try {
    const dataUrl = await QRCode.toDataURL(url, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 512,
    });
    const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
    return Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0));
  } catch {
    return null;
  }
}
