import { useState } from "react";
import type { ResidualReport } from "../transform/residuals";
import type { Gcp, GeoreferenceMethod } from "../types";

type SortKey = "index" | "scan" | "map" | "residual";

/**
 * The residual column means DIFFERENT things per method, and the difference is
 * the one a user acts on. Under affine it is the fit residual — how far this
 * point sits from the fit, so a large value really can mean a misplaced point.
 * Under TPS the spline passes exactly through every control, so the figure is
 * instead leave-one-out: how far the map would move HERE if this point were
 * deleted. A large value there means the point is load-bearing, not wrong.
 *
 * Labelling both "Off by" cost a real sheet: sorting descending and deleting
 * the top of the list took true error at eight frozen checks from 43 m to
 * 392 m, because every deletion removed the only control holding down a sparse
 * patch. The header now says which question it is answering.
 */
function residualColumn(method: GeoreferenceMethod): {
  label: string;
  hint: string;
} {
  return method === "tps"
    ? {
        label: "If removed",
        hint:
          "How far this part of the map would shift if this point were " +
          "deleted. A big number means the point is doing a lot of work — " +
          "not that it is in the wrong place.",
      }
    : {
        label: "Off by",
        hint: "How far this point sits from the fitted transform.",
      };
}

const BASE_COLUMNS: { key: SortKey; label: string }[] = [
  { key: "index", label: "#" },
  { key: "scan", label: "Scan" },
  { key: "map", label: "Map" },
];

type Row = { gcp: Gcp; index: number };

/**
 * Sorts a COPY, and always breaks ties on the original index so the order is
 * total. Without that, points sharing a residual (every un-nudged imported
 * point reads 0 m) would shuffle between renders — and this list re-renders on
 * every pointer move of a drag.
 */
function sortRows(
  rows: Row[],
  sort: { key: SortKey; descending: boolean },
  report: ResidualReport | null,
): Row[] {
  // A point with no residual sorts last in BOTH directions rather than
  // pretending to be 0 m. Zero is a real, meaningful value here — a freshly
  // imported proposal reads exactly that — so parking the unknowns at zero
  // would hide them among the points that most need dragging.
  const residual = (row: Row) => report?.metresPerGcp[row.index];
  const compare = (a: Row, b: Row): number => {
    switch (sort.key) {
      case "index":
        return a.index - b.index;
      case "scan":
        return a.gcp.pixel.x - b.gcp.pixel.x || a.gcp.pixel.y - b.gcp.pixel.y;
      case "map":
        return a.gcp.map.lat - b.gcp.map.lat || a.gcp.map.lng - b.gcp.map.lng;
      case "residual": {
        const left = residual(a);
        const right = residual(b);
        if (left === undefined && right === undefined) return 0;
        if (left === undefined) return 1;
        if (right === undefined) return -1;
        return left - right;
      }
    }
  };
  const missingResidual = (row: Row) =>
    sort.key === "residual" && residual(row) === undefined;
  return [...rows].sort((a, b) => {
    if (missingResidual(a) !== missingResidual(b)) {
      return missingResidual(a) ? 1 : -1;
    }
    const ordered = compare(a, b);
    if (ordered !== 0) {
      return sort.descending ? -ordered : ordered;
    }
    return a.index - b.index;
  });
}

/**
 * Sub-metre precision would be false confidence: a hand-clicked point on a
 * 19th-century scan is not accurate to a centimetre, and trailing decimals
 * invite the user to chase noise.
 *
 * Module-private: nothing else needs it, and exporting a plain function from
 * a .tsx file is a react-refresh/only-export-components error here.
 */
function formatResidual(metres: number): string {
  return `${Math.round(metres)} m`;
}

/**
 * One string, used twice on the same cell: as the mouse tooltip AND as real
 * text in the accessibility tree. Hoisted so the two can never drift — copy is
 * the maintainer's; this is the wording that already shipped in the `title`.
 */
const SUSPECT_LABEL = "Disagrees most with the other points";

export function GcpList({
  gcps,
  report,
  onDelete,
  onSelect,
  onZoomTo,
  selectedGcpId,
  method,
}: {
  gcps: Gcp[];
  report: ResidualReport | null;
  onDelete: (id: string) => void;
  /**
   * Takes `null` as well as an id, because the selection this drives is a
   * HOVER: it has to be given back when the pointer leaves. Without that the
   * highlight is one-way and sticks forever — see the `onMouseLeave` below.
   */
  onSelect: (id: string | null) => void;
  onZoomTo: (id: string) => void;
  selectedGcpId: string | null;
  /** Decides what the residual column is measuring, and so what it is called. */
  method: GeoreferenceMethod;
}) {
  const [sort, setSort] = useState<{ key: SortKey; descending: boolean } | null>(
    null,
  );
  const residual = residualColumn(method);

  // Rows carry their ORIGINAL index, never their position after sorting. The
  // "#" a user reads is the point's identity — the drag workflow refers to it
  // ("rows 46 and up are proposals") — and `report.metresPerGcp` is indexed by
  // it too, so a re-numbered list would mislabel points AND misread residuals.
  const rows = gcps.map((gcp, index) => ({ gcp, index }));
  const ordered = sort ? sortRows(rows, sort, report) : rows;

  function toggleSort(key: SortKey) {
    setSort((current) =>
      current?.key === key
        ? current.descending
          ? // Third click clears it: with no way back to file order, a user
            // who sorted by residual could not find "row 46" again.
            null
          : { key, descending: true }
        : { key, descending: false },
    );
  }

  if (gcps.length === 0) {
    return null;
  }
  return (
    <table className="gcp-list">
      <thead>
        <tr>
          {[...BASE_COLUMNS, { key: "residual" as const, ...residual }].map(({ key, label }) => {
            const active = sort?.key === key;
            return (
              <th
                key={key}
                scope="col"
                aria-sort={
                  active
                    ? sort.descending
                      ? "descending"
                      : "ascending"
                    : "none"
                }
              >
                <button
                  type="button"
                  className="gcp-sort"
                  title={key === "residual" ? residual.hint : undefined}
                  onClick={() => toggleSort(key)}
                >
                  {label}
                  <span aria-hidden="true">
                    {active ? (sort.descending ? " ▾" : " ▴") : ""}
                  </span>
                </button>
              </th>
            );
          })}
          <th scope="col">
            {/* Defined in styles.css (Task 12). Without that rule a literal
                "Actions" heading shows up in the table. */}
            <span className="visually-hidden">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {ordered.map(({ gcp, index }) => {
          // mostInconsistentIndex is `number | null` — null below five
          // points, where no statistic beats chance. A strict === against a
          // number index handles both null and a missing report, so this
          // needs no extra guard, but it does need to stay strict.
          const suspect = report?.mostInconsistentIndex === index;
          // "gcp-row" is not decorative: styles.css targets `.gcp-row td` for
          // cell padding, and it was missing from the DOM in an earlier draft.
          const rowClass = [
            "gcp-row",
            suspect ? "gcp-row--suspect" : "",
            gcp.id === selectedGcpId ? "gcp-row--selected" : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <tr
              key={gcp.id}
              className={rowClass}
              onMouseEnter={() => onSelect(gcp.id)}
              // styles.css describes `.gcp-row--selected` /
              // `.gcp-marker--selected` as "the row currently under the
              // pointer" — twice. Enter without leave made that false the
              // moment the pointer moved away: the row AND its scan marker
              // stayed lit permanently, so after a few passes over the list
              // the highlight pointed at wherever the mouse happened to exit
              // rather than at anything the user was looking at.
              onMouseLeave={() => onSelect(null)}
            >
              <td className="gcp-index">{index + 1}</td>
              <td>
                {Math.round(gcp.pixel.x)}, {Math.round(gcp.pixel.y)}
              </td>
              <td>
                {gcp.map.lat.toFixed(4)}, {gcp.map.lng.toFixed(4)}
              </td>
              <td
                className="gcp-residual"
                // Kept, not replaced: the tooltip is the only thing that
                // explains the border-and-bold to a SIGHTED mouse user, who
                // gets nothing from the clipped span below. The span is the
                // fix for everyone else — `.gcp-row--suspect` is
                // `border-inline-start` + `font-weight` and nothing more, and
                // a `title` on a plain `<td>` is neither keyboard-reachable
                // nor reliably announced. Both carry the SAME string, so if a
                // screen reader does surface the title it repeats this phrase
                // rather than competing with a second wording.
                title={suspect ? SUSPECT_LABEL : undefined}
              >
                {report ? formatResidual(report.metresPerGcp[index]) : "—"}
                {suspect ? (
                  // Inside the cell, not wrapping it: `getNodeText` counts
                  // only DIRECT text children, so the residual is still
                  // findable as its own exact string, and a screen reader
                  // reads the cell as "41 m Disagrees most with the other
                  // points".
                  <span className="visually-hidden">
                    {" "}
                    {SUSPECT_LABEL}
                  </span>
                ) : null}
              </td>
              <td>
                <button
                  type="button"
                  className="gcp-zoom"
                  aria-label={`Zoom to point ${index + 1}`}
                  onClick={() => onZoomTo(gcp.id)}
                >
                  Zoom to
                </button>
                <button
                  type="button"
                  className="gcp-delete"
                  aria-label={`Delete point ${index + 1}`}
                  onClick={() => onDelete(gcp.id)}
                >
                  Delete
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
