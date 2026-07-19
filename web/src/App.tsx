import { useEffect, useMemo, useState, type FormEvent } from "react";
import appIconUrl from "../../docs/assets/app-icon.svg";
import { MapCanvas } from "./components/MapCanvas";
import {
  invernessTaxSaleNotice,
  listingForPid,
  taxSaleListings,
  taxSalePids,
  type TaxSaleListing,
} from "./data/invernessTaxSale";
import {
  PROVINCE_ATTRIBUTION,
  PROVINCE_LICENSE_ACCEPTANCE_KEY,
  PROVINCE_LICENSE_URL,
} from "./licensing/provinceLicense";
import {
  fetchParcels,
  normalizePid,
  type NsprdFeatureCollection,
} from "./services/nsprd";

type TaxSaleFilter = "all" | "redeemable" | "not-redeemable";

const EMPTY_FEATURES: NsprdFeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

const currency = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
});

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
  listing,
  onClose,
}: {
  pid: string;
  listing?: TaxSaleListing;
  onClose: () => void;
}) {
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
      <h2>{listing?.location ?? `PID ${pid}`}</h2>
      <p className={listing ? "notice-status" : "parcel-status"}>
        {listing ? "Listed in official notice" : "NSPRD parcel"}
      </p>
      <dl className="parcel-facts">
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
            <div>
              <dt>Total arrears</dt>
              <dd>{currency.format(listing.totalArrearsCents / 100)}</dd>
            </div>
            <div>
              <dt>Redeemable</dt>
              <dd className={listing.redeemable ? "yes" : "no"}>
                {listing.redeemable ? "Yes" : "No"}
              </dd>
            </div>
          </>
        ) : null}
      </dl>
      {listing ? (
        <p className="sale-warning">
          <span aria-hidden="true">!</span>
          Properties may be redeemed or withdrawn. Verify current status with
          Inverness County and complete a title search.
        </p>
      ) : (
        <p className="sale-warning neutral">
          This PID is not listed in the Inverness County notice used by this map.
        </p>
      )}
      <a
        className="primary-action inspector-action"
        href={invernessTaxSaleNotice.sourceUrl}
        target="_blank"
        rel="noreferrer"
      >
        View official notice
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
        <h2 id="licence-title">Use Nova Scotia property data</h2>
        <p>
          Parcel outlines come from the Nova Scotia Property Records Database.
          Accept the Province’s restricted geographic services licence before
          this layer is loaded.
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
            Accept and view parcels
          </button>
          <button
            className="secondary-action"
            type="button"
            onClick={onContinueWithout}
          >
            Continue without property layers
          </button>
        </div>
      </section>
    </div>
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
  const [showParcelOutlines, setShowParcelOutlines] = useState(true);
  const [showTaxSale, setShowTaxSale] = useState(true);
  const [taxSaleFilter, setTaxSaleFilter] = useState<TaxSaleFilter>("all");

  useEffect(() => {
    if (!licenceAccepted) {
      return;
    }

    const controller = new AbortController();
    fetchParcels(taxSalePids, controller.signal)
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
          "The Province parcel service is temporarily unavailable. The official notice remains accessible.",
        );
      });

    return () => controller.abort();
  }, [licenceAccepted]);

  const filteredTaxSalePids = useMemo(() => {
    const listings = taxSaleListings.filter((listing) => {
      if (taxSaleFilter === "redeemable") {
        return listing.redeemable;
      }
      if (taxSaleFilter === "not-redeemable") {
        return !listing.redeemable;
      }
      return true;
    });
    return new Set(listings.flatMap(({ pids }) => pids));
  }, [taxSaleFilter]);

  const visibleParcels = useMemo<NsprdFeatureCollection>(() => {
    if (!showTaxSale || taxSaleFilter === "all") {
      return parcels;
    }

    return {
      ...parcels,
      features: parcels.features.filter(
        ({ properties }) =>
          filteredTaxSalePids.has(properties.PID) ||
          properties.PID === selectedPid,
      ),
    };
  }, [filteredTaxSalePids, parcels, selectedPid, showTaxSale, taxSaleFilter]);

  const acceptLicence = () => {
    localStorage.setItem(PROVINCE_LICENSE_ACCEPTANCE_KEY, "accepted");
    setLicenceAccepted(true);
    setLicenceDialogOpen(false);
    setShowParcelOutlines(true);
    setShowTaxSale(true);
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

  const selectedListing = selectedPid
    ? listingForPid(selectedPid)
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
              <span className="switch fixed-on" aria-hidden="true" />
              <span>
                <strong>Modern map</strong>
                <small>OpenStreetMap</small>
              </span>
            </label>
            <div className="layer-row unavailable">
              <span className="switch" aria-hidden="true" />
              <span>
                <strong>Fletcher historical map</strong>
                <small>Web rights pending</small>
              </span>
            </div>
            <label className="layer-row">
              <input
                type="checkbox"
                checked={licenceAccepted && showParcelOutlines}
                disabled={!licenceAccepted}
                onChange={(event) => setShowParcelOutlines(event.target.checked)}
              />
              <span className="switch" aria-hidden="true" />
              <span>
                <strong>NSPRD parcel outlines</strong>
                <small>
                  {licenceAccepted ? "Licence accepted" : "Licence required"}
                </small>
              </span>
              {!licenceAccepted ? (
                <button
                  className="text-button"
                  type="button"
                  onClick={() => setLicenceDialogOpen(true)}
                >
                  Review
                </button>
              ) : null}
            </label>
            <label className="layer-row">
              <input
                type="checkbox"
                checked={licenceAccepted && showTaxSale}
                disabled={!licenceAccepted}
                onChange={(event) => setShowTaxSale(event.target.checked)}
              />
              <span className="switch" aria-hidden="true" />
              <span>
                <strong>Tax sale — Inverness County</strong>
                <small>45 notice entries · 47 PIDs</small>
              </span>
            </label>
            <p className="parcel-message" role="status" aria-live="polite">
              {parcelMessage}
            </p>
          </section>

          <section className="rail-section tax-sale-controls" aria-labelledby="filter-heading">
            <h2 id="filter-heading">Tax sale filter</h2>
            <div className="segmented-control" aria-label="Tax sale filter">
              <button
                type="button"
                className={taxSaleFilter === "all" ? "selected" : ""}
                aria-pressed={taxSaleFilter === "all"}
                onClick={() => setTaxSaleFilter("all")}
              >
                All 45
              </button>
              <button
                type="button"
                className={taxSaleFilter === "redeemable" ? "selected" : ""}
                aria-pressed={taxSaleFilter === "redeemable"}
                onClick={() => setTaxSaleFilter("redeemable")}
              >
                Redeemable 27
              </button>
              <button
                type="button"
                className={taxSaleFilter === "not-redeemable" ? "selected" : ""}
                aria-pressed={taxSaleFilter === "not-redeemable"}
                onClick={() => setTaxSaleFilter("not-redeemable")}
              >
                Not redeemable 18
              </button>
            </div>

            <div className="source-note">
              <strong>Official notice · July 16, 2026</strong>
              <span>Sale: August 11 at 9:30 a.m. in Port Hood</span>
              <a
                href={invernessTaxSaleNotice.sourceUrl}
                target="_blank"
                rel="noreferrer"
              >
                Open municipal PDF
              </a>
            </div>
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
            parcels={visibleParcels}
            taxSalePids={filteredTaxSalePids}
            selectedPid={selectedPid}
            showParcelOutlines={licenceAccepted && showParcelOutlines}
            showTaxSale={licenceAccepted && showTaxSale}
            onSelectPid={setSelectedPid}
          />
          {selectedPid ? (
            <ParcelInspector
              pid={selectedPid}
              listing={selectedListing}
              onClose={() => setSelectedPid(null)}
            />
          ) : null}
        </section>
      </main>

      <footer className="map-attribution">
        <span>Map data © OpenStreetMap contributors</span>
        <span>NSPRD © Province of Nova Scotia</span>
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
