import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { GcpList } from "./GcpList";
import type { Gcp } from "../types";

const GCPS: Gcp[] = [
  { id: "a", pixel: { x: 0, y: 0 }, map: { lat: 46.1, lng: -61.2 } },
  { id: "b", pixel: { x: 1200, y: 0 }, map: { lat: 46.1, lng: -61.0 } },
  { id: "c", pixel: { x: 0, y: 800 }, map: { lat: 46.0, lng: -61.2 } },
  // Pixel is deliberately non-integer: every OTHER fixture pixel is already
  // a whole number (0/600/800/1200), so none of them can distinguish
  // Math.round(x) from a bare x in the Scan column. Chosen so the rounded
  // result (1200, 800) still matches the OLD integer value, isolating the
  // rounding itself as the thing under test.
  { id: "d", pixel: { x: 1200.4, y: 799.6 }, map: { lat: 46.0, lng: -61.0 } },
  { id: "e", pixel: { x: 600, y: 400 }, map: { lat: 46.05, lng: -61.1 } },
];

function renderList(props: Partial<Parameters<typeof GcpList>[0]> = {}) {
  const onDelete = vi.fn();
  const onSelect = vi.fn();
  const onZoomTo = vi.fn();
  const view = render(
    <GcpList
      gcps={GCPS.slice(0, 4)}
      report={null}
      onDelete={onDelete}
      onSelect={onSelect}
      onZoomTo={onZoomTo}
      selectedGcpId={null}
      {...props}
    />,
  );
  return {
    onDelete,
    onSelect,
    onZoomTo,
    container: view.container,
    rerender: view.rerender,
  };
}

describe("GcpList", () => {
  it("shows an em dash rather than a misleading 0 m at three points", () => {
    renderList({ gcps: GCPS.slice(0, 3) });
    expect(screen.getAllByText("—")).toHaveLength(3);
    expect(screen.queryByText("0 m")).toBeNull();
    // report is null below 4 GCPs — there is no report to accuse anyone
    // from, so nothing may be highlighted here either. Without this loop, a
    // component that defaults a null report's mostInconsistentIndex to 0
    // (instead of leaving every row unmarked) still passes every other
    // assertion in this file.
    const rows = screen.getAllByRole("row").slice(1);
    for (const row of rows) {
      expect(row).not.toHaveClass("gcp-row--suspect");
    }
  });

  it("renders residuals in metres but accuses nobody at four points", () => {
    // residualReport hands back mostInconsistentIndex: null below five
    // points. The numbers are real and worth showing; the accusation is not
    // — at four points the residual space is one-dimensional (I − H has rank
    // 1), so raw, leave-one-out and studentized residuals rank identically
    // and all three are at chance.
    renderList({
      report: {
        metresPerGcp: [12.4, 8.1, 40.9, 15.2],
        rmsMetres: 22.3,
        mostInconsistentIndex: null,
      },
    });
    expect(screen.getByText("12 m")).toBeInTheDocument();
    expect(screen.getByText("41 m")).toBeInTheDocument();
    const rows = screen.getAllByRole("row").slice(1);
    for (const row of rows) {
      expect(row).not.toHaveClass("gcp-row--suspect");
      // "gcp-row" is not decorative — styles.css (Task 12) targets
      // `.gcp-row td` for cell padding, and the component's own comment
      // records it once going missing from the DOM in an earlier draft.
      expect(row).toHaveClass("gcp-row");
    }
    // Pin each residual to ITS OWN row, not just to the document: getByText
    // alone is satisfied by a reversed or shuffled metresPerGcp/gcps mapping
    // as long as the same four rounded values appear somewhere.
    expect(within(rows[0]).getByText("12 m")).toBeInTheDocument();
    expect(within(rows[1]).getByText("8 m")).toBeInTheDocument();
    expect(within(rows[2]).getByText("41 m")).toBeInTheDocument();
    expect(within(rows[3]).getByText("15 m")).toBeInTheDocument();
    // "gcp-residual" is Task 12's other styling hook on this cell.
    expect(within(rows[0]).getByText("12 m")).toHaveClass("gcp-residual");
  });

  it("marks the worst-fitting point from the fifth point on", () => {
    const { onDelete, onSelect, onZoomTo, rerender } = renderList({
      gcps: GCPS,
      report: {
        metresPerGcp: [12.4, 8.1, 40.9, 15.2, 9.7],
        rmsMetres: 22.3,
        mostInconsistentIndex: 2,
      },
    });
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows[2]).toHaveClass("gcp-row--suspect");
    expect(rows[3]).not.toHaveClass("gcp-row--suspect");
    // The suspect cell explains itself; a non-suspect cell must not.
    expect(within(rows[2]).getByText("41 m")).toHaveAttribute(
      "title",
      "Disagrees most with the other points",
    );
    expect(within(rows[3]).getByText("15 m")).not.toHaveAttribute("title");

    // Re-render with mostInconsistentIndex moved from 2 to 0, everything
    // else held fixed (same 5 gcps, same gcps.length). A component that
    // reads the report is at chance; one that duplicates the threshold into
    // the view — e.g. `gcps.length >= 5 && index === 2` — would still mark
    // row 2 here and never mark row 0, since neither depends on the report's
    // actual verdict. The first fixture alone cannot tell these apart:
    // mostInconsistentIndex: 2 is coincidentally both the largest residual
    // (40.9) AND a constant, three explanations for one observation.
    rerender(
      <GcpList
        gcps={GCPS}
        report={{
          metresPerGcp: [12.4, 8.1, 40.9, 15.2, 9.7],
          rmsMetres: 22.3,
          mostInconsistentIndex: 0,
        }}
        onDelete={onDelete}
        onSelect={onSelect}
        onZoomTo={onZoomTo}
        selectedGcpId={null}
      />,
    );
    const rowsAfter = screen.getAllByRole("row").slice(1);
    expect(rowsAfter[0]).toHaveClass("gcp-row--suspect");
    expect(rowsAfter[2]).not.toHaveClass("gcp-row--suspect");
  });

  it("gives each row its own 1-based, visible row number", () => {
    // gcpIcon.ts states the number IS the correspondence between a list row
    // and its map marker, and ScanPane.tsx labels markers `String(index +
    // 1)` — pinned there already. Here the number was previously asserted
    // only through the delete/zoom buttons' aria-labels, which are computed
    // from the SAME `index + 1` expression as the visible cell: a mutant
    // that breaks one but not the other (e.g. the visible cell regresses to
    // 0-based while the aria-labels stay 1-based) had nothing to catch it.
    renderList();
    const rows = screen.getAllByRole("row").slice(1);
    expect(within(rows[0]).getAllByRole("cell")[0]).toHaveTextContent("1");
    expect(within(rows[1]).getAllByRole("cell")[0]).toHaveTextContent("2");
    expect(within(rows[2]).getAllByRole("cell")[0]).toHaveTextContent("3");
    expect(within(rows[3]).getAllByRole("cell")[0]).toHaveTextContent("4");
  });

  it("keeps the Actions column heading visually hidden", () => {
    // styles.css (Task 12) hides this text; without the class a literal
    // "Actions" heading is visible in the rendered page even though no unit
    // test here depends on the CSS rule existing.
    renderList();
    expect(screen.getByText("Actions")).toHaveClass("visually-hidden");
  });

  it("rounds scan pixels and prints full map coordinates per row, not transposed", () => {
    // GCPS[3] ("d") is the only fixture point with a non-integer pixel, so
    // it is the only row that can tell Math.round(x) apart from a bare x —
    // both round to the same 1200/800 here, but a dropped Math.round would
    // print the raw 1200.4/799.6 instead.
    renderList();
    const rows = screen.getAllByRole("row").slice(1);
    expect(within(rows[3]).getByText("1200, 800")).toBeInTheDocument();
    // lat and lng are both plausible-looking decimal degrees near Nova
    // Scotia, so a transposed `{lng}, {lat}` (or a dropped toFixed(4)) reads
    // as a real coordinate rather than obvious garbage — pin the exact
    // rendered string, not just that "some" text is present.
    expect(
      within(rows[3]).getByText("46.0000, -61.0000"),
    ).toBeInTheDocument();
  });

  it("deletes a point by its number", async () => {
    const { onDelete } = renderList();
    await userEvent.click(screen.getByRole("button", { name: "Delete point 2" }));
    expect(onDelete).toHaveBeenCalledWith("b");
  });

  it("navigates to a point by its number", async () => {
    // The list is the stated debugging tool: seeing a 400 m residual is only
    // half of it if you cannot get to the point that caused it.
    const { onZoomTo } = renderList();
    await userEvent.click(screen.getByRole("button", { name: "Zoom to point 3" }));
    expect(onZoomTo).toHaveBeenCalledWith("c");
  });

  it("says nothing at all when there are no points", () => {
    const { container } = renderList({ gcps: [] });
    expect(screen.queryByRole("table")).toBeNull();
    // queryByRole("table") alone is satisfied by any non-table replacement
    // (e.g. a "No control points yet" paragraph) — pin the stronger claim
    // that the component renders nothing at all.
    expect(container).toBeEmptyDOMElement();
  });

  it("reports the hovered row and marks the selected one", async () => {
    // Neither `onSelect` nor `selectedGcpId` was asserted anywhere. Delete
    // both props and every other test in this file and in
    // GeoreferencePanel.test.tsx still passes — while `.gcp-row--selected`,
    // `.gcp-marker--selected`, ScanPane's `selectedGcpId` prop and
    // numberedIcon's `selected` branch all go dead at once.
    const { onSelect } = renderList({ selectedGcpId: "c" });
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows[2]).toHaveClass("gcp-row--selected");
    expect(rows[0]).not.toHaveClass("gcp-row--selected");
    await userEvent.hover(rows[0]);
    expect(onSelect).toHaveBeenCalledWith("a");
  });

  it("gives the selection back when the pointer leaves the row", async () => {
    // onMouseEnter with no onMouseLeave is a ONE-WAY highlight: styles.css
    // calls `.gcp-row--selected` / `.gcp-marker--selected` "the row currently
    // under the pointer", and without this the row and its scan marker stay
    // lit permanently after the pointer moves away. The hover test above is
    // green either way — it never unhovers.
    const { onSelect } = renderList();
    const rows = screen.getAllByRole("row").slice(1);
    await userEvent.hover(rows[0]);
    expect(onSelect).toHaveBeenLastCalledWith("a");
    await userEvent.unhover(rows[0]);
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });
});
