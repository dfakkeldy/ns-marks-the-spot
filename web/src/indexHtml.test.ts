import { describe, expect, it } from "vitest";
import indexHtml from "../index.html?raw";

describe("web document metadata", () => {
  it("declares an embedded favicon so subpath hosts do not request /favicon.ico", () => {
    expect(indexHtml).toMatch(/<link\s+rel="icon"\s+href="data:image\/svg\+xml,/);
  });
});
