import { describe, expect, it } from "vitest";
import indexHtml from "../index.html?raw";

describe("web document metadata", () => {
  it("declares an embedded favicon so subpath hosts do not request /favicon.ico", () => {
    expect(indexHtml).toMatch(/<link\s+rel="icon"\s+href="data:image\/svg\+xml,/);
  });

  it("titles the document for strangers, not for the repo split", () => {
    expect(indexHtml).toContain(
      "<title>NS Marks The Spot — Nova Scotia parcel &amp; tax-sale map</title>",
    );
  });

  it("declares Open Graph and Twitter card tags for link unfurls", () => {
    expect(indexHtml).toMatch(
      /<meta\s+property="og:title"\s+content="NS Marks The Spot — Nova Scotia parcel &amp; tax-sale map"/,
    );
    expect(indexHtml).toMatch(/<meta\s+property="og:type"\s+content="website"/);
    expect(indexHtml).toMatch(
      /<meta\s+property="og:description"\s+content="[^"]{40,}"/,
    );
    expect(indexHtml).toMatch(
      /<meta\s+property="og:image"\s+content="social-card.png"/,
    );
    expect(indexHtml).toMatch(
      /<meta\s+name="twitter:card"\s+content="summary_large_image"/,
    );
    expect(indexHtml).toMatch(
      /<meta\s+name="twitter:image"\s+content="social-card.png"/,
    );
  });
});
