import { act, fireEvent, render, screen, within } from "@testing-library/react";
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

vi.mock("./components/MapCanvas", () => ({
  MapCanvas: ({
    parcels,
    taxSalePids,
    provinceLayers,
    showModernMap,
    onIdentifyParcel,
  }: {
    parcels: { features: unknown[] };
    taxSalePids: Set<string>;
    provinceLayers: Record<string, boolean>;
    showModernMap: boolean;
    onIdentifyParcel: (latitude: number, longitude: number) => void;
  }) => (
    <div data-testid="map-canvas">
      Map PID count: {taxSalePids.size}; geometry count: {parcels.features.length};
      modern map: {showModernMap ? "on" : "off"}; property boundaries:{" "}
      {provinceLayers.nsprd ? "on" : "off"}; water:{" "}
      {provinceLayers["water-features"] ? "on" : "off"}; roads:{" "}
      {provinceLayers.roads ? "on" : "off"}
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

  it("uses the parcel-first map defaults and keeps unavailable Fletcher last", () => {
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");

    render(<App />);

    expect(screen.getByLabelText("Modern map")).not.toBeChecked();
    expect(screen.getByLabelText("NS Aerial")).not.toBeChecked();
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
    expect(screen.queryByText(/available/i)).not.toBeInTheDocument();
    expect(screen.getByText("$15,529.15")).toBeInTheDocument();
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
        { name: "Cabot Trail", kind: "Arterial" },
        { name: "Culvert", kind: "Non-vehicle feature" },
      ],
      water: [{ name: "Mabou River", kind: "River or stream" }],
    });
    render(<App />);

    await user.type(screen.getByLabelText("Search by PID or civic address"), "50334317");
    await user.click(screen.getByRole("button", { name: "Find parcel" }));

    const inspector = await screen.findByRole("complementary", {
      name: "Parcel 50334317 details",
    });
    expect(within(inspector).getByText("27.44 acres")).toBeInTheDocument();
    expect(within(inspector).getByText("Cabot Trail")).toBeInTheDocument();
    expect(within(inspector).getByText("Arterial")).toBeInTheDocument();
    expect(within(inspector).getByText("Culvert")).toBeInTheDocument();
    expect(within(inspector).getByText("Mabou River")).toBeInTheDocument();
    expect(within(inspector).getByText("River or stream")).toBeInTheDocument();
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
      roads: [{ name: "Cabot Trail", kind: "Arterial" }],
      water: [{ name: "Mabou River", kind: "River or stream" }],
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
    expect(screen.queryByText(/available/i)).not.toBeInTheDocument();
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
