import { describe, expect, it } from "vitest";
import { matchMailingAddress, normalizeAddress, matchesMailingQuery, type MailingRecord } from "./mailingAddresses";
import type { CivicAddress } from "./civicAddresses";

// Synthetic identities and locations; no household-specific regression fixture.
const civic: CivicAddress = {
  pntid: "test-point", label: "117 Example Rd, Long Point", coordinates: [-61.4, 45.8],
  properties: { pntid: "test-point", civicnum: "117", civsuffix: null, unit_num: null,
    add_loc: null, strprefix: null, strname: "Example", strsuffix: "Rd", strdir: null,
    comm: "Long Point", mun: "Inverness County", county: "Inverness County" },
};
const record: MailingRecord = {
  id: "test-nar-id", number: "117", suffix: "", unit: "", road: "Example RD",
  street: "EXAMPLE RD", city: "JUDIQUE", postalCode: "B0E1P0", additional: "RR 1",
  coordinates: [-61.400002, 45.800009],
};
describe("mailing address evidence", () => {
  it("matches exact components and nearby coordinates while retaining source identity", () => {
    const result = matchMailingAddress(civic, [record]);
    expect(result).toEqual({ status: "matched", record });
    expect(civic.label).toBe("117 Example Rd, Long Point");
  });
  it("does not infer a match from proximity, a different number, suffix or unit", () => {
    for (const change of [{ number: "118" }, { suffix: "A" }, { unit: "2" }, { road: "Other Rd" }, { coordinates: [-61.5,45.8] as [number,number] }]) {
      expect(matchMailingAddress(civic, [{ ...record, ...change }]).status).toBe("unmatched");
    }
  });
  it("keeps multiple source addresses ambiguous even if their mailing labels agree", () => {
    expect(matchMailingAddress(civic, [record, { ...record, id: "other-id" }]).status).toBe("ambiguous");
    expect(matchMailingAddress(civic, [record, record]).status).toBe("matched");
  });
  it("recognizes postal community names, road abbreviations and a final typed prefix", () => {
    expect(matchesMailingQuery(record, "117 Example Road Judique", false)).toBe(true);
    expect(matchesMailingQuery(record, "117 Example Rd Judi", true)).toBe(true);
    expect(matchesMailingQuery(record, "117 Example Rd Judi", false)).toBe(false);
    expect(matchesMailingQuery(record, "118 Example Road Judique", false)).toBe(false);
    expect(normalizeAddress("Chisholm-MacLean Road")).toBe(normalizeAddress("CHISHOLM MACLEAN RD"));
  });
});

import { afterEach, beforeEach, vi } from "vitest";
import { gzipSync, strToU8 } from "fflate";

const feature = { type: "Feature", properties: civic.properties, geometry: { type: "Point", coordinates: civic.coordinates } };
const collection = (features: unknown[]) => ({ ok: true, json: async () => ({ type: "FeatureCollection", features }) });
const compressed = (payload: unknown) => {
  const bytes = gzipSync(strToU8(JSON.stringify(payload)));
  return { ok: true, arrayBuffer: async () => bytes.buffer };
};
beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());
function mockSources({ failed = false, nearby = [feature], records = [record], badShard = false } = {}) {
  const fetchMock = vi.fn(async (url: string) => {
    if (url.includes("mailing-addresses")) {
      if (failed) throw new Error("offline");
      if (url.includes("index")) return compressed({ version:1, streets:[{key:"example rd",cities:["JUDIQUE"]}] });
      return compressed({ version:1, streets:{ "example rd": badShard ? [{ ...record, coordinates:[null,45.8] }] : records } });
    }
    return collection(new URL(url).searchParams.get("$where")?.includes("within_box") ? nearby : []);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
describe("free postal search integration", () => {
  it("resolves a postal-community query to the live civic point, preserving its label and coordinates", async () => {
    const fetchMock = mockSources();
    const { searchAddressesWithMailing } = await import("./mailingAddresses");
    const result = await searchAddressesWithMailing("117 Example Road Judique");
    expect(result.notice).toBeNull();
    expect(result.addresses).toHaveLength(1);
    expect(result.addresses[0]).toMatchObject({ pntid:civic.pntid, coordinates:civic.coordinates, label:"117 Example Rd, Long Point, Inverness County", mailing:{status:"matched",record} });
    expect(fetchMock.mock.calls.filter(([url]) => url.includes("within_box") || url.includes("within_box%28"))).toHaveLength(1);
  });
  it("accepts JSON already decompressed by the host's Content-Encoding", async () => {
    const fetchMock = mockSources();
    const implementation = fetchMock.getMockImplementation()!;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const result = await implementation(url);
      if ("arrayBuffer" in result) {
        const { gunzipSync } = await import("fflate");
        const bytes = gunzipSync(new Uint8Array(await result.arrayBuffer()));
        return { ok:true, arrayBuffer:async () => bytes.buffer };
      }
      return result;
    }));
    const { searchAddressesWithMailing } = await import("./mailingAddresses");
    expect((await searchAddressesWithMailing("117 Example Road Judique")).addresses).toHaveLength(1);
  });
  it.each(["A-117 Example Rd, Judique, NS B0E 1P0", "Unit A, 117 Example Rd Judique"])("finds alphabetic units from %s", async query => {
    mockSources({records:[{...record,unit:"A"}],nearby:[{...feature,properties:{...civic.properties,unit_num:"A"}}]});
    const { searchAddressesWithMailing } = await import("./mailingAddresses");
    const result = await searchAddressesWithMailing(query);
    expect(result.addresses).toHaveLength(1);
    expect(result.addresses[0].mailing).toMatchObject({status:"matched",record:{unit:"A"}});
  });
  it("does not select a NAR coordinate when no live civic point matches", async () => {
    mockSources({ nearby:[] });
    const { searchAddressesWithMailing } = await import("./mailingAddresses");
    expect((await searchAddressesWithMailing("117 Example Road Judique")).addresses).toEqual([]);
  });
  it("rejects a postal candidate with two live civic matches", async () => {
    mockSources({ nearby:[feature,{ ...feature, properties:{...civic.properties,pntid:"second"} }] });
    const { searchAddressesWithMailing } = await import("./mailingAddresses");
    expect((await searchAddressesWithMailing("117 Example Road Judique")).addresses).toEqual([]);
  });
  it("checks all NAR records before accepting a candidate", async () => {
    mockSources({ records:[record,{...record,id:"second-nar"}] });
    const { searchAddressesWithMailing } = await import("./mailingAddresses");
    expect((await searchAddressesWithMailing("117 Example Road Judique")).addresses).toEqual([]);
  });
  it("distinguishes a failed or corrupt source from no match", async () => {
    mockSources({ failed:true });
    const { searchAddressesWithMailing, enrichCivicAddresses } = await import("./mailingAddresses");
    expect((await searchAddressesWithMailing("117 Example Road Judique")).notice).toContain("unavailable");
    expect((await enrichCivicAddresses([civic]))[0].mailing?.status).toBe("source-error");
    mockSources({ badShard:true });
    expect((await enrichCivicAddresses([civic]))[0].mailing?.status).toBe("source-error");
  });
  it("retains the outage notice when a separate postal search is also truncated", async () => {
    const { searchAddressesWithMailing, mailingShard } = await import("./mailingAddresses");
    const failedShard = mailingShard("example rd");
    const roads = Array.from({length:30}, (_,i) => ({key:`other ${i} rd`,cities:["JUDIQUE"]}))
      .filter(r => mailingShard(r.key) !== failedShard).slice(0,7);
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.endsWith("index.json.gz")) return compressed({version:1,streets:roads});
      if (url.endsWith(`${failedShard}.json.gz`)) throw new Error("one shard unavailable");
      if (url.includes("mailing-addresses")) return compressed({version:1,streets:{}});
      return collection([{...feature,properties:{...civic.properties,comm:"Judique"}}]);
    }));
    const result = await searchAddressesWithMailing("Judique");
    expect(result.addresses).toHaveLength(1);
    expect(result.notice).toContain("unavailable");
    expect(result.notice).toContain("More mailing matches");
  });
  it("does not turn a civic outage into an empty search", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const { searchAddressesWithMailing } = await import("./mailingAddresses");
    await expect(searchAddressesWithMailing("117 Example Road Judique")).rejects.toThrow("offline");
  });
  it("keeps a shared NAR identity ambiguous across a parcel's civic points", async () => {
    mockSources();
    const { enrichCivicAddresses } = await import("./mailingAddresses");
    const rows = await enrichCivicAddresses([civic,{...civic,pntid:"second"}]);
    expect(rows.map(a => a.mailing?.status)).toEqual(["ambiguous","ambiguous"]);
  });
  it("propagates cancellation and does not issue source requests for an aborted lookup", async () => {
    const fetchMock = mockSources();
    const { enrichCivicAddresses } = await import("./mailingAddresses");
    const controller = new AbortController(); controller.abort();
    await expect(enrichCivicAddresses([civic],controller.signal)).rejects.toMatchObject({name:"AbortError"});
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
