import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

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
//
// For the same reason it echoes `tabPanel` back as id/role/aria-labelledby:
// the scan pane is the Scan tab's PANEL, and the tab round trip below cannot
// be checked against a stub that swallows it. Same honesty condition as the
// class — ScanPane.test.tsx pins that the REAL component applies those three
// attributes from the same prop, so this echo reflects the component rather
// than inventing a shape for it.
const scanPaneCalls: Array<Record<string, unknown>> = [];
vi.mock("./ScanPane", () => ({
  ScanPane: (props: Record<string, unknown>) => {
    scanPaneCalls.push(props);
    const tabPanel = props.tabPanel as
      | { id: string; labelledBy: string }
      | undefined;
    return (
      <div
        className="georeference-scan"
        data-testid="scan-pane"
        id={tabPanel?.id}
        role={tabPanel ? "tabpanel" : undefined}
        aria-labelledby={tabPanel?.labelledBy}
      />
    );
  },
}));

import { GeoreferencePanel } from "./GeoreferencePanel";
import { statusMessage } from "./georeferenceStatus";
import type { GeoreferenceSession } from "../useGeoreferenceSession";
import { georeferenceAnnotation } from "../allmaps/annotation";
import { AUTO_EXPORT_INTERVAL_MS } from "../autoExport";
import { BENT, gcpRecord } from "../testFixtures";
import { MIN_GCPS_FOR_TPS } from "../transform/tps";
import type { Gcp, GeoreferenceMethod, UserMapRecord } from "../types";

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
    endDragGcp: vi.fn(),
    moveGcpOnScan: vi.fn(),
    moveGcpOnMap: vi.fn(),
    deleteGcp: vi.fn(),
    importGcps: vi.fn(),
    heldOut: null,
    checks: [],
    undo: vi.fn(),
    flush: vi.fn(),
    // Task 12 adds this to GeoreferenceSession (a delete has to cancel its
    // pending write, not flush it). The factory returns the full type, so a
    // missing field is a `tsc -b` error, not a silent gap.
    discardPendingWrite: vi.fn(),
    ...overrides,
  };
}

/** A record whose GCP georeference uses `method`, for the warp toggle tests. */
function recordWithMethod(method: GeoreferenceMethod): UserMapRecord {
  return { ...RECORD, georef: { kind: "gcp", method, gcps: [] } };
}

function renderPanel(session: GeoreferenceSession, props: Partial<Parameters<typeof GeoreferencePanel>[0]> = {}) {
  const onClose = vi.fn();
  const onDelete = vi.fn();
  const onOpacityChange = vi.fn();
  const onToggleReferenceLayer = vi.fn();
  const onFocusGcpOnMap = vi.fn();
  const onMethodChange = vi.fn();
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
      onMethodChange={onMethodChange}
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
    onMethodChange,
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
    // The status covers every refusal shared by both solvers, most but not
    // all of which are "the points on the SCAN are nearly collinear": a
    // non-finite result and a 50:1 axis squash also land here, and the squash
    // is what three map clicks down a meridian produce from a perfectly good
    // scan triangle. Copy that said "move one off the line" would be wrong
    // advice for those, so it names both sides. Two coincident TPS control
    // points is the one refusal that DOESN'T land here — see the next test.
    expect(statusMessage({ kind: "degenerate" })).toBe(
      "These points can't pin the map down — check that neither the scan " +
        "points nor the map points sit on a straight line.",
    );
  });

  it("tells the user to move or delete a duplicate rather than the generic degenerate message", () => {
    // Task 4: coincident TPS control points get a specific, actionable
    // message instead of `degenerate`'s — unlike a thin cloud or a squashed
    // axis, nothing about two points on the same scan pixel is "a straight
    // line", and the fix is concrete rather than "spread your points out".
    expect(statusMessage({ kind: "coincident-points" })).toBe(
      "Two points are on the same spot — move or delete one.",
    );
  });

  it("says the accuracy check is off rather than asking for a 4th point, past the cap", () => {
    // Task 7b. `tpsResidualReport` returns null for two unrelated reasons, and
    // only one of them is "too few points": above MAX_GCPS_FOR_TPS_RESIDUALS
    // (50) leave-one-out would cost n O(n^3) solves on every pointer move.
    // Folded into `exact-fit`, a user with 51 control points was told their fit
    // was exact and to add a fourth. The remedy differs — there is none, and
    // nothing is broken — so it earns its own kind.
    expect(statusMessage({ kind: "too-many-points" })).toBe(
      "Too many points to check accuracy — the map still draws.",
    );
    expect(statusMessage({ kind: "too-many-points" })).not.toBe(
      statusMessage({ kind: "exact-fit" }),
    );
  });

  it("names the remedy, and says the map draws, when a leave-one-out refit refuses", () => {
    // Task 7b round 2, the third TPS refusal. Distinct from BOTH neighbours:
    // unlike `too-many-points` there IS something to do about it, and unlike
    // `degenerate` the map is already on screen — the full set solves, only
    // the (n-1) subsets do not. Copy proposed for maintainer review.
    expect(statusMessage({ kind: "refit-refused" })).toBe(
      "Can't check accuracy — these points sit too close to a straight " +
        "line. Spread them out; the map still draws.",
    );
  });

  it("gives all five non-solved statuses five different sentences", () => {
    // The taxonomy guard. Every per-kind test above would still pass if two
    // kinds returned the SAME string, which is the failure this table has
    // actually produced twice — `exact-fit`'s copy standing in for a refusal
    // that had nothing to do with a fourth point.
    const messages = (
      [
        { kind: "exact-fit" },
        { kind: "too-many-points" },
        { kind: "refit-refused" },
        { kind: "degenerate" },
        { kind: "coincident-points" },
      ] as const
    ).map(statusMessage);
    expect(new Set(messages).size, JSON.stringify(messages)).toBe(5);
  });

  it("reports RMS with the point count on the AFFINE path", () => {
    expect(
      statusMessage({
        kind: "solved",
        rmsMetres: 42.4,
        count: 5,
        method: "affine",
      }),
    ).toBe("RMS 42 m across 5 points");
  });

  it("frames the TPS figure as an upper bound, because that is what it is", () => {
    // A spline passes through its control points exactly, so there is no fit
    // residual to call RMS; the number is leave-one-out, measured to overstate
    // true warp error by 1.77x (n = 12) to 3.71x (n = 4) and never to
    // understate it. Measured case: 4 points with ~65 m of true warp error
    // printed "RMS 240 m", which a user reads as a georeference to discard.
    expect(
      statusMessage({
        kind: "solved",
        rmsMetres: 240.3,
        count: 4,
        method: "tps",
      }),
    ).toBe("No worse than 240 m across 4 points");
    // The word that made the old sentence wrong must be gone, not merely
    // prefixed: "RMS no worse than …" would pass a substring check.
    expect(
      statusMessage({
        kind: "solved",
        rmsMetres: 240.3,
        count: 4,
        method: "tps",
      }),
    ).not.toContain("RMS");
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
    // bar is a sibling of the panel: a child would be hidden with it.
    // e2e/layout.spec.ts checks the rendered Map-tab interaction.
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

  it("points each tab at a real panel that names that tab back", () => {
    // `role="tablist"` + two `role="tab"` + `aria-selected` shipped with
    // neither `aria-controls` nor any `role="tabpanel"`: the buttons
    // announced as tabs and controlled nothing, so on the narrow layout —
    // the only place the tablist is visible at all — a screen-reader user was
    // told there were two panes and given nothing linking either tab to what
    // it reveals.
    //
    // Asserted as a ROUND TRIP (tab -> aria-controls -> element -> its
    // aria-labelledby -> back to that same tab's id) because both ids are
    // just strings: `tsc -b` is equally happy with Scan pointing at the map
    // bar and Map pointing at the scan. A one-way "has an aria-controls"
    // check cannot tell a correct pair from a transposed one, and neither
    // can a check that the attribute merely resolves to SOME element.
    const { container } = renderPanel(fakeSession());
    expect(screen.getAllByRole("tab")).toHaveLength(2);
    const cases = [
      // The panels live in two different places on purpose: the scan panel is
      // a grid child of `.georeference-panel` (rendered by ScanPane), the map
      // panel is the floating bar, a SIBLING of the panel. aria-controls is
      // what associates them; DOM adjacency is impossible here.
      { name: "Scan", panelClass: "georeference-scan" },
      { name: "Map", panelClass: "georeference-map-bar" },
    ];
    for (const { name, panelClass } of cases) {
      const tab = screen.getByRole("tab", { name });
      const tabId = tab.getAttribute("id");
      // Exact-ish, not `not.toBeNull()`: `getAttribute` returns null for a
      // missing attribute, and an EMPTY id would still be a non-null string
      // that no aria-labelledby could ever usefully point at.
      expect(tabId).toEqual(expect.stringMatching(/\S/));
      const controls = tab.getAttribute("aria-controls");
      expect(controls).toEqual(expect.stringMatching(/\S/));
      const panel = container.querySelector(`#${controls}`);
      // The attribute existing is not the claim — the claim is that it names
      // an element that is actually here. querySelector on a stale or
      // misspelled id returns null, which an attribute-only assertion misses.
      expect(panel).toBeInstanceOf(HTMLElement);
      expect(panel).toHaveClass(panelClass);
      expect(panel).toHaveAttribute("role", "tabpanel");
      // The half that catches the transposition.
      expect(panel).toHaveAttribute("aria-labelledby", tabId);
      // Deliberately NOT `hidden`. Above the two-pane breakpoint the tablist
      // is display:none and BOTH panes are on screen at once; only the
      // stylesheet knows that, so a JS-side "hide the unselected panel" —
      // the textbook next step of this pattern — would blank half the wide
      // layout. Visibility stays the stylesheet's job, via `data-tab`.
      expect(panel).not.toHaveAttribute("hidden");
    }
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
    // …and gives it back. GcpList clearing on leave is only half the fix: the
    // panel owns `selectedGcpId`, so if its setter could not take null the
    // highlight would still stick. Without this the class is one-way, and
    // `.gcp-row--selected` / `.gcp-marker--selected` — which styles.css calls
    // "the row currently under the pointer" — stay lit for the rest of the
    // session, pointing at wherever the mouse last happened to exit.
    fireEvent.mouseLeave(rows[0]);
    expect(rows[0]).not.toHaveClass("gcp-row--selected");
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
    // Ctrl+Z walks back past an entire drag instead of one step; and
    // onDragEndGcp <-> beginDragGcp (identical signatures again) leaves the
    // TPS drape stuck on the coarse drag lattice AND pushes a second undo
    // snapshot on release. This panel is the ONLY place the scan pane's end
    // handler is chosen, so nothing downstream — not even the real-mount
    // drag test, which supplies its own spies — can catch that one.
    scanPaneCalls.length = 0;
    const gcp = { id: "a", pixel: { x: 10, y: 20 }, map: { lat: 46, lng: -61 } };
    const session = fakeSession({ gcps: [gcp] });
    const { container } = renderPanel(session, {
      previewUrl: "blob:scan-preview",
    });
    const props = scanPaneCalls[scanPaneCalls.length - 1];
    expect(props.onMoveGcp).toBe(session.moveGcpOnScan);
    expect(props.onPickPoint).toBe(session.pickScanPoint);
    expect(props.onDragStartGcp).toBe(session.beginDragGcp);
    expect(props.onDragEndGcp).toBe(session.endDragGcp);
    expect(props.gcps).toBe(session.gcps);
    expect(props.previewUrl).toBe("blob:scan-preview");
    expect(props.pixelSize).toEqual(RECORD.pixelSize);
    // Nothing hovered yet, so nothing selected…
    expect(props.selectedGcpId).toBeNull();
    // …but `toBeNull()` on its own is satisfied by a HARDCODED
    // `selectedGcpId={null}` at the ScanPane call site. Under that mutation
    // hovering a GcpList row still highlights the table row — the round-trip
    // test above only reads GcpList's own class — while the scan marker never
    // highlights at all, so the two halves of one selection silently
    // disagree. Hovering first is what pins the LIVE value.
    fireEvent.mouseEnter(container.querySelectorAll(".gcp-row")[0]);
    expect(scanPaneCalls[scanPaneCalls.length - 1].selectedGcpId).toBe("a");
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

describe("GeoreferencePanel warp toggle", () => {
  const TPS_LABEL = "Curved warp (TPS)";

  /** The first count at which a spline differs from the affine through the
   * same points. Written as `MIN_GCPS_FOR_TPS + 1` rather than imported as
   * `MIN_GCPS_FOR_BENDING_TPS`, deliberately: the component gates on the
   * latter, so re-deriving it here keeps this an independent statement of what
   * the gate should be instead of an identity that holds however the constant
   * drifts. A literal 4 would be independent too, but would stop tracking the
   * solver's floor. */
  const GATE = MIN_GCPS_FOR_TPS + 1;

  function warpToggle(): HTMLElement | null {
    return screen.queryByRole("checkbox", { name: TPS_LABEL });
  }

  it("keeps the toggle out of the DOM below the gate, rather than disabling it", () => {
    // Spec: "At 4+ points a TPS toggle appears." Below that it is ABSENT.
    // A disabled-but-present control is a different promise — it advertises a
    // warp the user cannot reach and gives no reason — and it is what an
    // earlier draft of this panel would have shipped.
    renderPanel(fakeSession({ gcps: [] }));
    expect(warpToggle()).toBeNull();
    // One below the gate, which is where an off-by-one lands.
    renderPanel(fakeSession({ gcps: BENT.slice(0, GATE - 1) }));
    expect(warpToggle()).toBeNull();
  });

  it("offers the toggle from the gate upwards", () => {
    renderPanel(fakeSession({ gcps: BENT.slice(0, GATE) }));
    const toggle = warpToggle();
    expect(toggle).toBeInTheDocument();
    // Present AND usable: the absent/disabled distinction above cuts both
    // ways, so a toggle that appeared inert would fail the same spec line.
    expect(toggle).toBeEnabled();
  });

  it("says in text what the curved warp does and does not overstate it", () => {
    // Copy is the maintainer's call, proposed for review. It must NOT claim an
    // accuracy improvement: the leave-one-out figure this panel displays is
    // measured to OVERSTATE true warp error by 1.8x-3.7x, so any claim about
    // error belongs in the accuracy line as an upper bound, not here.
    renderPanel(fakeSession({ gcps: BENT.slice(0, GATE) }));
    expect(
      screen.getByText(
        "Passes exactly through every point. Better for hand-drawn maps " +
          "that don't sit flat.",
      ),
    ).toBeInTheDocument();
  });

  it("takes its checked state from the record's own method, both ways", () => {
    // The toggle's visual state and the state a screen reader announces are
    // the SAME property of a native checkbox — there is no second, hidden
    // carrier that could drift out of step with the tick, which is why this
    // control needs no `.visually-hidden` label the way GcpList's suspect row
    // does. What CAN drift is the checkbox and the record: a `checked` pinned
    // to local state, or to a literal, would show "off" over a tps drape. So
    // both members of the union are rendered and asserted.
    const { unmount } = renderPanel(fakeSession({ gcps: BENT.slice(0, GATE) }), {
      record: recordWithMethod("affine"),
    });
    expect(warpToggle()).not.toBeChecked();
    unmount();

    renderPanel(fakeSession({ gcps: BENT.slice(0, GATE) }), {
      record: recordWithMethod("tps"),
    });
    expect(warpToggle()).toBeChecked();
  });

  it("asks for the OTHER method, not for a fixed one", async () => {
    // Both arms, because both "tps" and "affine" are valid members of
    // GeoreferenceMethod: a handler wired to a constant — or to the value it
    // already has — type-checks cleanly and would leave the toggle inert (or,
    // inverted, switching the wrong way) with every other test here green.
    const affine = renderPanel(fakeSession({ gcps: BENT.slice(0, GATE) }), {
      record: recordWithMethod("affine"),
    });
    await userEvent.click(screen.getByRole("checkbox", { name: TPS_LABEL }));
    expect(affine.onMethodChange).toHaveBeenCalledWith("tps");
    affine.unmount();

    const tps = renderPanel(fakeSession({ gcps: BENT.slice(0, GATE) }), {
      record: recordWithMethod("tps"),
    });
    await userEvent.click(screen.getByRole("checkbox", { name: TPS_LABEL }));
    expect(tps.onMethodChange).toHaveBeenCalledWith("affine");
  });
});

describe("GeoreferencePanel export control", () => {
  const EXPORT_LABEL = "Export georeference";

  /**
   * Deliberately `MIN_GCPS_FOR_TPS` (3), NOT the warp toggle's
   * `MIN_GCPS_FOR_BENDING_TPS` (4). The plan draft that shipped to this task
   * aligned the two gates on the theory that the earlier one-point gap was an
   * inconsistency to fix; it wasn't. The toggle's 4 exists because a spline
   * needs a FOURTH point to bend at all (tps.ts) — below it, TPS and affine
   * produce an identical drape, so the toggle would be a choice with no
   * consequence. Export has no such constraint: the IIIF spec's own floor for
   * a warping transformation is 3 GCPs, and this app's own solver already
   * draws a real (affine) drape at exactly 3 — `MIN_GCPS_FOR_AFFINE ===
   * MIN_GCPS_FOR_TPS` (affine.ts, tps.ts). Gating export at 4 would withhold
   * a valid export for every 3-point map the app already renders.
   */
  const GATE = MIN_GCPS_FOR_TPS;

  function exportButton(): HTMLElement | null {
    return screen.queryByRole("button", { name: EXPORT_LABEL });
  }

  function recordWithGcps(
    gcps: Gcp[],
    method: GeoreferenceMethod = "affine",
  ): UserMapRecord {
    return gcpRecord({ georef: { kind: "gcp", method, gcps } });
  }

  it("keeps the control out of the DOM below the export gate", () => {
    renderPanel(fakeSession(), { record: recordWithGcps([]) });
    expect(exportButton()).toBeNull();
    // One below the gate, which is where an off-by-one lands.
    renderPanel(fakeSession(), {
      record: recordWithGcps(BENT.slice(0, GATE - 1)),
    });
    expect(exportButton()).toBeNull();
  });

  it("offers the control from the gate upwards — MIN_GCPS_FOR_TPS, not MIN_GCPS_FOR_BENDING_TPS", () => {
    renderPanel(fakeSession(), { record: recordWithGcps(BENT.slice(0, GATE)) });
    const button = exportButton();
    expect(button).toBeInTheDocument();
    expect(button).toBeEnabled();
  });

  it("is absent for an embedded-georeference record, which has no GCPs to export", () => {
    // georeferenceAnnotation(record) returns null for this kind (Task 9). A
    // button that appeared anyway and downloaded `null` would be worse than
    // no button — this pins the control absent rather than merely inert.
    const embedded: UserMapRecord = {
      ...gcpRecord(),
      georef: {
        kind: "embedded",
        crs: "EPSG:26920",
        geotransform: [500000, 1, 0, 5100000, 0, -1],
      },
    };
    renderPanel(fakeSession({ gcps: BENT.slice(0, GATE) }), {
      record: embedded,
    });
    expect(exportButton()).toBeNull();
  });

  it("downloads the exact serialized annotation, named after the record, and revokes the URL it created", async () => {
    // A per-call dynamic URL (not a fixed literal) so "revoke was called with
    // the created URL" cannot pass by a hardcoded coincidence — see
    // useUserMaps.test.ts for the same convention.
    const createObjectURL = vi.fn<(blob: Blob) => string>(
      () => `blob:georef-export-${Math.random()}`,
    );
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });

    // A real `function`, not an arrow, so `this` inside the mock is the
    // clicked anchor — the only way to recover the filename it was given,
    // since `link.click()` triggers navigation jsdom does not implement.
    // Captured through a mutable object rather than a bare closed-over `let`
    // — `tsc -b` otherwise narrows the outer variable to `never` at the read
    // site below, past the point where the mock has actually run.
    const captured: { link: HTMLAnchorElement | null } = { link: null };
    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        captured.link = this;
      });

    const record = gcpRecord({
      name: "Church of Inverness 1888",
      georef: { kind: "gcp", method: "tps", gcps: BENT },
    });
    renderPanel(fakeSession(), { record });

    await userEvent.click(screen.getByRole("button", { name: EXPORT_LABEL }));

    // Assertion 1: the serialized payload equals georeferenceAnnotation(record).
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    const payload = JSON.parse(await blob.text());
    expect(payload).toEqual(georeferenceAnnotation(record));

    // Assertion 2: the filename is `<record.name>.georef.json`.
    expect(captured.link?.download).toBe(
      "Church of Inverness 1888.georef.json",
    );

    // Assertion 3: the revoke is DEFERRED — Safari starts fetching the blob
    // URL after the click task, and the old synchronous revoke intermittently
    // aborted the download. downloadFile.test.ts pins that the deferred
    // revoke fires with this exact URL after DOWNLOAD_REVOKE_DELAY_MS.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(revokeObjectURL).not.toHaveBeenCalled();

    anchorClick.mockRestore();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });
});

describe("Fletcher points file import", () => {
  const HEADER = "pixel_x,pixel_y,lon,lat,role,label";
  // RECORD is 1200 x 800, so these pixels are inside it.
  const POINTS = [
    HEADER,
    "100.0,100.0,-61.58333300,45.91666700,control,a",
    "200.0,300.0,-61.50000000,45.83333300,control,b",
    "400.0,500.0,-61.45000000,45.80000000,check,held-out",
    "",
  ].join("\n");

  function pointsFile(text: string, name = "sheet-19.csv") {
    return new File([text], name, { type: "text/csv" });
  }

  function fileInput() {
    return screen.getByLabelText("Load a Fletcher points file");
  }

  it("places the control points and leaves the checks out", async () => {
    const session = fakeSession();
    renderPanel(session);
    await userEvent.upload(fileInput(), pointsFile(POINTS));

    expect(session.importGcps).toHaveBeenCalledTimes(1);
    const imported = vi.mocked(session.importGcps).mock.calls[0]![0];
    expect(imported.map((gcp) => gcp.id)).toEqual(["a", "b"]);
    expect(imported[0]).toEqual({
      id: "a",
      pixel: { x: 100, y: 100 },
      map: { lat: 45.916667, lng: -61.583333 },
    });
    const message = await screen.findByTestId("points-import-message");
    expect(message).toHaveTextContent(/Loaded 2 control points from sheet-19\.csv/);
    // Success is polite; a refusal below is assertive. Pinned because the role
    // is the only thing that tells a screen-reader user which one happened.
    expect(message).toHaveAttribute("role", "status");
  });

  it("says the held-out checks were left out on purpose", async () => {
    // Otherwise "3 points in the file, 2 on the map" reads as data loss.
    renderPanel(fakeSession());
    await userEvent.upload(fileInput(), pointsFile(POINTS));
    expect(await screen.findByTestId("points-import-message")).toHaveTextContent(
      /1 check points were left out on purpose/,
    );
  });

  it("warns how many existing points were replaced, and points at undo", async () => {
    const existing: Gcp[] = [
      { id: "gcp-1", pixel: { x: 1, y: 1 }, map: { lat: 45, lng: -61 } },
    ];
    renderPanel(fakeSession({ gcps: existing }));
    await userEvent.upload(fileInput(), pointsFile(POINTS));
    expect(await screen.findByTestId("points-import-message")).toHaveTextContent(
      /replacing 1 — undo with Cmd\/Ctrl\+Z/,
    );
  });

  it("refuses a file measured against a different scan without placing anything", async () => {
    // RECORD is 1200 x 800; this point cannot belong to it.
    const offSheet = [HEADER, "9999.0,9999.0,-61.5,45.8,control,a", ""].join(
      "\n",
    );
    const session = fakeSession();
    renderPanel(session);
    await userEvent.upload(fileInput(), pointsFile(offSheet));

    expect(session.importGcps).not.toHaveBeenCalled();
    const message = await screen.findByTestId("points-import-message");
    expect(message).toHaveTextContent(/measured against a different scan/);
    expect(message).toHaveAttribute("role", "alert");
  });

  it("reports a file that is not a points file at all", async () => {
    const session = fakeSession();
    renderPanel(session);
    await userEvent.upload(fileInput(), pointsFile("x,y\n1,2\n", "notes.csv"));

    expect(session.importGcps).not.toHaveBeenCalled();
    expect(await screen.findByTestId("points-import-message")).toHaveTextContent(
      /Not a Fletcher points file/,
    );
  });
});

describe("auto-export", () => {
  function captureDownloads() {
    const downloads: { name: string; href: string }[] = [];
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = realCreate(tag) as HTMLElement;
      if (tag === "a") {
        vi.spyOn(el as HTMLAnchorElement, "click").mockImplementation(() => {
          const anchor = el as HTMLAnchorElement;
          downloads.push({ name: anchor.download, href: anchor.href });
        });
      }
      return el;
    });
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: () => "blob:stub",
      revokeObjectURL: () => {},
    });
    return downloads;
  }

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  const PLACED: Gcp[] = [
    { id: "a", pixel: { x: 1, y: 2 }, map: { lat: 45.9, lng: -61.5 } },
  ];
  const MOVED: Gcp[] = [{ ...PLACED[0]!, pixel: { x: 50, y: 60 } }];
  const MOVED_AGAIN: Gcp[] = [{ ...PLACED[0]!, pixel: { x: 90, y: 99 } }];

  // Hoisted because every test below has to drive ONE panel across a change:
  // a freshly mounted one takes the already-moved points as its baseline and
  // correctly decides nothing moved, so a `renderPanel` per state proves
  // nothing about either the close path or the clock.
  const panel = (session: GeoreferenceSession) => (
    <GeoreferencePanel
      record={RECORD}
      previewUrl="blob:scan"
      opacity={0.7}
      session={session}
      onOpacityChange={vi.fn()}
      onClose={vi.fn()}
      onDelete={vi.fn()}
      onFocusGcpOnMap={vi.fn()}
      onMethodChange={vi.fn()}
      referenceLayers={{ aerial: false, parcels: true }}
      onToggleReferenceLayer={vi.fn()}
    />
  );

  it("writes a timestamped file when the points moved", async () => {
    const downloads = captureDownloads();
    const { rerender } = render(panel(fakeSession({ gcps: PLACED })));
    rerender(panel(fakeSession({ gcps: MOVED })));
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(downloads).toHaveLength(1);
    expect(downloads[0]!.name).toMatch(/\.csv$/);
    expect(downloads[0]!.name).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}/);
  });

  it("writes nothing when the session changed nothing", async () => {
    // Opening a panel to look at a sheet must not litter the Downloads folder.
    const downloads = captureDownloads();
    renderPanel(fakeSession({ gcps: PLACED }));
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(downloads).toEqual([]);
  });

  it("writes nothing when there are no points at all", async () => {
    const downloads = captureDownloads();
    renderPanel(fakeSession({ gcps: [] }));
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(downloads).toEqual([]);
  });

  it("checkpoints an open session without waiting for Done", () => {
    // The whole point: a session that never reaches Done — a closed tab, a
    // reload, a stopped dev server — still leaves a file behind.
    const downloads = captureDownloads();
    vi.useFakeTimers();
    const { rerender } = render(panel(fakeSession({ gcps: PLACED })));
    rerender(panel(fakeSession({ gcps: MOVED })));
    expect(downloads).toEqual([]);
    act(() => void vi.advanceTimersByTime(AUTO_EXPORT_INTERVAL_MS));
    expect(downloads).toHaveLength(1);
  });

  it("leaves an idle session alone however long it stays open", () => {
    // A panel left open over lunch must not drop a file every five minutes.
    const downloads = captureDownloads();
    vi.useFakeTimers();
    render(panel(fakeSession({ gcps: PLACED })));
    act(() => void vi.advanceTimersByTime(AUTO_EXPORT_INTERVAL_MS * 6));
    expect(downloads).toEqual([]);
  });

  // The two tests below click Done with `fireEvent`, not `userEvent`, and the
  // difference is not stylistic: `userEvent` awaits its own `setTimeout`
  // between events, which under fake timers nothing advances, so both hung
  // until the 5 s test timeout. Done is a plain button with an onClick — a
  // synchronous click event is the whole interaction.

  it("does not write the same points twice when Done follows a checkpoint", () => {
    const downloads = captureDownloads();
    vi.useFakeTimers();
    const { rerender } = render(panel(fakeSession({ gcps: PLACED })));
    rerender(panel(fakeSession({ gcps: MOVED })));
    act(() => void vi.advanceTimersByTime(AUTO_EXPORT_INTERVAL_MS));
    expect(downloads).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    // Against a fixed opened-with baseline this is 2: the same points, written
    // once by the clock and again on the way out.
    expect(downloads).toHaveLength(1);
  });

  it("writes again when the points move after a checkpoint", () => {
    // The other half of the baseline: advancing it must not suppress real
    // later work.
    const downloads = captureDownloads();
    vi.useFakeTimers();
    const { rerender } = render(panel(fakeSession({ gcps: PLACED })));
    rerender(panel(fakeSession({ gcps: MOVED })));
    act(() => void vi.advanceTimersByTime(AUTO_EXPORT_INTERVAL_MS));
    rerender(panel(fakeSession({ gcps: MOVED_AGAIN })));

    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(downloads).toHaveLength(2);
  });
});
