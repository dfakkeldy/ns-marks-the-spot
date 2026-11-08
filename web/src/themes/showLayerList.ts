import { useCallback } from "react";

/**
 * Bring the panel's layer list, where each layer keeps its source and caveats,
 * into view. On a phone the sheet renders on the next frame.
 */
export function useShowLayerList(openMobileControls: () => void): () => void {
  return useCallback(() => {
    openMobileControls();
    requestAnimationFrame(() => {
      const heading = document.getElementById("layers-heading");
      const still = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      heading?.scrollIntoView?.({ block: "start", behavior: still ? "auto" : "smooth" });
      heading?.focus({ preventScroll: true });
    });
  }, [openMobileControls]);
}
