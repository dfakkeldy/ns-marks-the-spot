import { useCallback, useEffect, useRef } from "react";

/**
 * A factory of IDENTITY-STABLE per-id callbacks.
 *
 * The layer rail renders dozens of memoized toggle rows whose `onChange`
 * used to be a fresh inline closure per App render — which made React.memo
 * on the rows worthless, since one prop always changed. This returns the
 * SAME function instance for the same id across renders, reading the latest
 * handler through a ref at call time, so a row's props only change when its
 * own state does.
 *
 * The ref is synced in an effect, not during render, per this codebase's
 * StrictMode conventions; events can only fire after the commit that ran
 * the effect, so the ref is never stale when a callback runs.
 */
export function useStablePerIdCallback<Id extends string>(
  handler: (id: Id, value: boolean) => void,
): (id: Id) => (value: boolean) => void {
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);
  const cacheRef = useRef(new Map<Id, (value: boolean) => void>());
  return useCallback((id: Id) => {
    const cached = cacheRef.current.get(id);
    if (cached) {
      return cached;
    }
    const stable = (value: boolean) => handlerRef.current(id, value);
    cacheRef.current.set(id, stable);
    return stable;
  }, []);
}
