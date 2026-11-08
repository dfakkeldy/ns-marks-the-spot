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
  /** What the map has on now, in plain words: the receipt for a change of setup. */
  layerSummary?: string;
}

const EXPLORE_THEME_ID = "explore-nova-scotia";

/** Line glyphs for the chips, on a 14-unit grid. Decoration: the word names the setup. */
const CHIP_GLYPHS: Readonly<Record<string, ReactNode>> = {
  // A calendar page.
  "tax-sale-research": <><rect x="2" y="3" width="10" height="9" rx="1" /><path d="M2 6h10M5 1.5v3M9 1.5v3" /></>,
  // A conifer.
  "forestry-field-access": <path d="M7 1.5 3.5 6H5.5L3 9.5h8L8.5 6h2zM7 9.5v3" />,
  // A folded sheet.
  "historical-maps": <path d="M2 3.5 5.5 2l3 1.5L12 2v8.5L8.5 12l-3-1.5L2 12zM5.5 2v8.5M8.5 3.5V12" />,
  // A rod and a hooked line.
  fishing: <path d="M2 12.5 10.5 2v6.5a1.5 1.5 0 1 1-3 0" />,
  // A ballot going into a box.
  "electoral-districts": <path d="M2 7.5h10V12H2zM5 7.5V2h4v5.5" />,
};

/**
 * The task setups Explore offers as one-tap chips, in this order, with the
 * short names a chip has room for. The full list stays in the select.
 */
const EXPLORE_SETUP_CHIPS: readonly (readonly [themeId: string, label: string])[] = [
  ["tax-sale-research", "Tax sale"],
  ["forestry-field-access", "Forestry"],
  ["historical-maps", "Historical"],
  ["fishing", "Fishing"],
  ["electoral-districts", "Electoral"],
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
  layerSummary,
}: MapThemePickerProps) {
  const active = themes.find(({ id }) => id === activeThemeId);
  const builtInThemes = themes.filter(({ kind }) => kind === "built-in");
  const customThemes = themes.filter(({ kind }) => kind === "custom");
  const explore = themes.find(({ id }) => id === EXPLORE_THEME_ID);
  const label = status === "modified"
    ? `${active?.name ?? "Shared setup"} — Modified`
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
          <optgroup label="Built-in setups">
            {builtInThemes.map((theme) => (
              <option key={theme.id} value={theme.id}>
                {theme.name}
              </option>
            ))}
          </optgroup>
          {customThemes.length > 0 ? (
            <optgroup label="My setups">
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
      {activeThemeId === EXPLORE_THEME_ID ? (
        <>
          {/* Says what a chip does: it goes somewhere, it does not switch on. */}
          <p className="setup-chips-lead">Open a setup for a task:</p>
          <div className="setup-chips setup-chips--go" role="group" aria-label="Start a task">
            {EXPLORE_SETUP_CHIPS.filter(([id]) => themes.some((theme) => theme.id === id)).map(([id, chipLabel]) => (
              <button
                key={id}
                type="button"
                className="setup-chip"
                title={`Open the ${themes.find((theme) => theme.id === id)?.name} setup`}
                onClick={() => onSelect(id)}
              >
                <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{CHIP_GLYPHS[id]}</svg>
                {chipLabel}
              </button>
            ))}
          </div>
        </>
      ) : null}
      {shortcuts}
      {layerSummary ? <p className="map-theme-receipt">{layerSummary}</p> : null}
      <p className={status === "exact" && !notice ? "sr-only" : undefined} aria-live="polite" role="status">
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
            My setups
          </button>
        ) : null}
        {status === "modified" || status === "partial" ? (
          <button type="button" onClick={onReset}>
            Reset setup
          </button>
        ) : null}
        {/* The chips live on Explore, so every other setup keeps one short way back. */}
        {explore && activeThemeId !== EXPLORE_THEME_ID ? (
          <button type="button" onClick={() => onSelect(EXPLORE_THEME_ID)}>
            Back to Explore
          </button>
        ) : null}
      </div>
    </section>
  );
}
