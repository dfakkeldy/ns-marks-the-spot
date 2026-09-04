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

/**
 * The shape three of App's dialogs take: the dialog element itself is the
 * first focus stop, named with tabIndex={-1} so the whole thing is read out
 * before its controls are reached.
 */
function ContainerFocusDialog({
  onDismiss,
  label = "A dialog",
}: {
  onDismiss: (() => void) | null;
  label?: string;
}) {
  const ref = useDialogChrome<HTMLDivElement>(onDismiss);
  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      tabIndex={-1}
    >
      <button type="button">{`${label} first`}</button>
      <button type="button">{`${label} last`}</button>
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

describe("useDialogChrome, on the paths the first round missed", () => {
  // The container is inside the dialog but is not one of its stops, so a trap
  // that only compared against the two ends let the very first Shift+Tab walk
  // backwards into the page behind the modal.
  it("keeps the first Shift+Tab inside a dialog that focuses its own container", async () => {
    const user = userEvent.setup();
    render(
      <>
        <button type="button">Behind the dialog</button>
        <ContainerFocusDialog onDismiss={vi.fn()} />
      </>,
    );
    expect(document.activeElement).toBe(
      screen.getByRole("dialog", { name: "A dialog" }),
    );

    await user.tab({ shift: true });
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "A dialog last" }),
    );

    await user.tab({ shift: true });
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "A dialog first" }),
    );
  });

  it("sends the first forward Tab from the container to the first stop", async () => {
    const user = userEvent.setup();
    render(<ContainerFocusDialog onDismiss={vi.fn()} />);
    await user.tab();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "A dialog first" }),
    );
  });

  // Two of these can be open at once — the phone's attribution strip keeps
  // About this map reachable beside a photo lightbox — and each listens on the
  // document, so one press used to close the whole stack.
  it("gives Escape to the topmost dialog only", async () => {
    const user = userEvent.setup();
    const closeUnder = vi.fn();
    const closeOver = vi.fn();
    render(
      <>
        <ContainerFocusDialog onDismiss={closeUnder} label="Underneath" />
        <ContainerFocusDialog onDismiss={closeOver} label="On top" />
      </>,
    );

    await user.keyboard("{Escape}");
    expect(closeOver).toHaveBeenCalledTimes(1);
    expect(closeUnder).not.toHaveBeenCalled();
  });

  it("gives Escape back to the one that is left", async () => {
    const user = userEvent.setup();
    const closeUnder = vi.fn();
    render(<ContainerFocusDialog onDismiss={closeUnder} label="Underneath" />);
    await user.keyboard("{Escape}");
    expect(closeUnder).toHaveBeenCalledTimes(1);
  });
});
