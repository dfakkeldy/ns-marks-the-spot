import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useStablePerIdCallback } from "./useStablePerIdCallback";

describe("useStablePerIdCallback", () => {
  it("returns the same instance per id across renders — the memo contract", () => {
    const handler = vi.fn();
    const { result, rerender } = renderHook(() =>
      useStablePerIdCallback(handler),
    );
    const first = result.current("nsprd");
    rerender();
    expect(result.current("nsprd")).toBe(first);
    expect(result.current("roads")).not.toBe(first);
  });

  it("calls through to the LATEST handler, not the one captured first", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { result, rerender } = renderHook(
      ({ handler }) => useStablePerIdCallback(handler),
      { initialProps: { handler: first as (id: string, value: boolean) => void } },
    );
    const toggle = result.current("nsprd");
    rerender({ handler: second });
    toggle(true);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith("nsprd", true);
  });
});
