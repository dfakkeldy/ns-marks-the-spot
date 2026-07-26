import { describe, expect, it } from "vitest";
import {
  RUMSEY_ATTRIBUTION,
  RUMSEY_COLLECTION_TERMS_URL,
  RUMSEY_LICENCE_NAME,
  RUMSEY_LICENCE_URL,
} from "./rumseyLicense";

describe("David Rumsey Map Collection licence", () => {
  it("uses the credit line the collection requires", () => {
    expect(RUMSEY_ATTRIBUTION).toBe(
      "David Rumsey Map Collection, David Rumsey Map Center, Stanford University Libraries",
    );
  });

  it("links the applicable Creative Commons licence", () => {
    expect(RUMSEY_LICENCE_URL).toBe(
      "https://creativecommons.org/licenses/by-nc-sa/3.0/",
    );
    expect(RUMSEY_LICENCE_NAME).toBe("CC BY-NC-SA 3.0");
  });

  it("keeps the collection terms separately available", () => {
    expect(RUMSEY_COLLECTION_TERMS_URL).toBe(
      "https://www.davidrumsey.com/about/copyright-and-permissions",
    );
  });
});
