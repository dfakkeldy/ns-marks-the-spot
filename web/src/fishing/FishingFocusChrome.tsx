import type { FocusChromeContext } from '../focus/focusDefinition';
import { FISHING_LICENCE_URL, useFishingData } from './data';
import { FishingHero } from './FishingHero';

/** The /fishing summary, wired to the page's month filter and the map. */
export function FishingFocusHero({ pageState, setPageState, fitToFocus, closeMobileControls }: FocusChromeContext) {
  const data = useFishingData();
  return (
    <FishingHero
      data={data}
      activeMonth={pageState.month}
      onShowMonth={(month) => setPageState({ month, spotId: null })}
      onFit={() => {
        fitToFocus();
        closeMobileControls();
      }}
    />
  );
}

export function FishingGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M3 12c3.2-4.4 8.8-5.6 13.2-2.4L20.5 7v10l-4.3-2.6C11.8 17.6 6.2 16.4 3 12Z" fill="currentColor" />
      <circle cx="8" cy="11" r="1.1" fill="#10313a" />
    </svg>
  );
}

export function FishingBrandMark() {
  return (
    <>
      <span aria-hidden="true"><FishingGlyph /></span>
      <strong>Fishing<span className="fishing-brand-suffix"> spots</span></strong>
    </>
  );
}

/** The page's note, then a link to the KinNoKi site's separate static fishing guide, which links back here. */
export function FishingFooterNote() {
  return (
    <>
      <p>
        Screening notes, not access permission or rules: each spot keeps its own sources, and a pin or a
        road is not a right of way. Spot text is the project&apos;s own under CC BY 4.0; positions and
        open-data facts are under the Nova Scotia and Canada open government licences
        (<a href={FISHING_LICENCE_URL} target="_blank" rel="noreferrer">licence notes</a>). An empty or
        failed layer is not evidence of absence.
      </p>
      <p>
        See also the <a href="https://kinnokilabs.com/fishing/">Strait and Bras d&apos;Or fishing map</a>, a separate guide.
      </p>
    </>
  );
}
