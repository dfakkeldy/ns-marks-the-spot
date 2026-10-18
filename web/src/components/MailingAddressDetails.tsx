import { useEffect, useState } from "react";
import type { CivicAddress } from "../services/civicAddresses";
import {
  enrichCivicAddresses, MAILING_ATTRIBUTION, MAILING_DATE, MAILING_LICENCE_URL,
  MAILING_SOURCE_URL, mailingLabel, type MailingCivicAddress,
} from "../services/mailingAddresses";

export function MailingSource() {
  return <details className="mailing-source">
    <summary>Statistics Canada · {MAILING_DATE}</summary>
    <p>{MAILING_ATTRIBUTION}</p>
    <p><a href={MAILING_SOURCE_URL} target="_blank" rel="noreferrer">National Address Register</a>{" · "}
      <a href={MAILING_LICENCE_URL} target="_blank" rel="noreferrer">Statistics Canada Open Licence</a></p>
    <p>A dated mailing-address record, not live Canada Post validation. Civic communities and mailing communities can differ.</p>
  </details>;
}

export function MailingAddressDetails({ addresses }: { addresses: CivicAddress[] }) {
  const [reading, setReading] = useState<{ input: CivicAddress[]; rows: MailingCivicAddress[] } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void enrichCivicAddresses(addresses, controller.signal).then(rows => {
      if (!controller.signal.aborted) setReading({ input: addresses, rows });
    }).catch(() => { /* Only cancellation escapes the source-error reading. */ });
    return () => controller.abort();
  }, [addresses]);
  if (!addresses.length) return null;
  const rows = reading?.input === addresses ? reading.rows : null;
  return <section className="mailing-addresses" aria-label="Mailing address evidence">
    <h4>Mailing address{addresses.length === 1 ? "" : "es"}</h4>
    {!rows ? <p role="status">Looking up mailing addresses…</p> : <ul>{rows.map(address => {
      const match = address.mailing;
      return <li key={address.pntid}>
        {addresses.length > 1 ? <span>Civic: {address.label}</span> : null}
        {match?.status === "matched" ? <>
          <span>Mailing: {mailingLabel(match.record)}</span>
          {match.record.additional ? <span>Additional delivery information: {match.record.additional}</span> : null}
          <details><summary>Source record</summary><span>NAR address ID: {match.record.id}</span></details>
        </> : <span>{match?.status === "source-error" ? "Mailing address lookup is unavailable right now." :
          match?.status === "ambiguous" ? "Multiple address records match; the mailing address is uncertain." :
          "No confident mailing-address match in this snapshot. This does not mean the address cannot receive mail."}</span>}
      </li>;
    })}</ul>}
    <MailingSource />
  </section>;
}
