import { useLayoutEffect, useRef, type DependencyList } from "react";

/**
 * Sizes a scrolling list to whole rows. Rows differ in height (a civic result
 * with a mailing line is taller), so a fixed height in rows sliced the last
 * visible one. This measures the rendered rows, stops the list at the bottom
 * of the last row that fits in `maxRows`, and marks the list with
 * `data-more="true"` while rows remain below, which drives a bottom fade.
 * Without layout (a hidden page, jsdom) it leaves the stylesheet's cap alone.
 */
export function useWholeRowList<T extends HTMLElement>(maxRows: number, deps: DependencyList) {
  const ref = useRef<T | null>(null);
  useLayoutEffect(() => {
    const list = ref.current;
    if (!list) return;
    const rows = Array.from(list.children) as HTMLElement[];
    const update = () => {
      const more = list.scrollTop + list.clientHeight < list.scrollHeight - 1;
      list.dataset.more = String(more);
    };
    if (list.offsetHeight > 0 && rows.length > 0) {
      const border = list.offsetHeight - list.clientHeight;
      list.style.maxHeight = rows.length > maxRows
        ? `${rows[maxRows].offsetTop - rows[0].offsetTop + border}px`
        : "none";
    }
    update();
    list.addEventListener("scroll", update, { passive: true });
    return () => list.removeEventListener("scroll", update);
    // The caller names what changes the rows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return ref;
}
