import QRCode from "qrcode";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildPrintQr } from "./printQr";

vi.mock("qrcode", () => ({
  default: { toString: vi.fn() },
}));

describe("print QR", () => {
  beforeEach(() => vi.clearAllMocks());

  it("generates a local monochrome SVG", async () => {
    vi.mocked(QRCode.toString).mockResolvedValue("<svg>receipt</svg>" as never);
    await expect(buildPrintQr("https://example.com/map/?pid=01234567"))
      .resolves.toEqual({ status: "ready", svg: "<svg>receipt</svg>" });
    expect(QRCode.toString).toHaveBeenCalledWith(
      "https://example.com/map/?pid=01234567",
      {
        type: "svg",
        errorCorrectionLevel: "M",
        margin: 2,
        color: { dark: "#000000", light: "#ffffff" },
      },
    );
  });

  it("returns a fallback state instead of hiding the written URL", async () => {
    vi.mocked(QRCode.toString).mockRejectedValue(new Error("too long"));
    await expect(buildPrintQr("https://example.com/map/?pid=01234567"))
      .resolves.toEqual({ status: "error" });
  });
});
