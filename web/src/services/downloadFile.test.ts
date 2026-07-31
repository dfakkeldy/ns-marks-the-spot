import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadFile } from "./downloadFile";

describe("downloadFile", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("names the download and revokes the object URL afterwards", () => {
    const createObjectURL = vi.fn(() => "blob:generated");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });
    const click = vi.fn();
    const anchor = { href: "", download: "", click } as unknown as HTMLAnchorElement;
    vi.spyOn(document, "createElement").mockReturnValue(anchor);

    const blob = new Blob(["payload"], { type: "text/plain" });
    downloadFile("camps.geojson", blob);

    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(anchor.href).toBe("blob:generated");
    expect(anchor.download).toBe("camps.geojson");
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:generated");
    vi.unstubAllGlobals();
  });

  it("revokes the object URL even when the click throws", () => {
    const createObjectURL = vi.fn(() => "blob:generated");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });
    const anchor = {
      href: "",
      download: "",
      click: () => {
        throw new Error("blocked");
      },
    } as unknown as HTMLAnchorElement;
    vi.spyOn(document, "createElement").mockReturnValue(anchor);

    expect(() => downloadFile("x.json", new Blob(["x"]))).toThrow("blocked");
    // A leaked object URL pins its Blob in memory for the life of the tab.
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:generated");
    vi.unstubAllGlobals();
  });
});
