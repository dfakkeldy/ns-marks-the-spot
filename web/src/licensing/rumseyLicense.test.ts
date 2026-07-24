import { describe, expect, it } from "vitest";
import { RUMSEY_ATTRIBUTION, RUMSEY_LICENCE_URL } from "./rumseyLicense";

describe("David Rumsey Map Collection licence", () => {
  it("uses the credit line the collection requires", () => {
    expect(RUMSEY_ATTRIBUTION).toBe(
      "David Rumsey Map Collection, David Rumsey Map Center, Stanford Libraries",
    );
  });

  it("links the collection's copyright and permissions page", () => {
    expect(RUMSEY_LICENCE_URL).toBe(
      "https://www.davidrumsey.com/about/copyright-and-permissions",
    );
  });

  it("does not pin a Creative Commons version in code", () => {
    expect(RUMSEY_ATTRIBUTION).not.toMatch(/BY-NC-SA/i);
  });
});
