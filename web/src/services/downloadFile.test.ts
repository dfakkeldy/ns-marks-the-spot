import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DOWNLOAD_REVOKE_DELAY_MS, downloadFile } from "./downloadFile";

describe("downloadFile", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:fake"),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("clicks an IN-DOM anchor and defers the revoke past Safari's fetch start", () => {
    let inDomAtClick = false;
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        inDomAtClick = this.isConnected;
      });

    downloadFile("note.md", new Blob(["x"]));

    // Safari ignores detached-anchor downloads, and starts fetching the blob
    // URL only after the click task — a synchronous revoke intermittently
    // aborted the download with no error anywhere.
    expect(inDomAtClick).toBe(true);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(DOWNLOAD_REVOKE_DELAY_MS);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:fake");
    expect(document.querySelector("a[download]")).toBeNull();
    click.mockRestore();
  });

  it("revokes immediately when the click itself is blocked", () => {
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {
        throw new Error("blocked");
      });

    expect(() => downloadFile("note.md", new Blob(["x"]))).toThrow("blocked");
    // No fetch ever started, so the Blob can be released now — and the
    // anchor must not be left in the document.
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:fake");
    expect(document.querySelector("a[download]")).toBeNull();
    click.mockRestore();
  });
});
