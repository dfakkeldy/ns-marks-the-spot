import { useEffect, useMemo, useState, type FormEvent } from "react";
import appIconUrl from "../../docs/assets/app-icon.svg";
import { MapCanvas } from "./components/MapCanvas";
import {
  eventsForStatus,
  listingContextForPid,
  pidsForEvents,
  taxSaleEvents,
  type TaxSaleEvent,
  type TaxSaleListing,
} from "./data/taxSaleCatalog";
import {
  PROVINCE_ATTRIBUTION,
  PROVINCE_LICENSE_ACCEPTANCE_KEY,
  PROVINCE_LICENSE_URL,
} from "./licensing/provinceLicense";
import {
  initialProvinceLayerVisibility,
  nativeLayerCatalog,
  provinceLayerCatalog,
  type ProvinceLayerId,
  type WebLayerDescriptor,
} from "./layers/layerCatalog";
import {
  fetchParcels,
  normalizePid,
  type NsprdFeatureCollection,
} from "./services/nsprd";

type TaxSaleFilter = "all" | "redemption" | "immediate-or-none";

const EMPTY_FEATURES: NsprdFeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

const currency = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
});

const eventDate = new Intl.DateTimeFormat("en-CA", {
  dateStyle: "long",
  timeZone: "America/Halifax",
});

const upcomingTaxSaleEvents = eventsForStatus("upcoming");
const upcomingTaxSalePids = pidsForEvents(upcomingTaxSaleEvents);

function eventDateLabel(event: TaxSaleEvent): string {
  const timestamp = event.saleStartsAt ?? event.closedAt;
  return timestamp ? eventDate.format(new Date(timestamp)) : "Date not listed";
}

function listingStatusLabel(listing: TaxSaleListing): string {
  switch (listing.listingStatus) {
    case "advertised":
      return "Advertised in notice";
    case "withdrawn":
      return "Withdrawn from historical event";
    case "sold":
      return "Historical sold result - not available";
    case "unsold":
      return "Historical unsold result - not available";
  }
}

function isLicenceAccepted(): boolean {
  return (
    localStorage.getItem(PROVINCE_LICENSE_ACCEPTANCE_KEY) === "accepted"
  );
}

function mergeFeatureCollections(
  current: NsprdFeatureCollection,
  incoming: NsprdFeatureCollection,
): NsprdFeatureCollection {
  const featureKeys = new Set(
    current.features.map((feature) => JSON.stringify(feature.geometry)),
  );

  return {
    type: "FeatureCollection",
    features: [
      ...current.features,
      ...incoming.features.filter((feature) => {
        const key = JSON.stringify(feature.geometry);
        if (featureKeys.has(key)) {
          return false;
        }
        featureKeys.add(key);
        return true;
      }),
    ],
  };
}

function ParcelInspector({
  pid,
  context,
  onClose,
}: {
  pid: string;
  context?: { event: TaxSaleEvent; listing: TaxSaleListing };
  onClose: () => void;
}) {
  const listing = context?.listing;
  const event = context?.event;
  const historical = event?.eventStatus === "historical";

  return (
    <aside className="parcel-inspector" aria-label={`Parcel ${pid} details`}>
      <button
        className="inspector-close"
        type="button"
        onClick={onClose}
        aria-label="Close parcel details"
      >
        ×
      </button>
      <h2>
        {listing?.addressOrDescription ?? listing?.location ?? `PID ${pid}`}
      </h2>
      <p className={listing ? "notice-status" : "parcel-status"}>
        {listing
          ? historical
            ? "Historical result - not available"
            : "Listed in official notice"
          : "NSPRD parcel"}
      </p>
      <dl className="parcel-facts">
        {event ? (
          <>
            <div>
              <dt>Municipality</dt>
              <dd>{event.municipality}</dd>
            </div>
            <div>
              <dt>Event</dt>
              <dd>
                {eventDateLabel(event)} · {historical ? "Historical" : "Upcoming"}
              </dd>
            </div>
          </>
        ) : null}
        <div>
          <dt>PID</dt>
          <dd>{pid}</dd>
        </div>
        {listing ? (
          <>
            <div>
              <dt>Lien</dt>
              <dd>{listing.lien}</dd>
            </div>
            {listing.aan ? (
              <div>
                <dt>AAN</dt>
                <dd>{listing.aan}</dd>
              </div>
            ) : null}
            <div>
              <dt>Official location</dt>
              <dd>{listing.location}</dd>
            </div>
            <div>
              <dt>{listing.financial.label}</dt>
              <dd>{currency.format(listing.financial.amountCents / 100)}</dd>
            </div>
            <div>
              <dt>Redemption</dt>
              <dd>{listing.redemptionLabel}</dd>
            </div>
            <div>
              <dt>Listing status</dt>
              <dd>{listingStatusLabel(listing)}</dd>
            </div>
            <div>
              <dt>Source retrieved</dt>
              <dd>{event?.retrievedOn}</dd>
            </div>
          </>
        ) : null}
      </dl>
      {listing ? (
        <p className="sale-warning">
          <span aria-hidden="true">!</span>
          {historical
            ? "This is a dated historical result, not a currently available property."
            : `Properties may be paid, removed or deferred. Verify current status with ${event?.shortMunicipality}. This map does not imply access, clear title, possession or buildability.`}
        </p>
      ) : (
        <p className="sale-warning neutral">
          This PID is not listed in any municipal notice included by this map.
        </p>
      )}
      <a
        className="primary-action inspector-action"
        href={event?.sourceUrl}
        target="_blank"
        rel="noreferrer"
      >
        View direct official source
      </a>
    </aside>
  );
}

function LicenceDialog({
  onAccept,
  onContinueWithout,
}: {
  onAccept: () => void;
  onContinueWithout: () => void;
}) {
  return (
    <div className="dialog-backdrop">
      <section
        className="licence-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="licence-title"
      >
        <div className="licence-mark" aria-hidden="true">
          NS
        </div>
        <h2 id="licence-title">Use Nova Scotia map data</h2>
        <p>
          Aerial imagery, property boundaries, Crown lands, flood-risk areas,
          and waterfalls come from Province map services. Accept the Province’s
          restricted geographic services licence before these layers are loaded.
        </p>
        <blockquote>{PROVINCE_ATTRIBUTION}</blockquote>
        <p className="licence-caveat">
          Property boundaries are approximate and are not a legal survey.
        </p>
        <a href={PROVINCE_LICENSE_URL} target="_blank" rel="noreferrer">
          Read the Province licence
        </a>
        <div className="dialog-actions">
          <button className="primary-action" type="button" onClick={onAccept}>
            Accept and view map layers
          </button>
          <button
            className="secondary-action"
            type="button"
            onClick={onContinueWithout}
          >
            Continue without Province layers
          </button>
        </div>
      </section>
    </div>
  );
}

function LayerToggle({
  layer,
  checked,
  licenceAccepted,
  onChange,
  onReviewLicence,
}: {
  layer: WebLayerDescriptor & { id: ProvinceLayerId };
  checked: boolean;
  licenceAccepted: boolean;
  onChange: (checked: boolean) => void;
  onReviewLicence: () => void;
}) {
  return (
    <label className="layer-row">
      <input
        type="checkbox"
        aria-label={layer.name}
        checked={licenceAccepted && checked}
        disabled={!licenceAccepted}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="switch" aria-hidden="true" />
      <span>
        <strong>{layer.name}</strong>
        <small>
          {licenceAccepted ? layer.webCaveat : "Province licence required"}
        </small>
      </span>
      {!licenceAccepted && layer.id === "nsprd" ? (
        <button className="text-button" type="button" onClick={onReviewLicence}>
          Review
        </button>
      ) : null}
    </label>
  );
}

export function App() {
  const [licenceAccepted, setLicenceAccepted] = useState(isLicenceAccepted);
  const [licenceDialogOpen, setLicenceDialogOpen] = useState(
    () => !isLicenceAccepted(),
  );
  const [parcels, setParcels] = useState<NsprdFeatureCollection>(EMPTY_FEATURES);
  const [parcelMessage, setParcelMessage] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedPid, setSelectedPid] = useState<string | null>(null);
  const [showModernMap, setShowModernMap] = useState(true);
  const [provinceLayers, setProvinceLayers] = useState(
    initialProvinceLayerVisibility,
  );
  const [selectedEventIds, setSelectedEventIds] = useState(
    () => new Set(upcomingTaxSaleEvents.map(({ id }) => id)),
  );
  const [taxSaleFilter, setTaxSaleFilter] = useState<TaxSaleFilter>("all");

  useEffect(() => {
    if (!licenceAccepted) {
      return;
    }

    const controller = new AbortController();
    fetchParcels(upcomingTaxSalePids, controller.signal)
      .then((collection) => {
        setParcels(collection);
        setParcelMessage(
          `${new Set(collection.features.map(({ properties }) => properties.PID)).size} PIDs matched in NSPRD.`,
        );
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setParcelMessage(
          "The Province parcel service is temporarily unavailable. The official notices remain accessible.",
        );
      });

    return () => controller.abort();
  }, [licenceAccepted]);

  const filteredTaxSalePids = useMemo(() => {
    const listings = taxSaleEvents
      .filter(({ id }) => selectedEventIds.has(id))
      .flatMap(({ listings }) => listings)
      .filter((listing) => {
      if (taxSaleFilter === "redemption") {
        return listing.redemptionCategory === "six-month";
      }
      if (taxSaleFilter === "immediate-or-none") {
        return (
          listing.redemptionCategory === "immediate-deed" ||
          listing.redemptionCategory === "not-redeemable"
        );
      }
      return true;
    });
    return new Set(listings.flatMap(({ pids }) => pids));
  }, [selectedEventIds, taxSaleFilter]);

  const selectedListings = useMemo(
    () =>
      taxSaleEvents
        .filter(({ id }) => selectedEventIds.has(id))
        .flatMap(({ listings }) => listings),
    [selectedEventIds],
  );

  const filterCounts = useMemo(
    () => ({
      all: selectedListings.length,
      redemption: selectedListings.filter(
        ({ redemptionCategory }) => redemptionCategory === "six-month",
      ).length,
      immediateOrNone: selectedListings.filter(
        ({ redemptionCategory }) =>
          redemptionCategory === "immediate-deed" ||
          redemptionCategory === "not-redeemable",
      ).length,
    }),
    [selectedListings],
  );

  const acceptLicence = () => {
    localStorage.setItem(PROVINCE_LICENSE_ACCEPTANCE_KEY, "accepted");
    setLicenceAccepted(true);
    setLicenceDialogOpen(false);
  };

  const setEventVisibility = (id: string, visible: boolean) => {
    setSelectedEventIds((current) => {
      const next = new Set(current);
      if (visible) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };

  const setProvinceLayerVisibility = (
    id: ProvinceLayerId,
    visible: boolean,
  ) => {
    setProvinceLayers((current) => ({ ...current, [id]: visible }));
  };

  const submitPidSearch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSearchError(null);
    const pid = normalizePid(query);

    if (!pid) {
      setSearchError("Enter an 8-digit Nova Scotia parcel ID.");
      return;
    }

    setQuery(pid);
    setSelectedPid(pid);

    if (parcels.features.some(({ properties }) => properties.PID === pid)) {
      return;
    }

    try {
      const collection = await fetchParcels([pid]);
      if (collection.features.length === 0) {
        setSearchError("No NSPRD parcel was found for that PID.");
        return;
      }
      setParcels((current) => mergeFeatureCollections(current, collection));
    } catch {
      setSearchError("The Province parcel search is unavailable right now.");
    }
  };

  const selectedListingContext = selectedPid
    ? listingContextForPid(selectedPid)
    : undefined;

  return (
    <div className="app-shell">
      <header className="app-header">
        <a className="app-brand" href="../" aria-label="NS Marks The Spot home">
          <img src={appIconUrl} alt="" />
          <strong>NS Marks The Spot</strong>
          <span>Online</span>
        </a>
        <div className="offline-nav">
          <span>Need offline maps?</span>
          <a className="header-action" href="../#top">
            Get the iPhone app
          </a>
        </div>
      </header>

      <main className="map-layout">
        <aside className="layer-rail" aria-label="Map controls">
          <h1>Explore Nova Scotia</h1>
          <form className="pid-search" onSubmit={submitPidSearch}>
            <label htmlFor="pid-query">Search by PID</label>
            <div className="search-row">
              <input
                id="pid-query"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="50203256"
                inputMode="numeric"
                autoComplete="off"
                disabled={!licenceAccepted}
              />
              <button
                className="primary-action"
                type="submit"
                disabled={!licenceAccepted}
              >
                Find parcel
              </button>
            </div>
            <p className="field-help" role={searchError ? "alert" : undefined}>
              {searchError ?? "Enter an 8-digit Nova Scotia parcel ID."}
            </p>
          </form>

          <section className="rail-section" aria-labelledby="layers-heading">
            <h2 id="layers-heading">Map layers</h2>
            <label className="layer-row">
              <input
                type="checkbox"
                aria-label="Modern map"
                checked={showModernMap}
                onChange={(event) => setShowModernMap(event.target.checked)}
              />
              <span className="switch" aria-hidden="true" />
              <span>
                <strong>Modern map</strong>
                <small>OpenStreetMap</small>
              </span>
            </label>
            <div className="layer-row unavailable">
              <span className="switch" aria-hidden="true" />
              <span>
                <strong>Fletcher historical map</strong>
                <small>{nativeLayerCatalog[0].webCaveat}</small>
              </span>
            </div>
            {provinceLayerCatalog.map((layer) => (
              <LayerToggle
                key={layer.id}
                layer={layer}
                checked={provinceLayers[layer.id]}
                licenceAccepted={licenceAccepted}
                onChange={(checked) =>
                  setProvinceLayerVisibility(layer.id, checked)
                }
                onReviewLicence={() => setLicenceDialogOpen(true)}
              />
            ))}
          </section>

          <section
            className="rail-section tax-sale-events"
            aria-labelledby="events-heading"
          >
            <h2 id="events-heading">Upcoming tax-sale events</h2>
            <p className="section-intro">
              Dated official notices. Listings can change before an auction.
            </p>
            {upcomingTaxSaleEvents.map((event) => {
              const pidCount = pidsForEvents([event]).length;
              return (
                <label className="layer-row event-row" key={event.id}>
                  <input
                    type="checkbox"
                    aria-label={`${event.shortMunicipality} tax sale - ${eventDateLabel(event)}`}
                    checked={licenceAccepted && selectedEventIds.has(event.id)}
                    disabled={!licenceAccepted}
                    onChange={(change) =>
                      setEventVisibility(event.id, change.target.checked)
                    }
                  />
                  <span className="switch" aria-hidden="true" />
                  <span>
                    <strong>{event.shortMunicipality}</strong>
                    <small>{eventDateLabel(event)}</small>
                    <small>
                      {event.listings.length} notice entries · {pidCount} PIDs
                    </small>
                  </span>
                </label>
              );
            })}
            <p className="parcel-message" role="status" aria-live="polite">
              {parcelMessage}
            </p>
          </section>

          <section
            className="rail-section tax-sale-controls"
            aria-labelledby="filter-heading"
          >
            <h2 id="filter-heading">Redemption category</h2>
            <div className="segmented-control" aria-label="Redemption category">
              <button
                type="button"
                className={taxSaleFilter === "all" ? "selected" : ""}
                aria-pressed={taxSaleFilter === "all"}
                onClick={() => setTaxSaleFilter("all")}
              >
                All {filterCounts.all}
              </button>
              <button
                type="button"
                className={taxSaleFilter === "redemption" ? "selected" : ""}
                aria-pressed={taxSaleFilter === "redemption"}
                onClick={() => setTaxSaleFilter("redemption")}
              >
                Redemption {filterCounts.redemption}
              </button>
              <button
                type="button"
                className={
                  taxSaleFilter === "immediate-or-none" ? "selected" : ""
                }
                aria-pressed={taxSaleFilter === "immediate-or-none"}
                onClick={() => setTaxSaleFilter("immediate-or-none")}
              >
                Immediate / none {filterCounts.immediateOrNone}
              </button>
            </div>

            {upcomingTaxSaleEvents.map((event) => (
              <div className="source-note" key={event.id}>
                <strong>
                  {event.shortMunicipality} · {eventDateLabel(event)}
                </strong>
                <span>{event.venue}</span>
                <a href={event.sourceUrl} target="_blank" rel="noreferrer">
                  Open direct official source
                </a>
              </div>
            ))}
          </section>

          <section className="offline-card" aria-labelledby="offline-heading">
            <img src={appIconUrl} alt="" />
            <div>
              <h2 id="offline-heading">Heading offline?</h2>
              <p>
                Get detailed maps, GPS tracking, and saved field areas in the
                NS Marks The Spot iPhone app.
              </p>
              <a href="../#top">Get the iPhone app</a>
            </div>
          </section>
        </aside>

        <section
          className={`map-region${selectedPid ? " has-inspector" : ""}`}
          aria-label="Map and parcel details"
        >
          <MapCanvas
            parcels={parcels}
            taxSalePids={filteredTaxSalePids}
            selectedPid={selectedPid}
            provinceLayers={provinceLayers}
            showModernMap={showModernMap}
            showTaxSale={licenceAccepted && selectedEventIds.size > 0}
            onSelectPid={setSelectedPid}
          />
          {selectedPid ? (
            <ParcelInspector
              pid={selectedPid}
              context={selectedListingContext}
              onClose={() => setSelectedPid(null)}
            />
          ) : null}
        </section>
      </main>

      <footer className="map-attribution">
        <span>Map data © OpenStreetMap contributors</span>
        <span>Map layers © Province of Nova Scotia</span>
        <span>Boundaries are not a survey</span>
        <button type="button" onClick={() => setLicenceDialogOpen(true)}>
          Data &amp; licences
        </button>
      </footer>

      {licenceDialogOpen ? (
        <LicenceDialog
          onAccept={acceptLicence}
          onContinueWithout={() => setLicenceDialogOpen(false)}
        />
      ) : null}
    </div>
  );
}
