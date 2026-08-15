import { beforeEach, describe, expect, it } from "vitest";
import { builtInMapThemes } from "./mapThemes";
import {
  CUSTOM_THEME_STORAGE_KEY,
  createCustomTheme,
  deleteCustomTheme,
  duplicateCustomTheme,
  loadCustomThemes,
  renameCustomTheme,
  saveCustomThemes,
  updateCustomTheme,
} from "./themeStorage";

const fieldDayState = {
  layerIds: ["modern"] as const,
  opacityOverrides: {},
  taxSaleEnabled: false,
  mapMode: "current" as const,
};

beforeEach(() => localStorage.clear());

describe("custom theme storage", () => {
  it("loads valid version-one themes and skips obsolete IDs with a warning", () => {
    localStorage.setItem(CUSTOM_THEME_STORAGE_KEY, JSON.stringify({
      version: 1,
      themes: [{
        id: "custom-1",
        name: "Field day",
        layerIds: ["modern", "removed-layer"],
        opacityOverrides: {},
        preferredCategoryIds: ["background-maps", "removed-category"],
        taxSaleEnabled: false,
        mapMode: "current",
      }],
    }));

    expect(loadCustomThemes(localStorage)).toMatchObject({
      themes: [{
        id: "custom-1",
        kind: "custom",
        layerIds: ["modern"],
        preferredCategoryIds: ["background-maps"],
      }],
      warning: expect.stringContaining("could not be restored"),
    });
  });

  it("does not overwrite corrupt raw storage", () => {
    localStorage.setItem(CUSTOM_THEME_STORAGE_KEY, "not-json");

    expect(loadCustomThemes(localStorage)).toEqual({
      themes: [],
      warning: "Your custom-theme library could not be loaded. Explore Nova Scotia is being used for this session.",
    });
    expect(localStorage.getItem(CUSTOM_THEME_STORAGE_KEY)).toBe("not-json");
  });

  it("does not write while loading a valid library", () => {
    const storage = {
      getItem: () => JSON.stringify({ version: 1, themes: [] }),
      setItem: () => {
        throw new Error("loading must not write");
      },
      removeItem: () => {
        throw new Error("loading must not remove");
      },
    } as unknown as Storage;

    expect(loadCustomThemes(storage)).toEqual({ themes: [], warning: null });
  });

  it("uses the fallback warning when browser storage cannot be read", () => {
    const unavailableStorage = {
      getItem: () => {
        throw new Error("storage unavailable");
      },
    } as unknown as Storage;

    expect(loadCustomThemes(unavailableStorage)).toEqual({
      themes: [],
      warning: "Your custom-theme library could not be loaded. Explore Nova Scotia is being used for this session.",
    });
  });

  it("skips duplicate stored IDs without discarding the valid theme", () => {
    localStorage.setItem(CUSTOM_THEME_STORAGE_KEY, JSON.stringify({
      version: 1,
      themes: [
        { ...fieldDayState, id: "custom-1", name: "Field day", preferredCategoryIds: [] },
        { ...fieldDayState, id: "custom-1", name: "Duplicate", preferredCategoryIds: [] },
      ],
    }));

    expect(loadCustomThemes(localStorage)).toMatchObject({
      themes: [{ id: "custom-1", name: "Field day" }],
      warning: expect.stringContaining("duplicate ID: custom-1"),
    });
  });

  it("rejects invalid custom theme names, modes, and opacity bounds", () => {
    expect(() => createCustomTheme("   ", fieldDayState, [], "custom-1"))
      .toThrow("Custom theme name is required.");
    expect(() => createCustomTheme("Field day", {
      ...fieldDayState,
      mapMode: "future" as never,
    }, [], "custom-1")).toThrow("invalid map mode");
    expect(() => createCustomTheme("Field day", {
      ...fieldDayState,
      opacityOverrides: { modern: 1.1 },
    }, [], "custom-1")).toThrow("invalid opacity: modern");
  });

  it("creates, renames, updates, duplicates, and deletes without mutating inputs", () => {
    const created = createCustomTheme("Field day", fieldDayState, ["my-maps"], "custom-1");
    const renamed = renameCustomTheme([created], created.id, "Woodlot");
    const updated = updateCustomTheme(renamed, created.id, {
      layerIds: ["ns-aerial"], opacityOverrides: {}, taxSaleEnabled: false, mapMode: "current",
    }, ["forestry-ecology"]);
    const duplicated = duplicateCustomTheme(updated, created.id, "custom-2");

    expect(deleteCustomTheme(duplicated, created.id)).toHaveLength(1);
    expect(created.name).toBe("Field day");
    expect(renamed[0]).not.toBe(created);
    expect(updated[0]).toMatchObject({
      name: "Woodlot",
      layerIds: ["ns-aerial"],
      preferredCategoryIds: ["forestry-ecology"],
    });
    expect(duplicated[1]).toMatchObject({ id: "custom-2", name: "Woodlot" });
  });

  it("rejects duplicate IDs and built-in themes from the custom repository", () => {
    const created = createCustomTheme("Field day", fieldDayState, [], "custom-1");

    expect(() => duplicateCustomTheme([created], created.id, "custom-1"))
      .toThrow("duplicate ID: custom-1");
    expect(() => renameCustomTheme([builtInMapThemes[0]], "explore-nova-scotia", "Changed"))
      .toThrow("Built-in themes are not accepted by the custom-theme repository.");
    expect(saveCustomThemes([builtInMapThemes[0]], localStorage)).toEqual({
      ok: false,
      message: "Only custom themes can be saved in this browser.",
    });
  });

  it("returns a save error when browser storage rejects a write without changing the usable theme list", () => {
    const themes = [createCustomTheme("Field day", fieldDayState, [], "custom-1")];
    const quotaLimitedStorage = {
      setItem: () => {
        throw new Error("quota exceeded");
      },
    } as unknown as Storage;

    expect(saveCustomThemes(themes, quotaLimitedStorage)).toEqual({
      ok: false,
      message: "Your custom themes could not be saved in this browser.",
    });
    expect(renameCustomTheme(themes, "custom-1", "Woodlot")).toMatchObject([
      { id: "custom-1", name: "Woodlot" },
    ]);
    expect(themes[0].name).toBe("Field day");
  });
});
