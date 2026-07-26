import type { ResidualReport } from "../transform/residuals";
import type { Gcp } from "../types";

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

export function GcpList({
  gcps,
  report,
  onDelete,
  onSelect,
  onZoomTo,
  selectedGcpId,
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
}) {
  if (gcps.length === 0) {
    return null;
  }
  return (
    <table className="gcp-list">
      <thead>
        <tr>
          <th scope="col">#</th>
          <th scope="col">Scan</th>
          <th scope="col">Map</th>
          <th scope="col">Off by</th>
          <th scope="col">
            {/* Defined in styles.css (Task 12). Without that rule a literal
                "Actions" heading shows up in the table. */}
            <span className="visually-hidden">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {gcps.map((gcp, index) => {
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
              <td>{index + 1}</td>
              <td>
                {Math.round(gcp.pixel.x)}, {Math.round(gcp.pixel.y)}
              </td>
              <td>
                {gcp.map.lat.toFixed(4)}, {gcp.map.lng.toFixed(4)}
              </td>
              <td
                className="gcp-residual"
                title={
                  suspect
                    ? "Disagrees most with the other points"
                    : undefined
                }
              >
                {report ? formatResidual(report.metresPerGcp[index]) : "—"}
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
