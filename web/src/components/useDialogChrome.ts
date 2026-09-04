import { useEffect, useRef } from "react";

/**
 * What a browser will actually put focus on inside a dialog. `[hidden]` is
 * excluded because the bulk photo import keeps its real file input hidden
 * behind a styled button: it matches `input` but cannot take focus, so a trap
 * that treated it as the last stop would strand the keyboard on nothing.
 */
const FOCUSABLE = [
  "a[href]:not([hidden])",
  "button:not([disabled]):not([hidden])",
  'input:not([disabled]):not([hidden]):not([type="hidden"])',
  "select:not([disabled]):not([hidden])",
  "textarea:not([disabled]):not([hidden])",
  '[tabindex]:not([tabindex="-1"]):not([disabled]):not([hidden])',
].join(", ");

/**
 * The focus contract every dialog in this app claims with `aria-modal="true"`
 * and, until now, mostly did not keep: move focus in, keep Tab inside, and
 * give focus back to whatever opened it.
 *
 * `aria-modal` is only an announcement to assistive technology. On its own
 * nothing stops a Tab press walking out of the dialog and into the map behind
 * it, which is what every one of these dialogs did.
 *
 * What this deliberately does NOT do is make the rest of the page `inert`.
 * Inerting takes the whole branch out of the accessibility tree, and two of
 * this app's live regions live in it: the parcel caution and the map-level
 * write-failure alerts. A storage refusal that arrived while a dialog was
 * open would become silence, which is a worse failure than a pointer reaching
 * the map behind a dialog. Keeping the pointer out as well wants those regions
 * moved out from behind the dialogs first, which is its own change.
 *
 * Escape is answered by one dialog only: whichever of the open modals comes
 * last in the document. Two can be open at once, each with its own document
 * listener, and before this a single press closed both.
 *
 * Pass `null` for a dialog Escape must not close — the save-track dialog holds
 * a walked track that no stray keypress may discard. The dismiss handler is
 * read through a ref so inline-arrow props do not re-run the mount effect,
 * which would bounce focus on every parent render.
 */
export function useDialogChrome<T extends HTMLElement = HTMLElement>(
  onDismiss: (() => void) | null,
) {
  const dialogRef = useRef<T | null>(null);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;
  useEffect(() => {
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const dialog = dialogRef.current;
    // A dialog that names its own first stop with tabIndex={-1} keeps it;
    // otherwise focus lands on the first control, which is what a reader
    // would reach with one Tab anyway.
    const first = dialog?.querySelector<HTMLElement>(FOCUSABLE);
    if (dialog?.hasAttribute("tabindex")) {
      dialog.focus();
    } else {
      (first ?? dialog)?.focus();
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && dismissRef.current) {
        // Only the topmost dialog answers. Two of these can be open at once —
        // the phone's About button stays reachable beside a photo lightbox —
        // and every one of them listens on the document, so without this one
        // keypress closed the whole stack.
        const dialogs = document.querySelectorAll<HTMLElement>(
          '[role="dialog"][aria-modal="true"]',
        );
        if (dialog && dialogs.length > 1 && dialogs[dialogs.length - 1] !== dialog) {
          return;
        }
        event.preventDefault();
        dismissRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialog) {
        return;
      }
      // Read on each press, not captured: a dialog's controls appear and
      // disappear as it is used — the export dialog disables Download while
      // it renders, the photo import grows a list — and a trap built from a
      // stale list sends focus to a control that is no longer there.
      const stops = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (stops.length === 0) {
        return;
      }
      const active = document.activeElement;
      const inside = active instanceof HTMLElement && dialog.contains(active);
      // Where focus is in the ring, not merely whether it is in the dialog.
      // A dialog that names itself the first stop with tabIndex={-1} holds
      // focus on a container that is inside the dialog and is not one of its
      // stops, so a check that only compared against the ends let the very
      // first Shift+Tab walk backwards out of the modal.
      const at = active instanceof HTMLElement ? stops.indexOf(active) : -1;
      const edge = event.shiftKey ? 0 : stops.length - 1;
      if (!inside || at === -1 || at === edge) {
        event.preventDefault();
        (event.shiftKey ? stops[stops.length - 1] : stops[0]).focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      // Only if it is still there: a Leaflet popup that opened a photo is torn
      // down with the popup, and focusing a detached node does nothing.
      if (opener?.isConnected) {
        opener.focus();
      }
    };
  }, []);
  return dialogRef;
}
