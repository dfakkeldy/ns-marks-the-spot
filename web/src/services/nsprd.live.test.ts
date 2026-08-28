import { describe, expect, it } from "vitest";
import {
  eventsForStatus,
  geometryExceptionPidsForEvents,
  pidsForEvents,
} from "../data/taxSaleCatalog";
import { fetchParcels } from "./nsprd";

const runLive = import.meta.env.VITE_RUN_LIVE_NSPRD === "1";

describe.runIf(runLive)("live NSPRD catalog reconciliation", () => {
  it(
    "matches every exact PID in the upcoming municipal catalog",
    async () => {
      const expectedPids = pidsForEvents(eventsForStatus("upcoming"));
      const exceptionPids = geometryExceptionPidsForEvents(
        eventsForStatus("upcoming"),
      );
      const collection = await fetchParcels(expectedPids);
      const exceptionCollection = await fetchParcels(exceptionPids);
      const matchedPids = new Set(
        collection.features.map(({ properties }) => properties.PID),
      );

      expect(expectedPids).toHaveLength(83);
      expect(expectedPids.filter((pid) => !matchedPids.has(pid))).toEqual([]);
      expect(exceptionPids).toEqual(["41051889", "41051897"]);
      expect(exceptionCollection.features).toEqual([]);
    },
    30_000,
  );
});
