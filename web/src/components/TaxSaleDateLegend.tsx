import type { TaxSaleEvent } from "../data/taxSaleCatalog";
import {
  TAX_SALE_DATE_BAND_LABEL,
  TAX_SALE_DATE_BAND_ORDER,
  TAX_SALE_DATE_BAND_STYLE,
  taxSaleDateBand,
  type TaxSaleDateBand,
} from "../services/taxSaleDateBands";

/** One dot in the band's paint, matching the map marker. */
export function TaxSaleDateDot({ band }: { band: TaxSaleDateBand }) {
  const style = TAX_SALE_DATE_BAND_STYLE[band];
  return (
    <svg
      className="tax-sale-date-dot"
      width="14"
      height="14"
      viewBox="0 0 14 14"
      aria-hidden="true"
      data-band={band}
    >
      <circle
        cx="7"
        cy="7"
        r="5.25"
        fill={style.fill}
        fillOpacity={style.fillOpacity}
        stroke={style.dashed ? style.stroke : "rgba(0, 0, 0, 0.35)"}
        strokeWidth={style.dashed ? 1.5 : 1}
        strokeDasharray={style.dashed ? "2.4 1.6" : undefined}
      />
    </svg>
  );
}

/**
 * Legend for sale-date dot colours. Bands come from each sale's recorded date
 * and today's date in Atlantic time. It counts sales: one municipal sale holds
 * many advertised notices, which the sale's own row counts.
 */
export function TaxSaleDateLegend({
  events,
  now,
}: {
  events: TaxSaleEvent[];
  now: number;
}) {
  const counts = new Map<TaxSaleDateBand, number>();
  for (const event of events) {
    const band = taxSaleDateBand(event, now);
    counts.set(band, (counts.get(band) ?? 0) + 1);
  }
  return (
    <figure className="tax-sale-date-legend" aria-label="Dot colour by sale date">
      <figcaption>Dot colour · sale date</figcaption>
      <ul>
        {TAX_SALE_DATE_BAND_ORDER.map((band) => {
          const count = counts.get(band) ?? 0;
          return (
            <li key={band} data-band={band} className={count === 0 ? "empty" : undefined}>
              <TaxSaleDateDot band={band} />
              <span>{TAX_SALE_DATE_BAND_LABEL[band]}</span>
              <small>
                {count === 1 ? "1 sale" : `${count} sales`}
              </small>
            </li>
          );
        })}
      </ul>
      <p>
        Bands are relative to today’s date in Atlantic time, from the date
        each sale’s notice records. Confirm dates with the municipality.
      </p>
    </figure>
  );
}
