import type { TaxSaleListing } from "../data/taxSaleCatalog";

type TaxSalePropertyListProps = {
  eventId: string;
  municipality: string;
  listings: TaxSaleListing[];
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

export function TaxSalePropertyList({
  eventId,
  municipality,
  listings,
  selectedPid,
  disabled,
  onSelectPid,
}: TaxSalePropertyListProps) {
  const count = propertyCount(listings);

  return (
    <details className="tax-sale-property-list">
      <summary>
        <span>Browse properties</span>
        <small>
          {count} {count === 1 ? "parcel" : "parcels"} shown
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
                      onClick={() => onSelectPid(eventId, pid)}
                    >
                      <strong>{propertyLabel(listing)}</strong>
                      <span>
                        {listing.lien ? `Lien ${listing.lien} · ` : null}PID {pid}
                      </span>
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
      </div>
    </details>
  );
}
