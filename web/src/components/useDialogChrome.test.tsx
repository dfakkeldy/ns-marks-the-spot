import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { useDialogChrome } from "./useDialogChrome";

function Dialog({
  onDismiss,
  extra = false,
}: {
  onDismiss: (() => void) | null;
  extra?: boolean;
}) {
  const ref = useDialogChrome<HTMLDivElement>(onDismiss);
  return (
    <div ref={ref} role="dialog" aria-modal="true" aria-label="A dialog">
      <button type="button">First</button>
      {extra ? <button type="button">Middle</button> : null}
      <button type="button">Last</button>
    </div>
  );
}

function Page({
  open,
  onDismiss = vi.fn(),
  extra = false,
}: {
  open: boolean;
  onDismiss?: (() => void) | null;
  extra?: boolean;
}) {
  return (
    <>
      <button type="button">Opener</button>
      <button type="button">Behind the dialog</button>
      {open ? <Dialog onDismiss={onDismiss} extra={extra} /> : null}
    </>
  );
}

describe("useDialogChrome", () => {
  it("moves focus into the dialog and back to whatever opened it", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Page open={false} />);
    await user.click(screen.getByRole("button", { name: "Opener" }));

    rerender(<Page open />);
    expect(screen.getByRole("button", { name: "First" })).toHaveFocus();

    rerender(<Page open={false} />);
    expect(screen.getByRole("button", { name: "Opener" })).toHaveFocus();
  });

  // `aria-modal` is only an announcement: on its own nothing stops Tab walking
  // out of the dialog and into the map behind it.
  it("keeps Tab inside the dialog in both directions", async () => {
    const user = userEvent.setup();
    render(<Page open />);

    const first = screen.getByRole("button", { name: "First" });
    const last = screen.getByRole("button", { name: "Last" });
    expect(first).toHaveFocus();

    await user.tab();
    expect(last).toHaveFocus();
    // Off the end wraps to the start rather than reaching the page behind.
    await user.tab();
    expect(first).toHaveFocus();

    await user.tab({ shift: true });
    expect(last).toHaveFocus();
  });

  it("reads the dialog's controls again on each press, not once at mount", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Page open />);
    // A control appears while the dialog is open, as the export dialog's and
    // the photo import's do.
    rerender(<Page open extra />);

    screen.getByRole("button", { name: "Middle" }).focus();
    await user.tab();

    expect(screen.getByRole("button", { name: "Last" })).toHaveFocus();
  });

  it("answers Escape, or stays silent for a dialog that must not be dismissed by it", async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    const { rerender } = render(<Page open onDismiss={onDismiss} />);

    await user.keyboard("{Escape}");
    expect(onDismiss).toHaveBeenCalledTimes(1);

    // The save-track dialog holds a walked track: a stray keypress must not
    // throw it away.
    rerender(<Page open={false} />);
    render(<Page open onDismiss={null} />);
    await user.keyboard("{Escape}");
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  // A photo opened from a Leaflet popup is opened by a button the popup tears
  // down with it. Focusing a detached node does nothing, so the restore has to
  // notice rather than silently drop focus somewhere unrelated.
  it("does not chase an opener that has left the document", async () => {
    const user = userEvent.setup();
    function Transient({ open }: { open: boolean }) {
      return (
        <>
          {!open ? <button type="button">Temporary opener</button> : null}
          {open ? <Dialog onDismiss={vi.fn()} /> : null}
        </>
      );
    }
    const { rerender } = render(<Transient open={false} />);
    await user.click(screen.getByRole("button", { name: "Temporary opener" }));

    rerender(<Transient open />);
    expect(screen.getByRole("button", { name: "First" })).toHaveFocus();

    expect(() => rerender(<Transient open={false} />)).not.toThrow();
  });
});
