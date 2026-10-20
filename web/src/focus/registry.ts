import { fishingFocusDefinition } from "../fishing/focusDefinition";
import { pointTupperFocusDefinition } from "../pointtupper/focusDefinition";
import { rhodenaFocusDefinition } from "../rhodena/focusDefinition";
import type { FocusDefinition } from "./focusDefinition";

/**
 * Every focus page, by the id its HTML entry passes as `<App focus="..." />`.
 * Registering a page is one entry here plus its own definition module.
 */
export const focusDefinitions = {
  rhodena: rhodenaFocusDefinition,
  fishing: fishingFocusDefinition,
  pointtupper: pointTupperFocusDefinition,
} as const satisfies Readonly<Record<string, FocusDefinition>>;

export type FocusId = keyof typeof focusDefinitions;

/**
 * The focus page built on a setup. On the full map, opening that setup
 * (`?theme=`) or choosing it also uses the page's camera.
 */
export function focusForTheme(themeId: string | null | undefined): FocusDefinition | undefined {
  if (!themeId) return undefined;
  return Object.values(focusDefinitions).find((focus) => focus.themeId === themeId);
}
