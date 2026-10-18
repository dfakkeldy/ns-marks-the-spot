/**
 * Civil-time helpers for Nova Scotia timestamps.
 *
 * Every sale timestamp in the data modules used to hard-code the summer
 * offset (-03:00, ADT), but Nova Scotia is -04:00 (AST) from early November
 * to mid-March — and municipalities do hold October and March sales. A
 * winter deadline built with the summer offset lands one hour early, so
 * eventLifecycleStatus flipped a sale to "verify-results" an hour before it
 * actually started, and any rendered deadline time would be an hour off.
 *
 * The offset is derived from the IANA zone rather than a DST-rule table:
 * Intl's America/Halifax data is what the user's clock already follows.
 */
const offsetFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Halifax",
  timeZoneName: "longOffset",
});

export function halifaxUtcOffset(date: string): "-03:00" | "-04:00" {
  // Noon UTC sits mid-morning local on both sides of a transition, so the
  // probe never straddles the 2 a.m. changeover itself.
  const probe = new Date(`${date}T12:00:00Z`);
  const zonePart = offsetFormatter
    .formatToParts(probe)
    .find(({ type }) => type === "timeZoneName")?.value;
  return zonePart?.endsWith("-03:00") ? "-03:00" : "-04:00";
}

/** `YYYY-MM-DD` + `HH:MM` in Halifax civil time → an exact instant. */
export function halifaxTimestamp(date: string, time: string): string {
  return `${date}T${time}:00${halifaxUtcOffset(date)}`;
}
