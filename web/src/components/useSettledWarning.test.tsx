import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useSettledWarning } from "./useSettledWarning";

function Probe({ note }: { note: string | null }) {
  return <span data-testid="settled">{useSettledWarning(note, 4_000) ?? ""}</span>;
}

describe("useSettledWarning", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("holds a warning back until it has lasted", () => {
    vi.useFakeTimers();
    const { getByTestId, rerender } = render(<Probe note={null} />);
    rerender(<Probe note="Positions are too rough." />);
    expect(getByTestId("settled")).toHaveTextContent("");

    act(() => {
      vi.advanceTimersByTime(3_999);
    });
    expect(getByTestId("settled")).toHaveTextContent("");

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(getByTestId("settled")).toHaveTextContent("Positions are too rough.");
  });

  // A state that has ENDED is not a state to keep announcing: reading "the
  // positions are too rough" over the top of "Paused" is two states at once,
  // and one of them untrue.
  it("drops a settled warning the moment the state ends", () => {
    vi.useFakeTimers();
    const { getByTestId, rerender } = render(<Probe note={null} />);
    rerender(<Probe note="Positions are too rough." />);
    act(() => {
      vi.advanceTimersByTime(4_000);
    });
    expect(getByTestId("settled")).toHaveTextContent("Positions are too rough.");

    rerender(<Probe note={null} />);
    expect(getByTestId("settled")).toHaveTextContent("");
  });

  it("never announces a warning that came and went inside the delay", () => {
    vi.useFakeTimers();
    const { getByTestId, rerender } = render(<Probe note={null} />);
    // Accuracy hovering on the gate: rejected, accepted, rejected, once a
    // second. None of it lasts, so none of it is read out.
    for (const note of ["a", null, "a", null, "a"]) {
      rerender(<Probe note={note} />);
      act(() => {
        vi.advanceTimersByTime(1_000);
      });
    }
    expect(getByTestId("settled")).toHaveTextContent("");
  });
});
