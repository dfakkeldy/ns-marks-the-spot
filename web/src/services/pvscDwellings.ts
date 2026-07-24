import { normalizeAan } from "./pvscAssessments";

export const PVSC_DWELLING_DATASET_URL =
  "https://www.thedatazone.ca/Assessment/Residential-Dwelling-Characteristics/a859-xvcs";
export const PVSC_DWELLING_API_URL =
  "https://www.thedatazone.ca/resource/a859-xvcs.json";
export const PVSC_DWELLING_SOURCE_DATE = "Dataset updated January 12, 2026";

const DWELLING_FIELDS = [
  "aan",
  "year_built",
  "style",
  "square_foot_living_area",
  "living_units",
  "bathrooms",
  "garage",
  "under_construction",
].join(",");
const DWELLING_QUERY_LIMIT = 100;

type PvscDwellingRawRow = {
  aan?: unknown;
  year_built?: unknown;
  style?: unknown;
  square_foot_living_area?: unknown;
  living_units?: unknown;
  bathrooms?: unknown;
  garage?: unknown;
  under_construction?: unknown;
};

export type PvscDwelling = {
  yearBuilt: number | null;
  style: string | null;
  squareFeetLivingArea: number | null;
  livingUnits: number | null;
  bathrooms: number | null;
  garage: boolean | null;
  underConstruction: boolean | null;
};

export type PvscDwellingAccount = {
  aan: string;
  dwellings: PvscDwelling[];
};

export function buildDwellingQueryUrl(aans: readonly string[]): string {
  const normalized = Array.from(
    new Set(
      aans.map(normalizeAan).filter((aan): aan is string => aan !== null),
    ),
  );
  if (normalized.length === 0) {
    throw new Error(
      "PVSC dwelling queries require at least one valid Assessment Account Number.",
    );
  }

  const url = new URL(PVSC_DWELLING_API_URL);
  url.search = new URLSearchParams({
    "$select": DWELLING_FIELDS,
    "$where": `aan in(${normalized.map((aan) => `'${aan}'`).join(",")})`,
    "$order": "aan,year_built DESC",
    "$limit": String(DWELLING_QUERY_LIMIT),
  }).toString();
  return url.toString();
}

function numberValue(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function textValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function flagValue(value: unknown): boolean | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toUpperCase();
  return normalized === "Y" ? true : normalized === "N" ? false : null;
}

function parseRow(
  row: PvscDwellingRawRow,
): { aan: string; dwelling: PvscDwelling } | null {
  const aan = typeof row.aan === "string" ? normalizeAan(row.aan) : null;
  if (!aan) {
    return null;
  }
  return {
    aan,
    dwelling: {
      yearBuilt: numberValue(row.year_built),
      style: textValue(row.style),
      squareFeetLivingArea: numberValue(row.square_foot_living_area),
      livingUnits: numberValue(row.living_units),
      bathrooms: numberValue(row.bathrooms),
      garage: flagValue(row.garage),
      underConstruction: flagValue(row.under_construction),
    },
  };
}

export async function fetchDwellingCharacteristics(
  aans: readonly string[],
  signal?: AbortSignal,
): Promise<PvscDwellingAccount[]> {
  const normalized = Array.from(
    new Set(
      aans.map(normalizeAan).filter((aan): aan is string => aan !== null),
    ),
  );
  if (normalized.length === 0) {
    return [];
  }

  const response = await fetch(buildDwellingQueryUrl(normalized), { signal });
  if (!response.ok) {
    throw new Error(
      `PVSC dwelling request failed with status ${response.status}.`,
    );
  }
  const payload = (await response.json()) as unknown;
  if (!Array.isArray(payload)) {
    throw new Error("PVSC dwelling data returned an unexpected response.");
  }

  const accounts = new Map<string, PvscDwelling[]>();
  for (const row of payload as PvscDwellingRawRow[]) {
    const parsed = parseRow(row);
    if (!parsed) {
      continue;
    }
    const dwellings = accounts.get(parsed.aan) ?? [];
    dwellings.push(parsed.dwelling);
    accounts.set(parsed.aan, dwellings);
  }

  return [...accounts]
    .sort(([left], [right]) => left.localeCompare(right, "en-CA"))
    .map(([aan, dwellings]) => ({
      aan,
      dwellings: [...dwellings].sort(
        (left, right) =>
          (right.yearBuilt ?? Number.NEGATIVE_INFINITY) -
          (left.yearBuilt ?? Number.NEGATIVE_INFINITY),
      ),
    }));
}
