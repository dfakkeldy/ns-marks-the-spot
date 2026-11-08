import type { ReactNode, Ref } from "react";
import type { MapThemeDefinition } from "../themes/mapThemes";

export type MapThemeStatus = "exact" | "modified" | "shared" | "partial";

interface MapThemePickerProps {
  themes: readonly MapThemeDefinition[];
  activeThemeId: string | null;
  status: MapThemeStatus;
  notice: string | null;
  selectRef?: Ref<HTMLSelectElement>;
  onSelect: (themeId: string) => void;
  onSave: () => void;
  onManage: () => void;
  onReset: () => void;
  /** Quick actions for the active setup, shown under its description. */
  shortcuts?: ReactNode;
  /** What the reader changed from the setup, in plain words. */
  changeSummary?: string | null;
}

/**
 * The task setups Explore offers as one-tap chips, in this order, with the
 * short names a chip has room for. The full list stays in the select.
 */
const EXPLORE_SETUP_CHIPS: readonly (readonly [themeId: string, label: string])[] = [
  ["tax-sale-research", "Tax sale"],
  ["forestry-field-access", "Forestry"],
  ["historical-maps", "Historical"],
  ["fishing", "Fishing"],
  ["electoral-districts", "Elections"],
];

export function MapThemePicker({
  themes,
  activeThemeId,
  status,
  notice,
  selectRef,
  onSelect,
  onSave,
  onManage,
  onReset,
  shortcuts,
  changeSummary,
}: MapThemePickerProps) {
  const active = themes.find(({ id }) => id === activeThemeId);
  const builtInThemes = themes.filter(({ kind }) => kind === "built-in");
  const customThemes = themes.filter(({ kind }) => kind === "custom");
  // A change is the reader's own work, not a fault: it says what they did.
  const label = status === "modified"
    ? `Your changes: ${changeSummary ?? "layers changed"}`
    : status === "partial"
      ? `${active?.name ?? "Shared setup"} — Partially applied`
      : active?.name ?? "Shared setup";

  return (
    <section className="map-theme-picker">
      <h2 id="map-setup-heading">Change setup</h2>
      <label>
        <span className="sr-only">Change setup</span>
        <select
          ref={selectRef}
          value={activeThemeId ?? "shared"}
          onChange={(event) => onSelect(event.target.value)}
        >
          {activeThemeId === null ? (
            <option value="shared">Shared setup</option>
          ) : null}
          <optgroup label="Built-in themes">
            {builtInThemes.map((theme) => (
              <option key={theme.id} value={theme.id}>
                {theme.name}
              </option>
            ))}
          </optgroup>
          {customThemes.length > 0 ? (
            <optgroup label="My themes">
              {customThemes.map((theme) => (
                <option key={theme.id} value={theme.id}>
                  {theme.name}
                </option>
              ))}
            </optgroup>
          ) : null}
        </select>
      </label>
      <p className="map-theme-description">
        {active?.description ?? "Map settings restored from a shared link."}
      </p>
      {activeThemeId === "explore-nova-scotia" ? (
        <div className="setup-chips" role="group" aria-label="Start a task">
          {EXPLORE_SETUP_CHIPS.filter(([id]) => themes.some((theme) => theme.id === id)).map(([id, chipLabel]) => (
            <button key={id} type="button" className="setup-chip" onClick={() => onSelect(id)}>
              {chipLabel}
            </button>
          ))}
        </div>
      ) : null}
      {shortcuts}
      <p className={status === "exact" && !notice ? "sr-only" : "map-theme-status"} aria-live="polite" role="status">
        {label}
        {notice ? ` ${notice}` : ""}
      </p>
      <div className="map-theme-actions">
        <button type="button" onClick={onSave}>
          Save setup…
        </button>
        {/* Managing needs something to manage: until the reader has saved
            a setup of their own, Save is the only way in. */}
        {customThemes.length > 0 ? (
          <button type="button" onClick={onManage}>
            Manage themes
          </button>
        ) : null}
        {status === "modified" || status === "partial" ? (
          <button type="button" onClick={onReset}>
            Reset current theme
          </button>
        ) : null}
      </div>
    </section>
  );
}
