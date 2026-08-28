import { describe, expect, it } from "vitest";
import indexHtml from "../index.html?raw";
import manifestText from "../public/manifest.webmanifest?raw";

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
      /<meta\s+property="og:url"\s+content="https:\/\/kinnokilabs\.com\/apps\/nsmarksthespot\/map\/"/,
    );
    expect(indexHtml).toMatch(
      /<meta\s+property="og:image"\s+content="https:\/\/kinnokilabs\.com\/apps\/nsmarksthespot\/map\/social-card\.png"/,
    );
    expect(indexHtml).toMatch(
      /<meta\s+name="twitter:card"\s+content="summary_large_image"/,
    );
    expect(indexHtml).toMatch(
      /<meta\s+name="twitter:image"\s+content="https:\/\/kinnokilabs\.com\/apps\/nsmarksthespot\/map\/social-card\.png"/,
    );
  });

  it("supports an iPhone standalone Home Screen experience", () => {
    expect(indexHtml).toContain(
      '<meta name="apple-mobile-web-app-capable" content="yes" />',
    );
    expect(indexHtml).toContain(
      '<link rel="manifest" href="./manifest.webmanifest" />',
    );
    expect(indexHtml).toContain(
      '<link rel="apple-touch-icon" href="./app-icon-180.png" />',
    );

    const manifest = JSON.parse(manifestText) as {
      display: string;
      start_url: string;
      scope: string;
    };
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toBe("./");
    expect(manifest.scope).toBe("./");
  });

  it("names the native app for Safari and manifest tooling", () => {
    // Safari's Smart App Banner stays hidden until the app is publicly on
    // the App Store, so this stages the wiring without claiming availability.
    expect(indexHtml).toContain(
      '<meta name="apple-itunes-app" content="app-id=6785084336" />',
    );

    const manifest = JSON.parse(manifestText) as {
      related_applications?: { platform: string; url: string }[];
      prefer_related_applications?: boolean;
    };
    expect(manifest.related_applications).toEqual([
      {
        platform: "itunes",
        url: "https://apps.apple.com/app/id6785084336",
      },
    ]);
    // The installed-map experience stays primary; the native listing is
    // related, not preferred.
    expect(manifest.prefer_related_applications).toBeUndefined();
  });
});
