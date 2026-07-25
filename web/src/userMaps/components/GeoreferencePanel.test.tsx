import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

// ScanPane mounts a real MapContainer, which needs a sized DOM node jsdom
// does not provide. The panel's own behaviour is what this file tests, so the
// scan side is stubbed; its coordinate maths, its click/drag wiring AND its
// root class have direct tests in Task 8's ScanPane.test.tsx.
//
// The stub renders `.georeference-scan` so the layout test below can assert
// the panel's grid children. That is only honest because ScanPane.test.tsx
// pins the same class on the REAL component — without it this assertion would
// be checking a class invented three lines up, and renaming the real one
// would kill three CSS rules with the whole suite green.
//
// It also records every FULL props object it was called with, on every
// render. Two independent things depend on that:
//  - `focus`: ScanPane.test.tsx proves the REAL component re-runs its focus
//    effect for every distinct `focus` OBJECT; it cannot prove this panel
//    actually mints a fresh object per "Zoom to" click rather than reusing
//    one — that half lives here, in `zoomToGcp`'s `focusRequestId` counter.
//    See "mints a fresh scan-focus request..." below.
//  - the other eight props: `onMoveGcp`/`moveGcpOnMap`, `onPickPoint`/
//    `pickMapPoint`, and `onDragStartGcp` in particular share signatures
//    with a wrong-but-plausible neighbour, so a swap between them is
//    `tsc -b`-clean and green against every OTHER test in this file, because
//    a stub that discards its props can't see which function it was handed.
//    See "passes the real handlers..." below.
const scanPaneCalls: Array<Record<string, unknown>> = [];
vi.mock("./ScanPane", () => ({
  ScanPane: (props: Record<string, unknown>) => {
    scanPaneCalls.push(props);
    return <div className="georeference-scan" data-testid="scan-pane" />;
  },
}));

import { GeoreferencePanel } from "./GeoreferencePanel";
import { statusMessage } from "./georeferenceStatus";
import type { GeoreferenceSession } from "../useGeoreferenceSession";
import type { UserMapRecord } from "../types";

const RECORD: UserMapRecord = {
  id: "m",
  name: "Church of Inverness 1888",
  source: "image",
  createdAt: "2026-07-25T00:00:00.000Z",
  pixelSize: { width: 1200, height: 800 },
  georef: { kind: "gcp", method: "affine", gcps: [] },
};

function fakeSession(overrides: Partial<GeoreferenceSession> = {}): GeoreferenceSession {
  return {
    gcps: [],
    pending: null,
    params: null,
    mesh: null,
    report: null,
    status: { kind: "need-more", remaining: 3 },
    canUndo: false,
    pickScanPoint: vi.fn(),
    pickMapPoint: vi.fn(),
    cancelPending: vi.fn(),
    beginDragGcp: vi.fn(),
    moveGcpOnScan: vi.fn(),
    moveGcpOnMap: vi.fn(),
    deleteGcp: vi.fn(),
    undo: vi.fn(),
    flush: vi.fn(),
    // Task 12 adds this to GeoreferenceSession (a delete has to cancel its
    // pending write, not flush it). The factory returns the full type, so a
    // missing field is a `tsc -b` error, not a silent gap.
    discardPendingWrite: vi.fn(),
    ...overrides,
  };
}

function renderPanel(session: GeoreferenceSession, props: Partial<Parameters<typeof GeoreferencePanel>[0]> = {}) {
  const onClose = vi.fn();
  const onDelete = vi.fn();
  const onOpacityChange = vi.fn();
  const onToggleReferenceLayer = vi.fn();
  const onFocusGcpOnMap = vi.fn();
  const utils = render(
    <GeoreferencePanel
      record={RECORD}
      previewUrl="blob:scan"
      opacity={0.7}
      session={session}
      onOpacityChange={onOpacityChange}
      onClose={onClose}
      onDelete={onDelete}
      onFocusGcpOnMap={onFocusGcpOnMap}
      referenceLayers={{ aerial: false, parcels: true }}
      referenceLayersLocked={false}
      onToggleReferenceLayer={onToggleReferenceLayer}
      {...props}
    />,
  );
  return {
    ...utils,
    onClose,
    onDelete,
    onOpacityChange,
    onToggleReferenceLayer,
    onFocusGcpOnMap,
  };
}

describe("statusMessage", () => {
  it("asks for a fourth point rather than reporting a fake 0 m", () => {
    expect(statusMessage({ kind: "exact-fit" })).toBe(
      "Exact fit — add a 4th point to check accuracy.",
    );
  });

  it("counts down to the minimum", () => {
    expect(statusMessage({ kind: "need-more", remaining: 3 })).toBe(
      "Place 3 points to see the map drape.",
    );
    expect(statusMessage({ kind: "need-more", remaining: 1 })).toBe(
      "Place 1 more point to see the map drape.",
    );
  });

  it("explains a refused solve without claiming it is always a straight scan line", () => {
    // The status covers three refusals, only one of which is "the points on
    // the SCAN are nearly collinear": a non-finite result and a 50:1 axis
    // squash also land here, and the squash is what three map clicks down a
    // meridian produce from a perfectly good scan triangle. Copy that said
    // "move one off the line" would be wrong advice in two cases out of
    // three, so it names both sides.
    expect(statusMessage({ kind: "degenerate" })).toBe(
      "These points can't pin the map down — check that neither the scan " +
        "points nor the map points sit on a straight line.",
    );
  });

  it("reports RMS with the point count", () => {
    expect(statusMessage({ kind: "solved", rmsMetres: 42.4, count: 5 })).toBe(
      "RMS 42 m across 5 points",
    );
  });

  it("prompts for the other half of a pending pair", () => {
    expect(statusMessage({ kind: "awaiting-map" })).toBe(
      "Now click the same spot on the map. (Esc to cancel)",
    );
    expect(statusMessage({ kind: "awaiting-scan" })).toBe(
      "Now click the same spot on the scan. (Esc to cancel)",
    );
  });
});

describe("GeoreferencePanel", () => {
  it("renders a full-viewport overlay whose class names match the stylesheet", () => {
    // Asserts the RENDERED DOM, not the CSS text. Task 12's style tests regex
    // styles.css, so they pass whether or not anything ever renders these
    // class names — which is how an earlier draft shipped a stylesheet
    // targeting .georeference-overlay, .georeference-side and [data-tab]
    // against a DOM that had none of them. The panel landed in normal
    // document flow at the end of the page, and every style test was green.
    const { container } = renderPanel(fakeSession());
    const overlay = container.querySelector(".georeference-overlay");
    expect(overlay).not.toBeNull();
    const panel = overlay?.querySelector(".georeference-panel");
    expect(panel).not.toBeNull();
    expect(panel).toHaveAttribute("data-tab", "scan");
    // The narrow breakpoint puts the tabs in their own grid ROW, so they have
    // to be a direct child of the panel, not nested inside the header.
    expect(panel?.querySelector(":scope > .georeference-tabs")).not.toBeNull();
    expect(panel?.querySelector(":scope > .georeference-scan")).not.toBeNull();
    expect(panel?.querySelector(":scope > .georeference-side")).not.toBeNull();
  });

  it("leaves the app's own map reachable behind it", () => {
    // The critical one. The next thing the user must do is click the map
    // BEHIND this component. An earlier draft rendered an opaque full-bleed
    // card over a scrim, so MapClickCatcher never received a click and no
    // control point could ever be completed. jsdom does no layout, so this
    // asserts the two structural facts that make the CSS possible: the
    // overlay is not a scrim-and-card pair, and the narrow Map tab's floating
    // bar is a SIBLING of the panel (Task 12 hides the panel outright there,
    // and a child would be hidden with it). The declarations themselves are
    // pinned by styles.test.ts in Task 12; neither half substitutes for the
    // other.
    const { container } = renderPanel(fakeSession());
    const overlay = container.querySelector(".georeference-overlay");
    const bar = overlay?.querySelector(":scope > .georeference-map-bar");
    expect(bar).not.toBeNull();
    expect(bar).toHaveAttribute("data-tab", "scan");
    expect(
      container.querySelector(".georeference-panel .georeference-map-bar"),
    ).toBeNull();
  });

  it("switches which pane the narrow layout shows, and offers the way back", async () => {
    const { container } = renderPanel(fakeSession());
    await userEvent.click(screen.getByRole("tab", { name: "Map" }));
    expect(container.querySelector(".georeference-panel")).toHaveAttribute(
      "data-tab",
      "map",
    );
    // The panel is display:none at this breakpoint, so the bar is the only
    // thing carrying the prompt — and the only way back to the scan.
    expect(container.querySelector(".georeference-map-bar")).toHaveAttribute(
      "data-tab",
      "map",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Back to scan" }),
    );
    expect(container.querySelector(".georeference-panel")).toHaveAttribute(
      "data-tab",
      "scan",
    );
  });

  it("announces status politely for screen readers", () => {
    renderPanel(fakeSession());
    // TWO live regions on purpose: the panel header, and the floating bar
    // that is the only visible prompt on the narrow Map tab, where CSS hides
    // the panel outright. Both must carry the same text — a bar showing a
    // stale prompt is worse than no bar.
    const statuses = screen.getAllByRole("status");
    expect(statuses).toHaveLength(2);
    for (const status of statuses) {
      expect(status).toHaveTextContent("Place 3 points to see the map drape.");
    }
  });

  it("names the map being georeferenced", () => {
    renderPanel(fakeSession());
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      "Church of Inverness 1888",
    );
  });

  it("cancels a pending point on Escape, and only closes when none is pending", async () => {
    const pending = fakeSession({
      pending: { side: "scan", pixel: { x: 1, y: 2 } },
      status: { kind: "awaiting-map" },
    });
    const { onClose } = renderPanel(pending);
    await userEvent.keyboard("{Escape}");
    expect(pending.cancelPending).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("flushes pending writes before closing on Escape", async () => {
    // Both halves, in one test, because asserting only `onClose` lets an
    // implementation drop `flush()` from this branch and stay green: writes
    // are debounced 400 ms, so an edit made inside that window and closed
    // with Escape is simply lost on reload. Done had this assertion; Escape
    // did not, and Escape is the faster habit.
    const session = fakeSession();
    const { onClose } = renderPanel(session);
    await userEvent.keyboard("{Escape}");
    expect(session.flush).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("flushes pending writes before closing", async () => {
    const session = fakeSession();
    const { onClose } = renderPanel(session);
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(session.flush).toHaveBeenCalled();
    // `close()` (the Done path) is a code path entirely separate from
    // Escape's own inline `flush(); onClose();` — asserting only `flush`
    // here lets an implementation drop `onClose()` from `close()` and stay
    // green, leaving the panel stuck open with the app's map occluded
    // behind it even though the write went through.
    expect(onClose).toHaveBeenCalled();
  });

  it("undoes with the keyboard shortcut", async () => {
    const session = fakeSession({ canUndo: true });
    renderPanel(session);
    await userEvent.keyboard("{Control>}z{/Control}");
    expect(session.undo).toHaveBeenCalled();
  });

  it("undoes when the Undo button is clicked", async () => {
    // The Ctrl+Z test above exercises the keyboard path only; the button's
    // own onClick is a separate piece of markup with nothing else in this
    // file asserting on it.
    const session = fakeSession({ canUndo: true });
    renderPanel(session);
    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(session.undo).toHaveBeenCalled();
  });

  it("disables Undo when there is nothing to undo", () => {
    renderPanel(fakeSession());
    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
  });

  it("does not swallow Ctrl/Cmd+Z typed into an app input outside the panel", () => {
    // The overlay is deliberately non-modal — `pointer-events: none`, no
    // scrim — so the app's OWN inputs (e.g. a PID search box) stay focusable
    // while this panel is open. A global keydown listener that
    // preventDefault()s every Ctrl/Cmd+Z regardless of origin silently
    // breaks native text-undo in a completely different control the user
    // never asked this panel to touch.
    const externalInput = document.createElement("input");
    externalInput.type = "text";
    document.body.appendChild(externalInput);
    const session = fakeSession({ canUndo: true });
    renderPanel(session);
    const notPrevented = fireEvent.keyDown(externalInput, {
      key: "z",
      ctrlKey: true,
    });
    expect(session.undo).not.toHaveBeenCalled();
    // fireEvent's return value is false iff some handler called
    // preventDefault() — false here would mean this panel just ate the
    // browser's native undo in a field it doesn't own.
    expect(notPrevented).toBe(true);
    document.body.removeChild(externalInput);
  });

  it("still undoes via Ctrl/Cmd+Z from an editable element INSIDE the panel", () => {
    // The scope in the test above must not become "ignore Ctrl/Cmd+Z from
    // any editable element anywhere" — an editable control that later lands
    // inside the panel itself still needs the shortcut to work.
    const session = fakeSession({ canUndo: true });
    const { container } = renderPanel(session);
    const panel = container.querySelector(".georeference-panel");
    if (!panel) {
      throw new Error("panel not found");
    }
    const insideInput = document.createElement("input");
    insideInput.type = "text";
    panel.appendChild(insideInput);
    fireEvent.keyDown(insideInput, { key: "z", ctrlKey: true });
    expect(session.undo).toHaveBeenCalled();
  });

  it("offers the reference layers the hidden rail would otherwise strand", async () => {
    const { onToggleReferenceLayer } = renderPanel(fakeSession());
    const aerial = screen.getByRole("checkbox", { name: "Aerial imagery" });
    expect(aerial).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Property boundaries" })).toBeChecked();
    await userEvent.click(aerial);
    expect(onToggleReferenceLayer).toHaveBeenCalledWith("aerial", true);
  });

  it("will not switch on restricted layers the user has not licensed", async () => {
    // The rest of the app gates ns-aerial and nsprd behind licence
    // acceptance. A panel that flipped them anyway would be a way around it.
    const { onToggleReferenceLayer } = renderPanel(fakeSession(), {
      referenceLayersLocked: true,
    });
    const aerial = screen.getByRole("checkbox", { name: "Aerial imagery" });
    expect(aerial).toBeDisabled();
    await userEvent.click(aerial);
    expect(onToggleReferenceLayer).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        "Close this panel and accept the provincial data licence to use these.",
      ),
    ).toBeInTheDocument();
  });

  it("drives the drape opacity", () => {
    const { onOpacityChange } = renderPanel(fakeSession());
    const slider = screen.getByRole("slider", { name: "Map opacity" });
    expect(slider).toHaveValue("70");
    // NOT userEvent.clear(): verified to throw "clear() is only supported on
    // editable elements" against an input[type=range]. fireEvent.change is
    // how a slider is moved in jsdom, and fires exactly one change event.
    fireEvent.change(slider, { target: { value: "40" } });
    expect(onOpacityChange).toHaveBeenCalledWith(0.4);
  });

  it("asks App to move the live map when a row asks to zoom to its point", async () => {
    // The scan side is stubbed in this file, so only the App-facing half is
    // observable here; the scan half is a setView inside ScanPane and is
    // covered by the live check in Task 13.
    const session = fakeSession({
      gcps: [{ id: "a", pixel: { x: 10, y: 20 }, map: { lat: 46, lng: -61 } }],
    });
    const { onFocusGcpOnMap } = renderPanel(session);
    await userEvent.click(
      screen.getByRole("button", { name: "Zoom to point 1" }),
    );
    expect(onFocusGcpOnMap).toHaveBeenCalledWith(
      expect.objectContaining({ id: "a" }),
    );
  });

  it("mints a fresh scan-focus request each time the same point is zoomed to", async () => {
    // ScanFocusRequest carries a monotonic requestId (Task 8) precisely so
    // that asking to recentre on the SAME point twice still moves the map:
    // ScanPane's effect keys on the focus OBJECT, and an equal object the
    // second time would be a no-op. If `zoomToGcp` ever stopped incrementing
    // `focusRequestId.current` — e.g. reused one object, or built a new
    // object without bumping the counter — two "Zoom to" clicks on the same
    // row would silently fail to move the scan a second time, and nothing
    // else in this file would catch it, because the stub above normally
    // discards its props.
    scanPaneCalls.length = 0;
    const session = fakeSession({
      gcps: [{ id: "a", pixel: { x: 10, y: 20 }, map: { lat: 46, lng: -61 } }],
    });
    renderPanel(session);
    const zoomButton = screen.getByRole("button", {
      name: "Zoom to point 1",
    });
    await userEvent.click(zoomButton);
    await userEvent.click(zoomButton);

    const focusValues = scanPaneCalls
      .map(
        (call) =>
          call.focus as { pixel: { x: number; y: number }; requestId: number } | null,
      )
      .filter(
        (focus): focus is { pixel: { x: number; y: number }; requestId: number } =>
          focus !== null,
      );
    expect(focusValues.length).toBeGreaterThanOrEqual(2);
    // Same point both times...
    for (const focus of focusValues) {
      expect(focus.pixel).toEqual({ x: 10, y: 20 });
    }
    // ...but at least two DISTINCT ids were minted across all renders. Not a
    // last-two comparison: GcpList's row `onMouseEnter -> onSelect` can push
    // extra re-renders (this component re-renders on hover too), so a
    // trailing render carrying the same, unchanged focus object would make
    // the last two entries equal even against a CORRECT implementation. A
    // set-based count is invariant to how many extra renders land in between.
    const requestIds = focusValues.map((focus) => focus.requestId);
    expect(new Set(requestIds).size).toBeGreaterThanOrEqual(2);
  });

  it("wires the real GcpList's Delete button straight to deleteGcp", async () => {
    // GcpList is NOT stubbed in this file (only ScanPane is), so its
    // aria-label="Delete point 1" button is fully reachable here and nothing
    // else in this file clicks it. `deleteGcp` is meant to be passed straight
    // through with no extra `snapshot()` call — deleteGcp already snapshots
    // internally (useGeoreferenceSession.ts), and a second snapshot here
    // would insert a phantom step into the undo stack. This assertion is
    // also the guard against a future edit adding one.
    const gcp = { id: "a", pixel: { x: 10, y: 20 }, map: { lat: 46, lng: -61 } };
    const session = fakeSession({ gcps: [gcp] });
    renderPanel(session);
    await userEvent.click(
      screen.getByRole("button", { name: "Delete point 1" }),
    );
    expect(session.deleteGcp).toHaveBeenCalledWith("a");
  });

  it("passes the real residual report to GcpList instead of hardcoding null", () => {
    // report={null} passes every other test in this file green: the "Off by"
    // column just reads "—" forever, permanently, and nothing here would
    // notice.
    const gcp = { id: "a", pixel: { x: 10, y: 20 }, map: { lat: 46, lng: -61 } };
    const session = fakeSession({
      gcps: [gcp],
      report: {
        rmsMetres: 12.3,
        metresPerGcp: [42.4],
        mostInconsistentIndex: null,
      },
    });
    const { container } = renderPanel(session);
    expect(container.querySelector(".gcp-residual")).toHaveTextContent(
      "42 m",
    );
  });

  it("wires GcpList's hover-to-select round trip", () => {
    // onSelect={() => {}} and selectedGcpId={null} both pass every other
    // test in this file green: nothing else here hovers a row, so the
    // selection round trip between the panel's own `selectedGcpId` state
    // and the class GcpList renders back is otherwise unobserved.
    const gcpA = { id: "a", pixel: { x: 10, y: 20 }, map: { lat: 46, lng: -61 } };
    const gcpB = { id: "b", pixel: { x: 30, y: 40 }, map: { lat: 47, lng: -62 } };
    const session = fakeSession({ gcps: [gcpA, gcpB] });
    const { container } = renderPanel(session);
    const rows = container.querySelectorAll(".gcp-row");
    expect(rows[0]).not.toHaveClass("gcp-row--selected");
    fireEvent.mouseEnter(rows[0]);
    expect(rows[0]).toHaveClass("gcp-row--selected");
    expect(rows[1]).not.toHaveClass("gcp-row--selected");
  });

  it("passes the real handlers and values straight through to ScanPane", () => {
    // Each of these props has a wrong-but-plausible neighbour with an
    // IDENTICAL signature, so a swap compiles clean and is invisible to
    // every other test in this file (the stub above normally discards its
    // props): onMoveGcp <-> moveGcpOnMap would rewrite a scan-side pixel
    // drag as a lat/lng write (silent data corruption); onPickPoint <->
    // pickMapPoint would record every scan click as a map click;
    // onDragStartGcp dropped entirely reopens the exact StrictMode
    // regression documented on ScanPane's own dragstart handler, where one
    // Ctrl+Z walks back past an entire drag instead of one step.
    scanPaneCalls.length = 0;
    const gcp = { id: "a", pixel: { x: 10, y: 20 }, map: { lat: 46, lng: -61 } };
    const session = fakeSession({ gcps: [gcp] });
    renderPanel(session, { previewUrl: "blob:scan-preview" });
    const props = scanPaneCalls[scanPaneCalls.length - 1];
    expect(props.onMoveGcp).toBe(session.moveGcpOnScan);
    expect(props.onPickPoint).toBe(session.pickScanPoint);
    expect(props.onDragStartGcp).toBe(session.beginDragGcp);
    expect(props.gcps).toBe(session.gcps);
    expect(props.previewUrl).toBe("blob:scan-preview");
    expect(props.pixelSize).toEqual(RECORD.pixelSize);
    expect(props.selectedGcpId).toBeNull();
  });

  it("confirms before deleting the map, and is the only place that asks", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const { onDelete } = renderPanel(fakeSession());
    await userEvent.click(screen.getByRole("button", { name: "Delete map" }));
    expect(onDelete).not.toHaveBeenCalled();
    confirmSpy.mockReturnValue(true);
    await userEvent.click(screen.getByRole("button", { name: "Delete map" }));
    expect(onDelete).toHaveBeenCalledTimes(1);
    // One prompt per click. App's handler must not wrap this in a second
    // window.confirm — the user reads a dialog that reappears as broken.
    expect(confirmSpy).toHaveBeenCalledTimes(2);
    confirmSpy.mockRestore();
  });
});
