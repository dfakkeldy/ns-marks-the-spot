import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { GcpList } from "./GcpList";
import type { Gcp } from "../types";

const GCPS: Gcp[] = [
  { id: "a", pixel: { x: 0, y: 0 }, map: { lat: 46.1, lng: -61.2 } },
  { id: "b", pixel: { x: 1200, y: 0 }, map: { lat: 46.1, lng: -61.0 } },
  { id: "c", pixel: { x: 0, y: 800 }, map: { lat: 46.0, lng: -61.2 } },
  { id: "d", pixel: { x: 1200, y: 800 }, map: { lat: 46.0, lng: -61.0 } },
  { id: "e", pixel: { x: 600, y: 400 }, map: { lat: 46.05, lng: -61.1 } },
];

function renderList(props: Partial<Parameters<typeof GcpList>[0]> = {}) {
  const onDelete = vi.fn();
  const onSelect = vi.fn();
  const onZoomTo = vi.fn();
  render(
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
  return { onDelete, onSelect, onZoomTo };
}

describe("GcpList", () => {
  it("shows an em dash rather than a misleading 0 m at three points", () => {
    renderList({ gcps: GCPS.slice(0, 3) });
    expect(screen.getAllByText("—")).toHaveLength(3);
    expect(screen.queryByText("0 m")).toBeNull();
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
    }
    // Pin each residual to ITS OWN row, not just to the document: getByText
    // alone is satisfied by a reversed or shuffled metresPerGcp/gcps mapping
    // as long as the same four rounded values appear somewhere.
    expect(within(rows[0]).getByText("12 m")).toBeInTheDocument();
    expect(within(rows[1]).getByText("8 m")).toBeInTheDocument();
    expect(within(rows[2]).getByText("41 m")).toBeInTheDocument();
    expect(within(rows[3]).getByText("15 m")).toBeInTheDocument();
  });

  it("marks the worst-fitting point from the fifth point on", () => {
    renderList({
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
    renderList({ gcps: [] });
    expect(screen.queryByRole("table")).toBeNull();
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
});
