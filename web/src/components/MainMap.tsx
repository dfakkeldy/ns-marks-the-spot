import { useState } from "react";
import { App } from "../App";

/** The main map, remounted on the address it was just given, without a page load. */
export function MainMap() {
  const [opening, setOpening] = useState(0);
  return <App key={opening} onRestart={() => setOpening((value) => value + 1)} />;
}
