import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { PROVINCE_ATTRIBUTION } from "./licensing/provinceLicense";
import {
  OPEN_GOVERNMENT_ATTRIBUTION,
  fetchCivicAddresses,
  searchCivicAddresses,
  type CivicAddress,
} from "./services/civicAddresses";
import { fetchParcelAtPoint, fetchParcels } from "./services/nsprd";
import { fetchParcelContext } from "./services/parcelContext";
import { fetchParcelResourceIntersections } from "./services/parcelResources";

vi.mock("./components/MapCanvas", () => ({
  MapCanvas: ({
    parcels,
    taxSalePids,
    historicalTaxSalePids,
    provinceLayers,
    resourceLayers,
    showModernMap,
    showHistoricalTaxSales,
    initialPosition,
    onIdentifyParcel,
  }: {
    parcels: { features: unknown[] };
    taxSalePids: Set<string>;
    historicalTaxSalePids: Set<string>;
    provinceLayers: Record<string, boolean>;
    resourceLayers: Record<string, boolean>;
    showModernMap: boolean;
    showHistoricalTaxSales: boolean;
    initialPosition?: { latitude: number; longitude: number; zoom: number };
    onIdentifyParcel: (latitude: number, longitude: number) => void;
  }) => (
    <div data-testid="map-canvas">
      Map PID count: {taxSalePids.size}; geometry count: {parcels.features.length};
      modern map: {showModernMap ? "on" : "off"}; property boundaries:{" "}
      {provinceLayers.nsprd ? "on" : "off"}; water:{" "}
      {provinceLayers["water-features"] ? "on" : "off"}; roads:{" "}
      {provinceLayers.roads ? "on" : "off"}; historical layer:{" "}
      {showHistoricalTaxSales ? "on" : "off"}; historical PID count:{" "}
      {historicalTaxSalePids.size}; mineral occurrences:{" "}
      {resourceLayers["mineral-occurrences"] ? "on" : "off"}; mineral tenure:{" "}
      {resourceLayers["mineral-tenure"] ? "on" : "off"}; abandoned mines:{" "}
      {resourceLayers["abandoned-mines"] ? "on" : "off"}
      ; initial position: {initialPosition?.latitude ?? "missing"},{initialPosition?.longitude ?? "missing"},{initialPosition?.zoom ?? "missing"}
      <button type="button" onClick={() => onIdentifyParcel(46.059488, -61.414138)}>
        Tap map parcel
      </button>
    </div>
  ),
}));

vi.mock("./services/nsprd", async (importOriginal) => {
  const original = await importOriginal<typeof import("./services/nsprd")>();
  return {
    ...original,
    fetchParcelAtPoint: vi.fn().mockResolvedValue({
      type: "FeatureCollection",
      features: [],
    }),
    fetchParcels: vi.fn().mockResolvedValue({
      type: "FeatureCollection",
      features: [],
    }),
  };
});

vi.mock("./services/parcelContext", async (importOriginal) => {
  const original = await importOriginal<typeof import("./services/parcelContext")>();
  return {
    ...original,
    fetchParcelContext: vi.fn().mockResolvedValue({ roads: [], water: [] }),
  };
});

vi.mock("./services/civicAddresses", async (importOriginal) => {
  const original = await importOriginal<typeof import("./services/civicAddresses")>();
  return {
    ...original,
    fetchCivicAddresses: vi.fn().mockResolvedValue([]),
    searchCivicAddresses: vi.fn().mockResolvedValue([]),
  };
});

vi.mock("./services/parcelResources", async (importOriginal) => {
  const original = await importOriginal<typeof import("./services/parcelResources")>();
  return {
    ...original,
    fetchParcelResourceIntersections: vi.fn().mockResolvedValue({
      "mineral-occurrences": { status: "ready", intersections: [] },
      "mineral-tenure": { status: "ready", intersections: [] },
      "abandoned-mines": { status: "ready", intersections: [] },
    }),
  };
});

const parcelFeature = (pid: string) => ({
  type: "Feature" as const,
  properties: { PID: pid, "SHAPE.AREA": 111_057.27135 },
  geometry: {
    type: "Polygon" as const,
    coordinates: [
      [
        [-61.2, 46.4],
        [-61.1, 46.4],
        [-61.1, 46.3],
        [-61.2, 46.3],
        [-61.2, 46.4],
      ],
    ],
  },
});

const civicAddress = (pntid: string, label: string): CivicAddress => ({
  pntid,
  coordinates: [-61.15, 46.35],
  label,
  properties: {
    pntid,
    civicnum: "12",
    civsuffix: null,
    unit_num: null,
    add_loc: "Unknown",
    strprefix: null,
    strname: "Main",
    strsuffix: "St",
    strdir: null,
    comm: "Mabou",
    mun: "Municipality of the County of Inverness",
    county: "Inverness County",
  },
});

describe("NS Marks The Spot Online", () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState(null, "", "/");
    vi.mocked(fetchParcels).mockResolvedValue({
      type: "FeatureCollection",
      features: [],
    });
    vi.mocked(fetchParcelAtPoint).mockResolvedValue({
      type: "FeatureCollection",
      features: [],
    });
    vi.mocked(fetchParcelContext).mockResolvedValue({ roads: [], water: [] });
    vi.mocked(fetchCivicAddresses).mockResolvedValue([]);
    vi.mocked(searchCivicAddresses).mockResolvedValue([]);
    vi.mocked(fetchParcelResourceIntersections).mockResolvedValue({
      "mineral-occurrences": { status: "ready", intersections: [] },
      "mineral-tenure": { status: "ready", intersections: [] },
      "abandoned-mines": { status: "ready", intersections: [] },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("requires licence acceptance before enabling Province map layers", () => {
    render(<App />);

    expect(
      screen.getByRole("dialog", { name: "Use Nova Scotia map data" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(PROVINCE_ATTRIBUTION)).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: "Accept and view map layers" }),
    ).toBeInTheDocument();
  });

  it("credits the open-source software separately from map-data licences", () => {
    render(<App />);

    expect(
      screen.getByRole("link", {
        name: "© OpenStreetMap contributors",
      }),
    ).toHaveAttribute("href", "https://www.openstreetmap.org/copyright");
    expect(
      screen.getByRole("link", {
        name: "Open source · MIT · GitHub",
      }),
    ).toHaveAttribute(
      "href",
      "https://github.com/dfakkeldy/ns-marks-the-spot",
    );
  });

  it("invites map feedback through the KinNoKi Labs map address", () => {
    render(<App />);

    expect(
      screen.getByRole("link", {
        name: "Feedback & suggestions: map@kinnokilabs.com",
      }),
    ).toHaveAttribute(
      "href",
      "mailto:map@kinnokilabs.com?subject=NS%20Marks%20The%20Spot%20map%20feedback",
    );
  });

  it("invites beta interest without claiming the iPhone beta is available", () => {
    render(<App />);

    const betaLinks = screen.getAllByRole("link", {
      name: "Sign up for the beta",
    });

    expect(betaLinks).toHaveLength(2);
    betaLinks.forEach((link) => {
      expect(link).toHaveAttribute(
        "href",
        "mailto:map@kinnokilabs.com?subject=NS%20Marks%20The%20Spot%20beta%20signup",
      );
    });
    expect(
      screen.getByText(
        "The iPhone beta is not available in TestFlight yet. Join the list to hear when testing opens and help shape what comes next.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Get the iPhone app")).not.toBeInTheDocument();
  });

  it("reveals both privacy-minimized upcoming events after acceptance", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(
      screen.getByRole("button", { name: "Accept and view map layers" }),
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("67 notice entries · 68 PIDs")).toBeInTheDocument();
    expect(screen.getByText("45 notice entries · 47 PIDs")).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: /CBRM.*July 21, 2026/i }),
    ).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: /Inverness.*August 11, 2026/i }),
    ).toBeChecked();
    expect(screen.getByLabelText("Search by PID or civic address")).toBeEnabled();
    expect(screen.getByLabelText("NS Aerial")).toBeEnabled();
    expect(screen.getByLabelText("NS Property Boundaries")).toBeEnabled();
    expect(screen.getByLabelText("Crown Lands")).toBeEnabled();
    expect(screen.getByLabelText("Flood Risk Areas")).toBeEnabled();
    expect(screen.getByLabelText("Waterfalls")).toBeEnabled();
    expect(screen.getByLabelText("Water features")).toBeEnabled();
    expect(screen.getByLabelText("Roads, trails & culverts")).toBeEnabled();
    expect(screen.queryByText("Assessed owner")).not.toBeInTheDocument();
    expect(
      screen.getByText(PROVINCE_ATTRIBUTION, { selector: "footer span" }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText("Snapshot retrieved July 19, 2026"),
    ).toHaveLength(2);
  });

  it("makes current notices and historical results separate map modes", async () => {
    const user = userEvent.setup();
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    render(<App />);

    expect(screen.getByRole("button", { name: "Current notices" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("region", { name: "Current tax-sale notices" }))
      .toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Historical tax-sale outcomes" }))
      .not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Historical results" }));

    expect(screen.getByRole("button", { name: "Historical results" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.queryByRole("region", { name: "Current tax-sale notices" }))
      .not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Historical tax-sale outcomes" }))
      .toBeInTheDocument();
    expect(screen.getByTestId("map-canvas")).toHaveTextContent("historical layer: on");
  });

  it("restores mode, PID, layers, and position from a shared URL", async () => {
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    window.history.replaceState(
      null,
      "",
      "/?mode=historical&pid=40538464&event=hrm-2022-03-08&layers=nsprd,roads&position=46.1,-60.9,12",
    );
    vi.mocked(fetchParcels).mockImplementation(async (pids) => ({
      type: "FeatureCollection",
      features: pids.map(parcelFeature),
    }));

    render(<App />);

    expect(screen.getByRole("button", { name: "Historical results" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByLabelText("NS Property Boundaries")).toBeChecked();
    expect(screen.getByLabelText("Roads, trails & culverts")).toBeChecked();
    expect(screen.getByLabelText("Water features")).not.toBeChecked();
    expect(screen.getByTestId("map-canvas")).toHaveTextContent(
      "initial position: 46.1,-60.9,12",
    );
    expect(
      await screen.findByRole("complementary", { name: "Parcel 40538464 details" }),
    ).toBeInTheDocument();
    expect(new URL(window.location.href).searchParams.get("event"))
      .toContain("hrm-2022-03-08");
  });

  it("shows source metadata beside layer controls", () => {
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    render(<App />);

    const propertyRow = screen.getByLabelText("NS Property Boundaries").closest("label");
    expect(propertyRow).not.toBeNull();
    expect(within(propertyRow as HTMLElement).getByText(/Source date:/)).toBeInTheDocument();
    expect(within(propertyRow as HTMLElement).getByText(/Scale:/)).toBeInTheDocument();
    expect(within(propertyRow as HTMLElement).getByText(/Coverage:/)).toBeInTheDocument();
    expect(
      within(propertyRow as HTMLElement).getByText(
        (_, element) => element?.textContent === "Zoom: 10–24",
      ),
    ).toBeInTheDocument();
    expect(
      within(propertyRow as HTMLElement).getByText(/Loading|Ready|Off|Zoom/, {
        selector: ".layer-runtime",
      }),
    ).toBeInTheDocument();
  });

  it("keeps verified historical outcomes off by default and loads them on demand", async () => {
    const user = userEvent.setup();
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    vi.mocked(fetchParcels).mockImplementation(async (pids) => ({
      type: "FeatureCollection",
      features: pids.map(parcelFeature),
    }));

    render(<App />);

    expect(screen.getByTestId("map-canvas")).toHaveTextContent(
      "historical layer: off",
    );
    expect(screen.queryByLabelText("Historical sale year")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Historical results" }));

    expect(screen.getByTestId("map-canvas")).toHaveTextContent(
      "historical layer: on",
    );
    await waitFor(() =>
      expect(screen.getByText("93 historical PIDs matched in NSPRD.")).toBeInTheDocument(),
    );

    await user.selectOptions(screen.getByLabelText("Historical outcome"), "unsold");
    expect(screen.getByText("4 records · 4 PIDs")).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Historical sale year"), "2022");
    expect(screen.getByText("2 records · 2 PIDs")).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Historical sale year"), "2024");
    await user.selectOptions(screen.getByLabelText("Historical outcome"), "unknown");
    expect(screen.getByText("1 record · 1 PID")).toBeInTheDocument();
  });

  it("renders the official pending result without a fabricated winning bid", async () => {
    const user = userEvent.setup();
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    vi.mocked(fetchParcels).mockImplementation(async (pids) => ({
      type: "FeatureCollection",
      features: pids.map(parcelFeature),
    }));
    render(<App />);

    await user.click(
      screen.getByRole("button", { name: "Historical results" }),
    );
    await user.type(
      screen.getByLabelText("Search by PID or civic address"),
      "40441354",
    );
    await user.click(screen.getByRole("button", { name: "Find parcel" }));

    const inspector = await screen.findByRole("complementary", {
      name: "Parcel 40441354 details",
    });
    expect(within(inspector).getByText("Outcome unknown")).toBeInTheDocument();
    expect(
      within(inspector).getByText("Not published in verified sources"),
    ).toBeInTheDocument();
    expect(
      within(inspector).getByText(
        "Official result: PENDING - Property is still being offered.",
      ),
    ).toBeInTheDocument();
    expect(within(inspector).queryByText("Difference")).not.toBeInTheDocument();
  });

  it("shows owner-free historical outcome and financial context for a matched PID", async () => {
    const user = userEvent.setup();
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    vi.mocked(fetchParcels).mockImplementation(async (pids) => ({
      type: "FeatureCollection",
      features: pids.map(parcelFeature),
    }));
    render(<App />);

    await user.click(
      screen.getByRole("button", { name: "Historical results" }),
    );
    await user.type(
      screen.getByLabelText("Search by PID or civic address"),
      "40538464",
    );
    await user.click(screen.getByRole("button", { name: "Find parcel" }));

    const inspector = await screen.findByRole("complementary", {
      name: "Parcel 40538464 details",
    });
    expect(within(inspector).getByText("Unsold - no bids")).toBeInTheDocument();
    expect(
      within(inspector).getByText("No winning bid - official result says no bids"),
    ).toBeInTheDocument();
    expect(within(inspector).getByRole("link", { name: "Official notice" })).toHaveAttribute(
      "href",
      expect.stringContaining("halifax.ca"),
    );
    expect(within(inspector).getByText(/Dated outcome only/)).toBeInTheDocument();
    expect(within(inspector).queryByText(/assessed owner/i)).not.toBeInTheDocument();
  });

  it("uses the parcel-first map defaults and keeps unavailable Fletcher last", () => {
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");

    render(<App />);

    expect(screen.getByLabelText("Modern map")).not.toBeChecked();
    expect(screen.getByLabelText("NS Aerial")).toBeChecked();
    expect(screen.getByLabelText("NS Property Boundaries")).toBeChecked();
    expect(screen.getByLabelText("Water features")).toBeChecked();
    expect(screen.getByLabelText("Roads, trails & culverts")).toBeChecked();
    expect(screen.getByTestId("map-canvas")).toHaveTextContent(
      "modern map: off; property boundaries: on; water: on; roads: on",
    );

    const layerSection = screen.getByRole("region", { name: "Map layers" });
    const layerNames = Array.from(
      layerSection.querySelectorAll(".layer-row strong"),
      (element) => element.textContent,
    );
    expect(layerNames.at(-1)).toBe("Fletcher historical map");
  });

  it("keeps open geology and resource overlays collapsed, optional, and licence-independent", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(
      screen.getByRole("button", { name: "Continue without Province layers" }),
    );

    const groupSummary = screen.getByText("Geology & Resources");
    const group = groupSummary.closest("details");
    expect(group).not.toHaveAttribute("open");
    expect(screen.getByLabelText("Mineral occurrences")).not.toBeChecked();
    expect(screen.getByLabelText("Mineral tenure")).not.toBeChecked();
    expect(screen.getByLabelText("Abandoned mine openings")).not.toBeChecked();
    expect(screen.getByLabelText("Mineral occurrences")).toBeEnabled();

    await user.click(groupSummary);
    await user.click(screen.getByLabelText("Mineral occurrences"));
    await user.click(screen.getByLabelText("Mineral tenure"));

    expect(group).toHaveAttribute("open");
    expect(screen.getByTestId("map-canvas")).toHaveTextContent(
      "mineral occurrences: on; mineral tenure: on; abandoned mines: off",
    );
    expect(
      within(group as HTMLElement).getByRole("link", { name: "Open data sources" }),
    ).toHaveAttribute("href", expect.stringContaining("novascotia.ca"));
  });

  it("searches a civic address and opens its containing parcel", async () => {
    const user = userEvent.setup();
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    const result = civicAddress(
      "27700002",
      "11064 Highway 19, Southwest Mabou, Inverness County",
    );
    result.coordinates = [-61.414138, 46.059488];
    vi.mocked(searchCivicAddresses).mockResolvedValueOnce([result]);
    vi.mocked(fetchParcelAtPoint).mockResolvedValueOnce({
      type: "FeatureCollection",
      features: [parcelFeature("50251750")],
    });
    render(<App />);

    await user.type(
      screen.getByLabelText("Search by PID or civic address"),
      "11064 Highway 19 Mabou",
    );
    await user.click(screen.getByRole("button", { name: "Find parcel" }));

    const addressResult = await screen.findByRole("button", {
      name: "11064 Highway 19, Southwest Mabou, Inverness County",
    });
    await user.click(addressResult);

    expect(searchCivicAddresses).toHaveBeenCalledWith(
      "11064 Highway 19 Mabou",
      expect.any(AbortSignal),
    );
    expect(fetchParcelAtPoint).toHaveBeenCalledWith(
      46.059488,
      -61.414138,
      expect.any(AbortSignal),
    );
    expect(
      await screen.findByRole("complementary", {
        name: "Parcel 50251750 details",
      }),
    ).toBeInTheDocument();
  });

  it("opens any parcel identified by tapping the visible boundary layer", async () => {
    const user = userEvent.setup();
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    vi.mocked(fetchParcelAtPoint).mockResolvedValueOnce({
      type: "FeatureCollection",
      features: [parcelFeature("50251750")],
    });
    vi.mocked(fetchCivicAddresses).mockResolvedValueOnce([
      civicAddress(
        "27700002",
        "11064 Highway 19, Southwest Mabou, Inverness County",
      ),
    ]);
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Tap map parcel" }));

    expect(fetchParcelAtPoint).toHaveBeenCalledWith(
      46.059488,
      -61.414138,
      expect.any(AbortSignal),
    );
    const inspector = await screen.findByRole("complementary", {
      name: "Parcel 50251750 details",
    });
    expect(
      await within(inspector).findByText(
        "11064 Highway 19, Southwest Mabou, Inverness County",
      ),
    ).toBeInTheDocument();
    expect(
      within(inspector).queryByText("View direct official source"),
    ).not.toBeInTheDocument();
  });

  it("keeps an identified parcel when the initial tax-sale geometry arrives later", async () => {
    const user = userEvent.setup();
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    let resolveTaxSaleParcels: (
      collection: Awaited<ReturnType<typeof fetchParcels>>,
    ) => void = () => undefined;
    vi.mocked(fetchParcels).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveTaxSaleParcels = resolve;
      }),
    );
    vi.mocked(fetchParcelAtPoint).mockResolvedValueOnce({
      type: "FeatureCollection",
      features: [parcelFeature("50251750")],
    });

    render(<App />);
    await user.click(screen.getByRole("button", { name: "Tap map parcel" }));
    await screen.findByRole("complementary", {
      name: "Parcel 50251750 details",
    });

    await act(async () => {
      resolveTaxSaleParcels({
        type: "FeatureCollection",
        features: [parcelFeature("80000000")],
      });
    });

    expect(screen.getByTestId("map-canvas")).toHaveTextContent(
      "geometry count: 2",
    );
  });

  it("aborts a pending map-point lookup when a PID search takes over", async () => {
    const user = userEvent.setup();
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    vi.mocked(fetchParcels).mockResolvedValueOnce({
      type: "FeatureCollection",
      features: [parcelFeature("50334317")],
    });
    let pointSignal: AbortSignal | undefined;
    vi.mocked(fetchParcelAtPoint).mockImplementationOnce((_, __, signal) => {
      pointSignal = signal;
      return new Promise((_, reject) => {
        signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    });

    render(<App />);
    await screen.findByText("1 PIDs matched in NSPRD.");
    await user.click(screen.getByRole("button", { name: "Tap map parcel" }));
    await vi.waitFor(() => expect(pointSignal).toBeDefined());

    const search = screen.getByLabelText("Search by PID or civic address");
    await user.clear(search);
    await user.type(search, "50334317");
    await user.click(screen.getByRole("button", { name: "Find parcel" }));

    expect(pointSignal?.aborted).toBe(true);
    expect(
      await screen.findByRole("complementary", {
        name: "Parcel 50334317 details",
      }),
    ).toBeInTheDocument();
  });

  it("aborts a pending civic search when the user changes its text", async () => {
    const user = userEvent.setup();
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    let searchSignal: AbortSignal | undefined;
    vi.mocked(searchCivicAddresses).mockImplementationOnce((_, signal) => {
      searchSignal = signal;
      return new Promise((_, reject) => {
        signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    });

    render(<App />);
    const search = screen.getByLabelText("Search by PID or civic address");
    await user.type(search, "Highway 19 Mabou");
    await user.click(screen.getByRole("button", { name: "Find parcel" }));
    await vi.waitFor(() => expect(searchSignal).toBeDefined());

    await user.type(search, " West");

    expect(searchSignal?.aborted).toBe(true);
    expect(
      screen.getByText("Enter an 8-digit PID or a Nova Scotia civic address."),
    ).toBeInTheDocument();
  });

  it("tells users to verify results once an advertised sale date has passed", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-22T12:00:00Z"));
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");

    render(<App />);

    expect(
      screen.getByRole("checkbox", {
        name: /CBRM.*verify results with the municipality/i,
      }),
    ).toBeChecked();
    expect(
      screen.getAllByText("Past sale date — verify results with the municipality."),
    ).not.toHaveLength(0);
    expect(screen.queryByText("CBRM · July 21, 2026 · Upcoming")).not.toBeInTheDocument();
  });

  it("updates an open map when the advertised sale time passes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-21T13:59:30Z"));
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");

    render(<App />);

    expect(
      screen.getByRole("checkbox", {
        name: "CBRM tax sale - July 21, 2026 - Upcoming",
      }),
    ).toBeChecked();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(
      screen.getByRole("checkbox", {
        name: /CBRM.*verify results with the municipality/i,
      }),
    ).toBeChecked();
  });

  it("toggles native-parity Province layers independently", async () => {
    const user = userEvent.setup();
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    render(<App />);

    const crownLands = screen.getByLabelText("Crown Lands");
    const waterfalls = screen.getByLabelText("Waterfalls");

    expect(crownLands).not.toBeChecked();
    expect(waterfalls).not.toBeChecked();

    await user.click(crownLands);
    await user.click(waterfalls);

    expect(crownLands).toBeChecked();
    expect(waterfalls).toBeChecked();
  });

  it("shows the official road-style legend only while the road layer is visible", async () => {
    const user = userEvent.setup();
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    render(<App />);

    const legend = screen.getByRole("list", { name: "Road type legend" });
    expect(within(legend).getByText("Highway")).toBeInTheDocument();
    expect(within(legend).getByText("Local road")).toBeInTheDocument();
    expect(within(legend).getByText("Resource road")).toBeInTheDocument();
    expect(within(legend).getByText("Trail / track")).toBeInTheDocument();
    expect(within(legend).getByText("Culvert")).toBeInTheDocument();

    await user.click(screen.getByLabelText("Roads, trails & culverts"));
    expect(
      screen.queryByRole("list", { name: "Road type legend" }),
    ).not.toBeInTheDocument();
  });

  it("turns the modern map on independently of Province layers", async () => {
    const user = userEvent.setup();
    render(<App />);

    const modernMap = screen.getByLabelText("Modern map");
    expect(modernMap).not.toBeChecked();
    expect(screen.getByTestId("map-canvas")).toHaveTextContent(
      "modern map: off",
    );

    await user.click(modernMap);

    expect(modernMap).toBeChecked();
    expect(screen.getByTestId("map-canvas")).toHaveTextContent(
      "modern map: on",
    );
  });

  it("collapses and restores the header", async () => {
    const user = userEvent.setup();
    render(<App />);

    const collapse = screen.getByRole("button", { name: "Collapse header" });
    expect(collapse).toHaveAttribute("aria-expanded", "true");

    await user.click(collapse);

    const expand = screen.getByRole("button", { name: "Expand header" });
    expect(expand).toHaveAttribute("aria-expanded", "false");
    expect(expand.closest(".app-shell")).toHaveClass("header-collapsed");

    await user.click(expand);

    expect(
      screen.getByRole("button", { name: "Collapse header" }),
    ).toHaveAttribute("aria-expanded", "true");
  });

  it("finds a tax-sale listing by PID without claiming that it is available", async () => {
    const user = userEvent.setup();
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    render(<App />);

    const search = screen.getByLabelText("Search by PID or civic address");
    await user.type(search, "50203256");
    await user.click(screen.getByRole("button", { name: "Find parcel" }));

    expect(screen.getByRole("heading", { name: "Highway 19, Mabou" })).toBeInTheDocument();
    expect(screen.getByText("Listed in official notice")).toBeInTheDocument();
    expect(
      within(screen.getByRole("complementary", { name: "Parcel 50203256 details" })).queryByText(
        /available/i,
      ),
    ).not.toBeInTheDocument();
    expect(screen.getByText("$15,529.15")).toBeInTheDocument();
  });

  it("browses tax-sale properties and selects one parcel at a time", async () => {
    const user = userEvent.setup();
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    vi.mocked(fetchParcels).mockImplementation(async (pids) => ({
      type: "FeatureCollection",
      features: pids.map(parcelFeature),
    }));
    render(<App />);

    await user.click(
      screen.getByText("68 parcels shown").closest("summary")!,
    );
    const cbrmProperties = screen.getByRole("list", {
      name: "CBRM tax-sale properties",
    });
    const property = within(cbrmProperties).getByRole("button", {
      name: "75 DORCHESTER ST LAND BUILDING, lien 26-05, PID 15054588",
    });

    await user.click(property);

    expect(property).toHaveAttribute("aria-current", "true");
    expect(
      screen.getByRole("complementary", {
        name: "Parcel 15054588 details",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "75 DORCHESTER ST LAND BUILDING",
      }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Search by PID or civic address")).toHaveValue(
      "15054588",
    );
  });

  it("keeps the property lists aligned with the redemption filter", async () => {
    const user = userEvent.setup();
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    render(<App />);

    await user.click(
      screen.getByRole("button", { name: /Immediate \/ none/ }),
    );

    expect(screen.getByText("29 parcels shown")).toBeInTheDocument();
    expect(screen.getByText("18 parcels shown")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "75 DORCHESTER ST LAND BUILDING, lien 26-05, PID 15054588",
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "158 VICTORIA RD LAND BUILDING, lien 26-10, PID 15129406",
      }),
    ).toBeInTheDocument();
  });

  it("shows mapped acreage and exact intersecting road and water features", async () => {
    const user = userEvent.setup();
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    vi.mocked(fetchParcels).mockResolvedValueOnce({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { PID: "50334317", "SHAPE.AREA": 111_057.27135 },
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [-61.2, 46.4],
                [-61.1, 46.4],
                [-61.1, 46.3],
                [-61.2, 46.3],
                [-61.2, 46.4],
              ],
            ],
          },
        },
      ],
    });
    vi.mocked(fetchParcelContext).mockResolvedValueOnce({
      roads: [
        { name: "Cabot Trail", kind: "Arterial", relationship: "intersects" },
        { name: "Harbour Road", kind: "Local", relationship: "adjacent" },
        { name: "Culvert", kind: "Non-vehicle feature", relationship: "intersects" },
      ],
      water: [
        { name: "Mabou River", kind: "River or stream", relationship: "intersects" },
      ],
    });
    vi.mocked(fetchCivicAddresses).mockResolvedValueOnce([
      civicAddress("address-road", "12 Main St, Mabou"),
    ]);
    render(<App />);

    await user.type(screen.getByLabelText("Search by PID or civic address"), "50334317");
    await user.click(screen.getByRole("button", { name: "Find parcel" }));

    const inspector = await screen.findByRole("complementary", {
      name: "Parcel 50334317 details",
    });
    expect(within(inspector).getByText("27.44 acres")).toBeInTheDocument();
    expect(within(inspector).getByText("Cabot Trail")).toBeInTheDocument();
    expect(within(inspector).getByText(/Arterial/)).toBeInTheDocument();
    expect(within(inspector).getByText("Culvert")).toBeInTheDocument();
    expect(within(inspector).getByText("Harbour Road")).toBeInTheDocument();
    expect(within(inspector).getByText(/Adjacent within 20 m/)).toBeInTheDocument();
    expect(within(inspector).getByText("Main St")).toBeInTheDocument();
    expect(within(inspector).getByText(/Named by civic address/)).toBeInTheDocument();
    expect(within(inspector).getByText("Mabou River")).toBeInTheDocument();
    expect(within(inspector).getByText(/River or stream/)).toBeInTheDocument();
    expect(within(inspector).getByText(/not proof of legal access/)).toBeInTheDocument();
  });

  it("reports intersection lookup failures without hiding parcel facts", async () => {
    const user = userEvent.setup();
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    vi.mocked(fetchParcels).mockResolvedValueOnce({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { PID: "50203256", "SHAPE.AREA": 728.4341 },
          geometry: { type: "Point", coordinates: [-61, 46] },
        },
      ],
    });
    vi.mocked(fetchParcelContext).mockRejectedValueOnce(new Error("offline"));
    render(<App />);

    await user.type(screen.getByLabelText("Search by PID or civic address"), "50203256");
    await user.click(screen.getByRole("button", { name: "Find parcel" }));

    expect(await screen.findByText("0.18 acres")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Mapped road and water intersections are unavailable right now.",
      ),
    ).toBeInTheDocument();
  });

  it("shows an honest loading state and one mapped civic address with its own licence", async () => {
    const user = userEvent.setup();
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    vi.mocked(fetchParcels).mockResolvedValueOnce({
      type: "FeatureCollection",
      features: [parcelFeature("50334317")],
    });
    let resolveAddresses!: (addresses: CivicAddress[]) => void;
    vi.mocked(fetchCivicAddresses).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveAddresses = resolve;
      }),
    );
    render(<App />);
    await screen.findByText("1 PIDs matched in NSPRD.");

    await user.type(screen.getByLabelText("Search by PID or civic address"), "50334317");
    await user.click(screen.getByRole("button", { name: "Find parcel" }));

    expect(
      screen.getByText("Looking up mapped civic addresses…"),
    ).toBeInTheDocument();
    await act(async () => {
      resolveAddresses([
        civicAddress("100", "12 Main St, Mabou, Inverness County"),
      ]);
    });

    const inspector = await screen.findByRole("complementary", {
      name: "Parcel 50334317 details",
    });
    expect(
      within(inspector).getByRole("heading", { name: "Mapped civic address" }),
    ).toBeInTheDocument();
    expect(
      within(inspector).getByText("12 Main St, Mabou, Inverness County"),
    ).toBeInTheDocument();
    expect(
      within(inspector).getByRole("link", {
        name: "87RW9V22+22 — Directions in Google Maps",
      }),
    ).toHaveAttribute(
      "href",
      "https://www.google.com/maps/dir/?api=1&destination=46.35%2C-61.15&dir_action=navigate",
    );
    expect(
      within(inspector).getByRole("link", {
        name: "Nova Scotia Civic Address File",
      }),
    ).toHaveAttribute(
      "href",
      "https://data.novascotia.ca/Municipalities/Nova-Scotia-Civic-Address-File-Civic-Points/tntn-er5g",
    );
    expect(within(inspector).getByText(OPEN_GOVERNMENT_ATTRIBUTION)).toBeInTheDocument();
    expect(
      within(inspector).getByRole("link", {
        name: "Open Government Licence – Nova Scotia",
      }),
    ).toHaveAttribute(
      "href",
      "https://support.novascotia.ca/services/open-data-portal-licence",
    );
    expect(
      within(inspector).getByText(
        "Mapped physical-address points are not proof of ownership, mailing address, access, occupancy, or legal parcel status.",
      ),
    ).toBeInTheDocument();
  });

  it("shows explicit official-source resource intersections in the parcel sheet", async () => {
    const user = userEvent.setup();
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    vi.mocked(fetchParcels).mockResolvedValueOnce({
      type: "FeatureCollection",
      features: [parcelFeature("50334317")],
    });
    vi.mocked(fetchParcelResourceIntersections).mockResolvedValueOnce({
      "mineral-occurrences": {
        status: "ready",
        intersections: [
          {
            id: "A01-001",
            name: "Example occurrence",
            detail: "Occurrence · Au, Ag",
          },
        ],
      },
      "mineral-tenure": { status: "ready", intersections: [] },
      "abandoned-mines": { status: "error", intersections: [] },
    });
    render(<App />);
    await screen.findByText("1 PIDs matched in NSPRD.");

    await user.type(screen.getByLabelText("Search by PID or civic address"), "50334317");
    await user.click(screen.getByRole("button", { name: "Find parcel" }));

    const resources = await screen.findByRole("region", {
      name: "Geology and resource intersections",
    });
    expect(within(resources).getByText("Example occurrence")).toBeInTheDocument();
    expect(within(resources).getByText("Occurrence · Au, Ag")).toBeInTheDocument();
    expect(within(resources).getByText("Source unavailable; no absence is inferred."))
      .toBeInTheDocument();
    expect(
      within(resources).getByText(/Empty results do not prove absence/),
    ).toBeInTheDocument();
    expect(within(resources).getAllByRole("link")).toHaveLength(3);
  });

  it("lists every unique mapped civic address", async () => {
    const user = userEvent.setup();
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    vi.mocked(fetchParcels).mockResolvedValueOnce({
      type: "FeatureCollection",
      features: [parcelFeature("50334317")],
    });
    vi.mocked(fetchCivicAddresses).mockResolvedValueOnce([
      civicAddress("100", "12 Main St, Mabou, Inverness County"),
      civicAddress("101", "Unit 2, 12 Main St, Mabou, Inverness County"),
    ]);
    render(<App />);
    await screen.findByText("1 PIDs matched in NSPRD.");

    await user.type(screen.getByLabelText("Search by PID or civic address"), "50334317");
    await user.click(screen.getByRole("button", { name: "Find parcel" }));

    const inspector = await screen.findByRole("complementary", {
      name: "Parcel 50334317 details",
    });
    expect(
      await within(inspector).findByRole("heading", {
        name: "Mapped civic addresses",
      }),
    ).toBeInTheDocument();
    expect(
      within(inspector).getByText("12 Main St, Mabou, Inverness County"),
    ).toBeInTheDocument();
    expect(
      within(inspector).getByText(
        "Unit 2, 12 Main St, Mabou, Inverness County",
      ),
    ).toBeInTheDocument();
  });

  it("states when no civic point is mapped inside the selected parcel", async () => {
    const user = userEvent.setup();
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    vi.mocked(fetchParcels).mockResolvedValueOnce({
      type: "FeatureCollection",
      features: [parcelFeature("50334317")],
    });
    render(<App />);
    await screen.findByText("1 PIDs matched in NSPRD.");

    await user.type(screen.getByLabelText("Search by PID or civic address"), "50334317");
    await user.click(screen.getByRole("button", { name: "Find parcel" }));

    expect(
      await screen.findByText(
        "No civic address point is mapped inside this parcel.",
      ),
    ).toBeInTheDocument();
  });

  it("keeps road and water results visible when civic lookup fails", async () => {
    const user = userEvent.setup();
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    vi.mocked(fetchParcels).mockResolvedValueOnce({
      type: "FeatureCollection",
      features: [parcelFeature("50334317")],
    });
    vi.mocked(fetchParcelContext).mockResolvedValueOnce({
      roads: [
        { name: "Cabot Trail", kind: "Arterial", relationship: "intersects" },
      ],
      water: [
        { name: "Mabou River", kind: "River or stream", relationship: "intersects" },
      ],
    });
    vi.mocked(fetchCivicAddresses).mockRejectedValueOnce(new Error("offline"));
    render(<App />);
    await screen.findByText("1 PIDs matched in NSPRD.");

    await user.type(screen.getByLabelText("Search by PID or civic address"), "50334317");
    await user.click(screen.getByRole("button", { name: "Find parcel" }));

    expect(await screen.findByText("Cabot Trail")).toBeInTheDocument();
    expect(screen.getByText("Mabou River")).toBeInTheDocument();
    expect(
      screen.getByText("Civic address lookup is unavailable right now."),
    ).toBeInTheDocument();
  });

  it("keeps civic results visible when road and water lookup fails", async () => {
    const user = userEvent.setup();
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    vi.mocked(fetchParcels).mockResolvedValueOnce({
      type: "FeatureCollection",
      features: [parcelFeature("50334317")],
    });
    vi.mocked(fetchParcelContext).mockRejectedValueOnce(new Error("offline"));
    vi.mocked(fetchCivicAddresses).mockResolvedValueOnce([
      civicAddress("100", "12 Main St, Mabou, Inverness County"),
    ]);
    render(<App />);
    await screen.findByText("1 PIDs matched in NSPRD.");

    await user.type(screen.getByLabelText("Search by PID or civic address"), "50334317");
    await user.click(screen.getByRole("button", { name: "Find parcel" }));

    expect(
      await screen.findByText("12 Main St, Mabou, Inverness County"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Mapped road and water intersections are unavailable right now.",
      ),
    ).toBeInTheDocument();
  });

  it("aborts a stale civic lookup before showing the next selected PID", async () => {
    const user = userEvent.setup();
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    vi.mocked(fetchParcels).mockResolvedValueOnce({
      type: "FeatureCollection",
      features: [parcelFeature("50334317"), parcelFeature("50203256")],
    });
    let firstSignal: AbortSignal | undefined;
    vi.mocked(fetchCivicAddresses).mockImplementation((features, signal) => {
      const pid = features[0]?.properties.PID;
      if (pid === "50334317") {
        firstSignal = signal;
        return new Promise((_, reject) => {
          signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        });
      }
      return Promise.resolve([
        civicAddress("200", "8 Second St, Whycocomagh, Inverness County"),
      ]);
    });
    render(<App />);
    await screen.findByText("2 PIDs matched in NSPRD.");

    const search = screen.getByLabelText("Search by PID or civic address");
    await user.type(search, "50334317");
    await user.click(screen.getByRole("button", { name: "Find parcel" }));
    await vi.waitFor(() => expect(firstSignal).toBeDefined());

    await user.clear(search);
    await user.type(search, "50203256");
    await user.click(screen.getByRole("button", { name: "Find parcel" }));

    expect(
      await screen.findByText(
        "8 Second St, Whycocomagh, Inverness County",
      ),
    ).toBeInTheDocument();
    expect(firstSignal?.aborted).toBe(true);
    expect(
      screen.queryByText("12 Main St, Mabou, Inverness County"),
    ).not.toBeInTheDocument();
  });

  it("opens a newly selected PID at the top of a fresh parcel sheet", async () => {
    const user = userEvent.setup();
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    vi.mocked(fetchParcels).mockResolvedValueOnce({
      type: "FeatureCollection",
      features: [parcelFeature("50334317"), parcelFeature("50203256")],
    });
    render(<App />);
    await screen.findByText("2 PIDs matched in NSPRD.");

    const search = screen.getByLabelText("Search by PID or civic address");
    await user.type(search, "50334317");
    await user.click(screen.getByRole("button", { name: "Find parcel" }));
    const firstInspector = await screen.findByRole("complementary", {
      name: "Parcel 50334317 details",
    });
    firstInspector.scrollTop = 220;
    fireEvent.scroll(firstInspector);

    await user.clear(search);
    await user.type(search, "50203256");
    await user.click(screen.getByRole("button", { name: "Find parcel" }));
    const secondInspector = await screen.findByRole("complementary", {
      name: "Parcel 50203256 details",
    });

    expect(secondInspector).not.toBe(firstInspector);
    expect(secondInspector.scrollTop).toBe(0);
  });

  it("finds a CBRM listing and shows event-aware municipal details", async () => {
    const user = userEvent.setup();
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    render(<App />);

    await user.type(screen.getByLabelText("Search by PID or civic address"), "15054588");
    await user.click(screen.getByRole("button", { name: "Find parcel" }));

    expect(
      screen.getByRole("heading", {
        name: "75 DORCHESTER ST LAND BUILDING",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Cape Breton Regional Municipality")).toBeInTheDocument();
    expect(
      within(screen.getByRole("complementary", { name: "Parcel 15054588 details" })).getByText(
        "July 21, 2026 · Upcoming",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("$33,108.73")).toBeInTheDocument();
    expect(
      screen.queryByText("Immediate deed", { exact: false }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Six-month redemption", { exact: false })).toBeInTheDocument();
    expect(
      within(screen.getByRole("complementary", { name: "Parcel 15054588 details" })).queryByText(
        /available/i,
      ),
    ).not.toBeInTheDocument();
  });

  it("toggles upcoming events without mixing their PID counts", async () => {
    const user = userEvent.setup();
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    render(<App />);

    expect(screen.getByTestId("map-canvas")).toHaveTextContent("Map PID count: 115");
    await user.click(
      screen.getByRole("checkbox", { name: /Inverness.*August 11, 2026/i }),
    );
    expect(screen.getByTestId("map-canvas")).toHaveTextContent("Map PID count: 68");
  });

  it("keeps NSPRD failures visible without manufacturing geometry", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchParcels).mockRejectedValueOnce(new Error("offline"));
    render(<App />);

    await user.click(
      screen.getByRole("button", { name: "Accept and view map layers" }),
    );

    expect(
      await screen.findByText(
        "The Province parcel service is temporarily unavailable. The official notices remain accessible.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByTestId("map-canvas")).toHaveTextContent("geometry count: 0");
  });

  it("rejects malformed PID searches", async () => {
    const user = userEvent.setup();
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    render(<App />);

    await user.type(screen.getByLabelText("Search by PID or civic address"), "5020");
    await user.click(screen.getByRole("button", { name: "Find parcel" }));

    expect(
      screen.getByText("Enter an 8-digit Nova Scotia parcel ID."),
    ).toHaveAttribute("role", "alert");
  });
});
