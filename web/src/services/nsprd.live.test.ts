import { describe, expect, it } from "vitest";
import { eventsForStatus, pidsForEvents } from "../data/taxSaleCatalog";
import { fetchParcels } from "./nsprd";

const runLive = import.meta.env.VITE_RUN_LIVE_NSPRD === "1";

describe.runIf(runLive)("live NSPRD catalog reconciliation", () => {
  it(
    "matches every exact PID in the upcoming municipal catalog",
    async () => {
      const expectedPids = pidsForEvents(eventsForStatus("upcoming"));
      const collection = await fetchParcels(expectedPids);
      const matchedPids = new Set(
        collection.features.map(({ properties }) => properties.PID),
      );

      expect(expectedPids).toHaveLength(47);
      expect(expectedPids.filter((pid) => !matchedPids.has(pid))).toEqual([]);
    },
    30_000,
  );
});
