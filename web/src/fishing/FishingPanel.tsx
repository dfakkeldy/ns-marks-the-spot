import { useEffect, useMemo, useRef } from "react";
import type { FocusChromeContext } from "../focus/focusDefinition";
import { loadFishingData, useFishingData, type FishingData } from "./data";
import { describeFilters, filterSpots, filterSummary, hasActiveFilter, MONTH_NAMES, speciesOptions, spotMatches, type SpotFilters } from "./filters";
import { halifaxIsoDate } from "./rules";
import { SpeciesCalendar } from "./SpeciesCalendar";
import { SpotCard } from "./SpotCard";

const GROUP_LABELS = { saltwater: "Salt water", diadromous: "Sea-run and tidal", freshwater: "Fresh water", other: "Other" } as const;

/** The /fishing panel: month and species filters, the spot cards and the species calendar. */
export function FishingPanel(context: FocusChromeContext) {
  const state = useFishingData();
  return (
    <section className="rail-section fishing-panel" aria-labelledby="fishing-panel-heading">
      <h2 id="fishing-panel-heading">Spots</h2>
      {state.status === "loading" ? <p className="fishing-panel-status" role="status">Loading the spots…</p> : null}
      {state.status === "error" ? (
        <div className="fishing-panel-status" role="status">
          <p>The spot list could not be loaded. The map layers below still work.</p>
          <button type="button" className="fishing-clear-filters" onClick={() => { loadFishingData().catch(() => undefined); }}>
            Try again
          </button>
        </div>
      ) : null}
      {state.status === "ready" ? <FishingSpotList context={context} data={state.data} /> : null}
    </section>
  );
}

function FishingSpotList({ context, data }: { context: FocusChromeContext; data: FishingData }) {
  const { pageState, setPageState, closeMobileControls, contextLayers, setContextLayerVisibility } = context;
  const { spots, calendar, rules, rejectedSpots } = data;
  const filters: SpotFilters = { month: pageState.month, species: pageState.species };
  const shown = filterSpots(spots, filters);
  const options = useMemo(() => speciesOptions(spots, calendar), [spots, calendar]);
  const today = halifaxIsoDate();
  const currentMonth = new Date().getMonth() + 1;

  // A link's spot that does not exist, or that its own month leaves out, is
  // dropped rather than shown against the filter.
  const selected = pageState.spotId === null ? null : spots.find(({ id }) => id === pageState.spotId) ?? null;
  const selectedVisible = selected !== null && spotMatches(selected, filters);
  useEffect(() => {
    if (pageState.spotId !== null && !selectedVisible) setPageState({ spotId: null });
  }, [pageState.spotId, selectedVisible, setPageState]);
  // A species the spots no longer name cannot stay selected either.
  const speciesKnown = pageState.species === null || options.some(({ key }) => key === pageState.species);
  useEffect(() => {
    if (!speciesKnown) setPageState({ species: null });
  }, [speciesKnown, setPageState]);

  const setFilters = (next: Partial<SpotFilters>) => {
    const merged = { ...filters, ...next };
    setPageState({ ...next, spotId: selected && spotMatches(selected, merged) ? selected.id : null });
  };

  // Bring the selected card into view; when the map asked for it, also move
  // focus to it so the reader lands on what they opened.
  const lastPanelReveal = useRef(pageState.panelReveal);
  useEffect(() => {
    const revealed = lastPanelReveal.current !== pageState.panelReveal;
    lastPanelReveal.current = pageState.panelReveal;
    if (!pageState.spotId) return;
    const id = pageState.spotId;
    const frame = window.requestAnimationFrame(() => {
      const card = document.getElementById(`fishing-spot-${id}`);
      card?.scrollIntoView?.({ block: "nearest" });
      if (revealed) card?.querySelector<HTMLButtonElement>(".fishing-spot-toggle")?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pageState.spotId, pageState.panelReveal]);

  const groups = [...new Set(options.map(({ group }) => group))];
  const summary = filterSummary(shown.length, spots.length, filters, calendar);

  return (
    <>
      <div className="fishing-filters">
        <label>
          <span>Month</span>
          <select value={pageState.month ?? ""} onChange={(event) => setFilters({ month: event.target.value ? Number(event.target.value) : null })}>
            <option value="">Any month</option>
            {MONTH_NAMES.map((name, index) => (
              <option key={name} value={index + 1}>{name}{index + 1 === currentMonth ? " (now)" : ""}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Species</span>
          <select value={speciesKnown ? pageState.species ?? "" : ""} onChange={(event) => setFilters({ species: event.target.value || null })}>
            <option value="">Any species</option>
            {groups.map((group) => (
              <optgroup key={group} label={GROUP_LABELS[group]}>
                {options.filter((option) => option.group === group).map(({ key, label }) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
      </div>
      <div className="fishing-filter-result">
        <p role="status" aria-live="polite">{summary}</p>
        {hasActiveFilter(filters) ? (
          <button type="button" className="fishing-clear-filters" onClick={() => setPageState({ month: null, species: null })}>
            Clear filters
          </button>
        ) : null}
      </div>
      {rejectedSpots > 0 ? (
        <p className="fishing-rejected-note">
          {rejectedSpots === 1 ? "One spot record could not be read and is left out." : `${rejectedSpots} spot records could not be read and are left out.`}
        </p>
      ) : null}
      <p className="fishing-months-note">
        Months describe when fish are around and fishing is reported good. They are not open seasons:
        each card lists the rules to check.
      </p>
      {shown.length > 0 ? (
        <ol className="fishing-spot-list" aria-label="Curated fishing spots">
          {shown.map((spot) => (
            <SpotCard
              key={spot.id}
              spot={spot}
              selected={spot.id === pageState.spotId}
              calendar={calendar}
              rules={rules}
              today={today}
              month={pageState.month}
              onToggle={() => setPageState({ spotId: spot.id === pageState.spotId ? null : spot.id })}
              onShowOnMap={() => {
                // The reader may have turned the spots off; showing one turns them back on.
                if (!contextLayers["fishing-spots"]) setContextLayerVisibility("fishing-spots", true);
                setPageState({ spotId: spot.id, mapReveal: pageState.mapReveal + 1 });
                closeMobileControls();
              }}
            />
          ))}
        </ol>
      ) : spots.length === 0 ? (
        <div className="fishing-empty">
          <p>The spot file has no spots this page can show. The map layers below still work.</p>
        </div>
      ) : (
        <div className="fishing-empty">
          <p>
            None of the curated spots is listed for {describeFilters(filters, calendar)}. That is a gap in
            this short list, not evidence that no fish are there.
          </p>
          <button type="button" className="fishing-clear-filters" onClick={() => setPageState({ month: null, species: null })}>
            Clear filters
          </button>
        </div>
      )}
      <SpeciesCalendar calendar={calendar} rules={rules} today={today} month={pageState.month} />
    </>
  );
}
