import L from "leaflet";

/**
 * One numbered marker style, shared by the scan pane and the live map so a
 * point looks the same on both sides — which is how the user matches a list
 * row to a marker (Task 11 deliberately threads no selection state to the
 * map; the number is the correspondence).
 *
 * `pending` and `selected` are separate flags on purpose. An earlier draft
 * had a single `pendingHalf` boolean and passed `selectedGcpId` into it, so
 * hovering a completed row rendered its marker in the pending style.
 */
export function numberedIcon(
  label: string,
  state: { pending?: boolean; selected?: boolean } = {},
): L.DivIcon {
  const classNames = ["gcp-marker"];
  if (state.pending) {
    classNames.push("gcp-marker--pending");
  }
  if (state.selected) {
    classNames.push("gcp-marker--selected");
  }
  return L.divIcon({
    className: classNames.join(" "),
    html: `<span>${label}</span>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}
