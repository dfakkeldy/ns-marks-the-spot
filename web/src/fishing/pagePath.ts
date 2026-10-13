/**
 * The path the address bar should show instead of `pathname`, or null to leave
 * it alone. The public short URL is /fishmap, a KinNoKi site rewrite onto the
 * map's /apps/nsmarksthespot/map/fishing; local servers answer /fishing. A
 * trailing slash on any of them would change what relative links and the
 * share URL are measured from, so it is dropped, and the visitor keeps the
 * path they arrived on (/fishmap/ becomes /fishmap, never /fishing).
 */
export function fishingPagePath(pathname: string): string | null {
  return /\/(?:fishing|fishmap)\/$/u.test(pathname) ? pathname.slice(0, -1) : null;
}
