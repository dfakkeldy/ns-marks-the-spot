import { describe, expect, it } from "vitest";
import {
  buildLayerParityFixture,
  serializeLayerParityFixture,
} from "./layerParity";

/**
 * The fixture lives under the Swift package's test resources, not under
 * `SharedData/`. `SharedData/` doubles as the iOS bundling allowlist, and this
 * file must never ship inside the app — it exists only so the two catalogs can
 * be compared in CI.
 */
const FIXTURE_PATH = "../../../NSMarksCore/Tests/MapCatalogTests/Fixtures/layer-parity.json";

describe("layer parity fixture", () => {
  it("matches the checked-in fixture the Swift catalog is tested against", async () => {
    // Regenerate with `npx vitest run layerParity -u` after a catalog change.
    // A failure here means the web catalog moved and the Swift catalog has not
    // caught up yet — that is the drift this fixture exists to catch.
    await expect(serializeLayerParityFixture()).toMatchFileSnapshot(FIXTURE_PATH);
  });

  it("covers every layer exactly once", () => {
    const ids = buildLayerParityFixture().layers.map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("declares 36 layers", () => {
    expect(buildLayerParityFixture().layers).toHaveLength(36);
  });

  it("numbers uiOrder as a gapless sequence in panel order", () => {
    const orders = buildLayerParityFixture().layers.map(({ uiOrder }) => uiOrder);
    expect(orders).toEqual(orders.map((_, index) => index));
  });

  it("assigns every layer to a declared group", () => {
    const { groupOrder, layers } = buildLayerParityFixture();
    for (const layer of layers) {
      expect(groupOrder).toContain(layer.group);
    }
  });

  it("keeps groups contiguous so the panel order is section order", () => {
    const { groupOrder, layers } = buildLayerParityFixture();
    const seen = layers.map(({ group }) => group);
    const collapsed = seen.filter((group, index) => group !== seen[index - 1]);
    expect(collapsed).toEqual(
      groupOrder.filter((group) => seen.includes(group)),
    );
  });

  it("records the restricted set the native licence gate is built from", () => {
    // The native gate keys off this, not off provinceLayerIds — that array
    // omits place-names and main-roads, both of which are restricted.
    //
    // Licensing is per service, not per publisher: uranium-risk-wells is
    // Open Government while arsenic, manganese and surficial-aquifers sit
    // under a departmental agreement, and the coastal flood projections are
    // published under the unrestricted licence. Anything that infers a
    // layer's licence from its neighbours gets those five wrong.
    const restricted = buildLayerParityFixture()
      .layers.filter((layer) => layer.licence === "province-restricted")
      .map(({ id }) => id)
      .sort();
    expect(restricted).toEqual([
      "arsenic-risk-wells",
      "buildings",
      "contours",
      "crown-lands",
      "flood-risk",
      "main-roads",
      "manganese-risk-wells",
      "ns-aerial",
      "nsprd",
      "place-names",
      "published-river-flood-zones",
      "roads",
      "surficial-aquifers",
      "water-features",
      "waterfalls",
    ]);
  });

  it("flags the derived parcel layer as needing the Province licence", () => {
    // mineral-proximity-parcels carries requiresProvinceLicence rather than a
    // licence field, so a gate that only reads `licence` would miss it.
    const derived = buildLayerParityFixture().layers.find(
      ({ id }) => id === "mineral-proximity-parcels",
    );
    expect(derived?.requiresProvinceLicence).toBe(true);
    expect(derived?.licence).toBeUndefined();
  });
});
