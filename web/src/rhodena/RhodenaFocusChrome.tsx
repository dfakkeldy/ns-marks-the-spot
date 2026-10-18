import type { FocusChromeContext } from '../focus/focusDefinition';
import { RhodenaHero, TurbineGlyph } from './RhodenaHero';

/** The /rhodena summary: viewshed, viewpoint and zoom actions. */
export function RhodenaFocusHero({ contextLayers, setContextLayerVisibility, closeMobileControls, fitToFocus, startViewpointPick }: FocusChromeContext) {
  return (
    <RhodenaHero
      visibilityOn={contextLayers["rhodena-visibility"]}
      onToggleVisibility={() => {
        const visible = !contextLayers["rhodena-visibility"];
        setContextLayerVisibility("rhodena-visibility", visible);
        if (visible) closeMobileControls();
      }}
      onCheckViewpoint={() => {
        setContextLayerVisibility("rhodena-visibility", true);
        startViewpointPick();
        closeMobileControls();
      }}
      onFit={() => {
        fitToFocus();
        closeMobileControls();
      }}
    />
  );
}

export function RhodenaBrandMark() {
  return (
    <>
      <span aria-hidden="true"><TurbineGlyph /></span>
      <strong>Rhodena<span className="rhodena-brand-suffix"> Wind</span></strong>
    </>
  );
}

export function RhodenaFooterNote() {
  return (
    <p>
      A screening and research map, not legal proof. Each layer keeps
      its own source, date and caveats; an empty or failed layer is
      not evidence of absence.
    </p>
  );
}
