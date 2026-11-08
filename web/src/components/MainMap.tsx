import { useState } from "react";
import { App } from "../App";

/**
 * The main map, remounted on the address it was just given, without a page
 * load. Only the first opening presents the licence strip by itself.
 */
export function MainMap() {
  const [opening, setOpening] = useState(0);
  return (
    <App
      key={opening}
      licencesPresented={opening > 0}
      onRestart={() => setOpening((value) => value + 1)}
    />
  );
}
