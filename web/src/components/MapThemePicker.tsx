import type { Ref } from "react";
import type { MapThemeDefinition } from "../themes/mapThemes";

export type MapThemeStatus = "exact" | "modified" | "shared" | "partial";

interface MapThemePickerProps {
  themes: readonly MapThemeDefinition[];
  activeThemeId: string | null;
  status: MapThemeStatus;
  notice: string | null;
  selectRef?: Ref<HTMLSelectElement>;
  onSelect: (themeId: string) => void;
  onReset: () => void;
}

export function MapThemePicker({
  themes,
  activeThemeId,
  status,
  notice,
  selectRef,
  onSelect,
  onReset,
}: MapThemePickerProps) {
  const active = themes.find(({ id }) => id === activeThemeId);
  const label = status === "modified"
    ? `${active?.name ?? "Shared setup"} — Modified`
    : status === "partial"
      ? `${active?.name ?? "Shared setup"} — Partially applied`
      : active?.name ?? "Shared setup";

  return (
    <section className="map-theme-picker">
      <h2 id="map-setup-heading">Map setup</h2>
      <label>
        <span className="sr-only">Map setup</span>
        <select
          ref={selectRef}
          value={activeThemeId ?? "shared"}
          onChange={(event) => onSelect(event.target.value)}
        >
          {activeThemeId === null ? (
            <option value="shared">Shared setup</option>
          ) : null}
          {themes.map((theme) => (
            <option key={theme.id} value={theme.id}>
              {theme.name}
            </option>
          ))}
        </select>
      </label>
      <p className="map-theme-description">
        {active?.description ?? "Map settings restored from a shared link."}
      </p>
      <p aria-live="polite" role="status">
        {label}
        {notice ? ` ${notice}` : ""}
      </p>
      {status === "modified" || status === "partial" ? (
        <button type="button" onClick={onReset}>
          Reset current setup
        </button>
      ) : null}
    </section>
  );
}
