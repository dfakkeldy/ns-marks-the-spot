import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "./ErrorBoundary";

function Boom({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error("tile configuration is invalid");
  }
  return <p>map</p>;
}

describe("ErrorBoundary", () => {
  beforeEach(() => {
    // React logs the caught error itself; silence it so a passing run does not
    // look like a failing one.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders its children while nothing throws", () => {
    render(
      <ErrorBoundary>
        <Boom shouldThrow={false} />
      </ErrorBoundary>,
    );

    expect(screen.getByText("map")).toBeInTheDocument();
  });

  it("replaces a thrown render with a recovery message instead of a blank page", () => {
    render(
      <ErrorBoundary>
        <Boom shouldThrow />
      </ErrorBoundary>,
    );

    expect(
      screen.getByRole("heading", { name: "The map stopped responding" }),
    ).toBeInTheDocument();
    // The user needs to know what a reload costs before clicking it: stored
    // maps survive, selection and layer state do not.
    expect(
      screen.getByText(/stored in this browser and are not lost/),
    ).toBeInTheDocument();
    expect(screen.getByText("tile configuration is invalid")).toBeInTheDocument();
  });

  it("announces itself so a screen reader is told the map is gone", () => {
    render(
      <ErrorBoundary>
        <Boom shouldThrow />
      </ErrorBoundary>,
    );

    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("offers a reload as the recovery path", async () => {
    const user = userEvent.setup();
    const reload = vi.fn();
    const original = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...original, reload },
    });

    render(
      <ErrorBoundary>
        <Boom shouldThrow />
      </ErrorBoundary>,
    );
    await user.click(screen.getByRole("button", { name: "Reload the map" }));

    expect(reload).toHaveBeenCalledTimes(1);
    Object.defineProperty(window, "location", {
      configurable: true,
      value: original,
    });
  });
});
