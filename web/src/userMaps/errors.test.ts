import { describe, expect, it } from "vitest";
import { UserMapImportError } from "./errors";

describe("UserMapImportError", () => {
  it("keeps the user message separate from the developer message", () => {
    const error = new UserMapImportError(
      "too-large",
      "This file is over 500 MB.",
    );
    expect(error.userMessage).toBe("This file is over 500 MB.");
    // The Error message prefixes the code so console/stack output is
    // diagnosable, while userMessage stays clean enough to render.
    expect(error.message).toBe("too-large: This file is over 500 MB.");
  });

  it("is a real Error subclass so instanceof and catch work", () => {
    const error = new UserMapImportError("quota", "Storage is full.");
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(UserMapImportError);
    expect(error.name).toBe("UserMapImportError");
  });

  it("carries the code through a throw/catch round trip", () => {
    try {
      throw new UserMapImportError("unsupported-crs", "Reproject and retry.");
    } catch (caught) {
      expect(caught).toBeInstanceOf(UserMapImportError);
      expect((caught as UserMapImportError).code).toBe("unsupported-crs");
    }
  });
});
