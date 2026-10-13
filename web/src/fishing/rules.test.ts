import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  formatRuleDate,
  isIsoDate,
  halifaxIsoDate,
  OFFICIAL_RULE_LINKS,
  parseRulesFile,
  ruleVisibility,
  rulesForSpecies,
  rulesStamp,
  selectRules,
  type RulesFile,
} from "./rules";

const shipped = JSON.parse(readFileSync("public/fishing/rules.json", "utf8")) as unknown;

function entry(id: string, validFrom: string, validUntil: string, standing: boolean, species: string[] = []) {
  return {
    id,
    scope: { spots: ["S01"], species },
    text: `${id} text`,
    source: { label: "Source", url: "https://example.test/rules", section: "s.1" },
    validFrom,
    validUntil,
    standing,
  };
}

const fixture = {
  rulesYear: 2026,
  checked: "2026-10-12",
  validUntil: "2027-03-31",
  notice: "Unofficial summary.",
  entries: [
    entry("standing", "2026-04-01", "2027-10-12", true),
    entry("yearly", "2026-04-01", "2027-03-31", false),
    entry("short", "2026-04-15", "2026-10-31", false),
    entry("later", "2026-06-01", "2027-05-31", false, ["atlantic_salmon"]),
  ],
};

describe("rules file parsing", () => {
  it("reads the shipped file without dropping an entry", () => {
    const file = parseRulesFile(shipped)!;
    expect(file).not.toBeNull();
    expect(file.rulesYear).toBe(2026);
    expect(file.entries.length).toBe((shipped as { entries: unknown[] }).entries.length);
    expect(file.entries.length).toBeGreaterThan(30);
  });

  it("refuses a file whose dates or entries cannot be read", () => {
    expect(parseRulesFile(null)).toBeNull();
    expect(parseRulesFile({ ...fixture, validUntil: "2027-02-30" })).toBeNull();
    expect(parseRulesFile({ ...fixture, checked: "October 12" })).toBeNull();
    expect(parseRulesFile({ ...fixture, rulesYear: "2026" })).toBeNull();
    expect(parseRulesFile({ ...fixture, entries: "none" })).toBeNull();
  });

  it("drops a malformed entry, so whatever names it counts it as hidden", () => {
    const file = parseRulesFile({
      ...fixture,
      entries: [
        ...fixture.entries,
        { ...entry("bad-date", "2026-04-01", "2026-13-01", false) },
        { ...entry("reversed", "2027-01-01", "2026-01-01", false) },
        { ...entry("plain-link", "2026-04-01", "2027-03-31", false), source: { label: "x", url: "javascript:alert(1)", section: "" } },
        { ...entry("no-standing", "2026-04-01", "2027-03-31", false), standing: "yes" },
      ],
    })!;
    expect(file.entries.map(({ id }) => id)).toEqual(["standing", "yearly", "short", "later"]);
    expect(selectRules(file, ["standing", "bad-date", "plain-link"], "2026-10-13")).toEqual({
      shown: [file.entries[0]], hidden: 2, unreadable: 2, unavailable: false,
    });
  });

  it("counts a malformed species entry as hidden in that species' rules", () => {
    const file = parseRulesFile({
      ...fixture,
      entries: [...fixture.entries, { ...entry("salmon-bad", "2026-04-01", "2027-02-29", false, ["atlantic_salmon"]) }],
    })!;
    expect(file.dropped).toEqual([{ id: "salmon-bad", species: ["atlantic_salmon"] }]);
    expect(rulesForSpecies(file, "atlantic_salmon", "2026-10-13")).toEqual({
      shown: [file.entries[3]], hidden: 1, unreadable: 1, unavailable: false,
    });
    expect(rulesForSpecies(file, "cunner", "2026-10-13")).toMatchObject({ hidden: 0, unreadable: 0 });
  });

  it("checks real calendar dates", () => {
    expect(isIsoDate("2026-02-28")).toBe(true);
    expect(isIsoDate("2028-02-29")).toBe(true);
    expect(isIsoDate("2027-02-29")).toBe(false);
    expect(isIsoDate("2026-4-01")).toBe(false);
    expect(isIsoDate(20261013)).toBe(false);
  });
});

describe("the rules gate on a fixed clock", () => {
  const file = parseRulesFile(fixture)!;
  const shown = (today: string) => file.entries.filter((rule) => ruleVisibility(rule, file, today) === "shown").map(({ id }) => id);

  it("shows only what is in force on the day", () => {
    expect(shown("2026-03-31")).toEqual([]);
    expect(shown("2026-04-01")).toEqual(["standing", "yearly"]);
    expect(shown("2026-04-15")).toEqual(["standing", "yearly", "short"]);
    expect(shown("2026-10-13")).toEqual(["standing", "yearly", "short", "later"]);
    expect(shown("2026-10-31")).toEqual(["standing", "yearly", "short", "later"]);
  });

  it("hides an entry the day after its own validUntil", () => {
    expect(shown("2026-11-01")).toEqual(["standing", "yearly", "later"]);
    expect(ruleVisibility(file.entries[2], file, "2026-11-01")).toBe("expired");
  });

  it("hides every dated entry after the file's validUntil, even one whose own date runs later", () => {
    expect(shown("2027-03-31")).toEqual(["standing", "yearly", "later"]);
    expect(shown("2027-04-01")).toEqual(["standing"]);
    expect(ruleVisibility(file.entries[3], file, "2027-04-01")).toBe("file-expired");
  });

  it("keeps a standing rule to its review date, and no further", () => {
    expect(shown("2027-10-12")).toEqual(["standing"]);
    expect(shown("2027-10-13")).toEqual([]);
  });

  it("reports what a spot's list holds back, in the order the spot names its rules", () => {
    expect(selectRules(file, ["yearly", "standing", "short", "missing"], "2026-11-01")).toEqual({
      shown: [file.entries[1], file.entries[0]], hidden: 2, unreadable: 1, unavailable: false,
    });
    expect(selectRules(file, ["yearly", "standing"], "2027-04-01")).toEqual({
      shown: [file.entries[0]], hidden: 1, unreadable: 0, unavailable: false,
    });
  });

  it("fails closed when the file did not load", () => {
    expect(selectRules(null, ["standing", "yearly"], "2026-10-13")).toEqual({ shown: [], hidden: 2, unreadable: 0, unavailable: true });
    expect(rulesForSpecies(null, "atlantic_salmon", "2026-10-13")).toEqual({ shown: [], hidden: 0, unreadable: 0, unavailable: true });
    expect(rulesStamp(null, "2026-10-13")).toEqual({ kind: "unavailable" });
  });

  it("finds a species' rules through its scope", () => {
    expect(rulesForSpecies(file, "atlantic_salmon", "2026-10-13").shown.map(({ id }) => id)).toEqual(["later"]);
    expect(rulesForSpecies(file, "atlantic_salmon", "2027-04-01")).toEqual({ shown: [], hidden: 1, unreadable: 0, unavailable: false });
    expect(rulesForSpecies(file, "cunner", "2026-10-13")).toEqual({ shown: [], hidden: 0, unreadable: 0, unavailable: false });
  });

  it("stamps the summary current through its date and expired after", () => {
    expect(rulesStamp(file, "2027-03-31")).toEqual({ kind: "current", rulesYear: 2026, checked: "2026-10-12", validUntil: "2027-03-31" });
    expect(rulesStamp(file, "2027-04-01")).toEqual({ kind: "expired", rulesYear: 2026, checked: "2026-10-12", validUntil: "2027-03-31" });
  });
});

describe("the shipped rules on a fixed clock", () => {
  const file = parseRulesFile(shipped) as RulesFile;
  const ids = file.entries.map(({ id }) => id);

  it("shows the standing bridge rule today and keeps the dated striped bass notice to its own end", () => {
    expect(selectRules(file, ["bridges"], "2026-10-13").shown.map(({ id }) => id)).toEqual(["bridges"]);
    expect(selectRules(file, ["striped-bass-gulf-2026"], "2026-10-31").hidden).toBe(0);
    expect(selectRules(file, ["striped-bass-gulf-2026"], "2026-11-01").hidden).toBe(1);
  });

  it("leaves only standing rules once the licence year is over, and nothing after their review", () => {
    const afterYear = selectRules(file, ids, "2027-04-01");
    expect(afterYear.shown.length).toBeGreaterThan(0);
    expect(afterYear.shown.every(({ standing }) => standing)).toBe(true);
    expect(selectRules(file, ids, "2028-01-01")).toMatchObject({ shown: [], hidden: ids.length });
  });

  it("never has an entry in force before the rules year began", () => {
    expect(selectRules(file, ids, "2026-03-31").shown).toEqual([]);
  });
});

describe("rule dates and links", () => {
  it("formats dates as written in the summary", () => {
    expect(formatRuleDate("2026-10-12")).toBe("October 12, 2026");
    expect(formatRuleDate("2027-03-31")).toBe("March 31, 2027");
  });

  it("dates the rules in Halifax, wherever the reader is", () => {
    // 00:30 ADT on April 1 is still March 31 in Vancouver: the summary has lapsed for both.
    expect(halifaxIsoDate(new Date("2027-04-01T03:30:00Z"))).toBe("2027-04-01");
    // 23:30 ADT on March 31 is already April 1 in Paris: the summary still holds for both.
    expect(halifaxIsoDate(new Date("2027-04-01T02:30:00Z"))).toBe("2027-03-31");
    // Atlantic Standard Time is UTC-4.
    expect(halifaxIsoDate(new Date("2027-01-02T04:01:00Z"))).toBe("2027-01-02");
    expect(halifaxIsoDate(new Date("2027-01-02T03:59:00Z"))).toBe("2027-01-01");
  });

  it("points at the handbook's landing page, not a yearly file", () => {
    expect(OFFICIAL_RULE_LINKS.map(({ url }) => url)).toContain("https://www.novascotia.ca/documents/anglers-handbook");
    for (const { url } of OFFICIAL_RULE_LINKS) expect(new URL(url).protocol).toBe("https:");
    expect(OFFICIAL_RULE_LINKS.some(({ url }) => url.endsWith(".pdf"))).toBe(false);
  });
});
