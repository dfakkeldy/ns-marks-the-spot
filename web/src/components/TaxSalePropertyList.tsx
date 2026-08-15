import { useState } from "react";
import type { TaxSaleListing } from "../data/taxSaleCatalog";
import type { TaxSaleGeometryException } from "../data/taxSaleTypes";

type TaxSalePropertyListProps = {
  eventId: string;
  municipality: string;
  listings: TaxSaleListing[];
  geometryExceptions?: TaxSaleGeometryException[];
  selectedPid: string | null;
  disabled: boolean;
  onSelectPid: (eventId: string, pid: string) => void;
};

function propertyCount(listings: TaxSaleListing[]): number {
  return listings.reduce((count, listing) => count + listing.pids.length, 0);
}

function propertyLabel(listing: TaxSaleListing): string {
  return listing.addressOrDescription ?? listing.location;
}

function checkedDateLabel(value: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}

export function TaxSalePropertyList({
  eventId,
  municipality,
  listings,
  geometryExceptions = [],
  selectedPid,
  disabled,
  onSelectPid,
}: TaxSalePropertyListProps) {
  const count = propertyCount(listings);
  const unavailableCount = geometryExceptions.reduce(
    (total, exception) => total + exception.pids.length,
    0,
  );
  const [openState, setOpenState] = useState({
    open: false,
    selectedPid,
  });
  const open = openState.open && openState.selectedPid === selectedPid;

  return (
    <details
      className="tax-sale-property-list"
      open={open}
      onToggle={(event) =>
        setOpenState({ open: event.currentTarget.open, selectedPid })
      }
    >
      <summary>
        <span>Browse properties</span>
        <small>
          {unavailableCount > 0
            ? `${count} ${count === 1 ? "parcel" : "parcels"} mapped · ${unavailableCount} unavailable`
            : `${count} ${count === 1 ? "parcel" : "parcels"} shown`}
        </small>
      </summary>
      <div className="tax-sale-property-list-body">
        <p>Choose a property to zoom to its parcel and open the notice details.</p>
        {count > 0 ? (
          <ul aria-label={`${municipality} tax-sale properties`}>
            {listings.flatMap((listing) =>
              listing.pids.map((pid) => {
                const selected = pid === selectedPid;
                return (
                  <li key={`${listing.recordId}:${pid}`}>
                    <button
                      type="button"
                      className={selected ? "selected" : undefined}
                      aria-current={selected ? "true" : undefined}
                      aria-label={`${propertyLabel(listing)}, lien ${listing.lien ?? "not listed"}, PID ${pid}`}
                      disabled={disabled}
                      onClick={() => {
                        setOpenState({ open: false, selectedPid: pid });
                        onSelectPid(eventId, pid);
                      }}
                    >
                      <strong>{propertyLabel(listing)}</strong>
                      <span>
                        {listing.lien ? `Lien ${listing.lien} · ` : null}PID {pid}
                      </span>
                      {listing.listingStatus === "withdrawn" ? (
                        <span className="listing-status withdrawn">
                          Withdrawn in current notice revision
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              }),
            )}
          </ul>
        ) : (
          <p className="tax-sale-property-list-empty">
            No properties match the selected redemption category.
          </p>
        )}
        {geometryExceptions.length > 0 ? (
          <>
            <p className="tax-sale-property-list-unavailable-heading">
              Official notice rows unavailable in NSPRD
            </p>
            <ul
              className="tax-sale-property-list-unavailable"
              aria-label={`${municipality} unavailable tax-sale properties`}
            >
              {geometryExceptions.map((exception) => (
                <li key={exception.recordId}>
                  <strong>{exception.location}</strong>
                  <span>
                    {exception.aan ? `AAN ${exception.aan} · ` : null}
                    {exception.pids.length === 1 ? "PID" : "PIDs"}{" "}
                    {exception.pids.join(", ")}
                  </span>
                  <span className="listing-status geometry-unavailable">
                    No exact NSPRD geometry was returned on{" "}
                    {checkedDateLabel(exception.checkedOn)}. The official notice
                    row is retained but is not shown as a mapped parcel.
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
    </details>
  );
}
