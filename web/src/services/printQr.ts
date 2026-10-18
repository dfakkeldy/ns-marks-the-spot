import QRCode from "qrcode";

export type PrintQrResult =
  | { status: "ready"; svg: string }
  | { status: "error" };

export async function buildPrintQr(url: string): Promise<PrintQrResult> {
  try {
    const svg = await QRCode.toString(url, {
      type: "svg",
      errorCorrectionLevel: "M",
      margin: 2,
      color: { dark: "#000000", light: "#ffffff" },
    });
    return { status: "ready", svg };
  } catch {
    return { status: "error" };
  }
}
