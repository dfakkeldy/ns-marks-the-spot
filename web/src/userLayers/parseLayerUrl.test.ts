import { describe, expect, it } from "vitest";
import { guessKind, maskUrl, validateLayerUrl, validateTermsUrl } from "./parseLayerUrl";
describe("user layer addresses", () => {
  it("validates schemes, templates and credentials", () => {
    expect(validateLayerUrl("http://localhost:8080/{z}/{x}/{y}.png")).toBeNull();
    for (const value of ["http://example.org/{z}/{x}/{y}", "javascript:alert(1)", "https://user:pass@example.org/{z}/{x}/{y}", "https://example.org/{z}/{x}"]) expect(validateLayerUrl(value, "xyz")).not.toBeNull();
    expect(validateTermsUrl("javascript:alert(1)")).not.toBeNull();
    expect(guessKind("https://example.org/MapServer/WMSServer")).toBe("wms");
  });
  it("masks query values and credentials", () => {
    const masked = maskUrl("https://user:secret@example.org/{z}/{x}/{y}?key=secret&token=another");
    expect(masked).not.toContain("secret"); expect(masked).not.toContain("another"); expect(masked).toContain("{z}/{x}/{y}");
  });
});
