/**
 * The main map's memory of the reader's last view. It is the address bar's own
 * query string, kept in this browser and sent nowhere: returning restores it
 * through the same path as any link, without a page load.
 */

export interface LastView {
  /** The map's query string, with its leading "?". */
  readonly search: string;
  /** The setup's name then, for the offer to say. */
  readonly setupName: string;
}

/** How this visit began. */
export type OpeningKind = "plain" | "own" | "link";

const LAST_VIEW_KEY = "ns-marks-the-spot:last-view:v1";
/** Per tab, so a reload of a link is still a link and a reload of a session is still that session. */
const TAB_VIEW_KEY = "ns-marks-the-spot:tab-view:v1";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function parse(value: string | null): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

export function readLastView(storage: StorageLike | null): LastView | null {
  try {
    const parsed = parse(storage?.getItem(LAST_VIEW_KEY) ?? null);
    return parsed && typeof parsed.search === "string" && parsed.search.startsWith("?") && typeof parsed.setupName === "string"
      ? { search: parsed.search, setupName: parsed.setupName }
      : null;
  } catch {
    return null;
  }
}

/** A blocked or full store just means nothing is remembered. */
export function writeLastView(storage: StorageLike | null, view: LastView): void {
  try { storage?.setItem(LAST_VIEW_KEY, JSON.stringify(view)); } catch { /* Not remembered. */ }
}

export function clearLastView(storage: StorageLike | null): void {
  try { storage?.removeItem(LAST_VIEW_KEY); } catch { /* Nothing to forget. */ }
}

export function writeTabView(storage: StorageLike | null, search: string, fromLink: boolean): void {
  try { storage?.setItem(TAB_VIEW_KEY, JSON.stringify({ search, fromLink })); } catch { /* Not remembered. */ }
}

/**
 * The address bar is rewritten on every move, so a query string alone does not
 * mean someone sent a link: this tab may have written it, or it may be the
 * remembered view. Anything else came from outside, and it always wins.
 */
export function classifyOpening(
  search: string,
  hasMapState: boolean,
  lastView: LastView | null,
  tabStorage: StorageLike | null,
): OpeningKind {
  if (!hasMapState) return "plain";
  let tab: Record<string, unknown> | null = null;
  try { tab = parse(tabStorage?.getItem(TAB_VIEW_KEY) ?? null); } catch { /* Treated as a new tab. */ }
  if (tab?.search === search) return tab.fromLink === true ? "link" : "own";
  return lastView?.search === search ? "own" : "link";
}

/** Whether a plain visit has something worth offering back. */
export function offersReturn(lastView: LastView | null): lastView is LastView {
  return lastView !== null && lastView.search.length > 1;
}
