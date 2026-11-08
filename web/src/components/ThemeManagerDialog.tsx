import { useEffect, useRef, useState, type FormEvent } from "react";
import { useDialogChrome } from "./useDialogChrome";
import type { LayerCategoryId } from "../layers/layerCategories";
import type {
  CustomMapThemeDefinition,
  MapThemeDefinition,
} from "../themes/mapThemes";
import type { ThemeComparableState } from "../themes/themeState";

interface ThemeManagerDialogProps {
  themes: readonly MapThemeDefinition[];
  currentState: ThemeComparableState;
  preferredCategoryIds: readonly LayerCategoryId[];
  notice: string | null;
  /** A name built from the setup and the date, ready to overtype. */
  suggestedName?: string;
  /** Each of these answers false when the browser could not keep the change. */
  onSave: (name: string) => boolean | void;
  onRename: (themeId: string, name: string) => boolean | void;
  onUpdate: (
    themeId: string,
    state: ThemeComparableState,
    preferredCategoryIds: readonly LayerCategoryId[],
  ) => boolean | void;
  onDuplicate: (themeId: string) => boolean | void;
  onDelete: (themeId: string) => boolean | void;
  onClose: () => void;
}

interface ThemeManagerRowProps {
  theme: CustomMapThemeDefinition;
  currentState: ThemeComparableState;
  preferredCategoryIds: readonly LayerCategoryId[];
  deletePending: boolean;
  onRename: ThemeManagerDialogProps["onRename"];
  onUpdate: ThemeManagerDialogProps["onUpdate"];
  onDuplicate: ThemeManagerDialogProps["onDuplicate"];
  onRequestDelete: (themeId: string) => void;
  onCancelDelete: () => void;
  onDelete: ThemeManagerDialogProps["onDelete"];
}

function ThemeManagerRow({
  theme,
  currentState,
  preferredCategoryIds,
  deletePending,
  onRename,
  onUpdate,
  onDuplicate,
  onRequestDelete,
  onCancelDelete,
  onDelete,
}: ThemeManagerRowProps) {
  const [name, setName] = useState(theme.name);

  return (
    <li className="theme-manager-row" aria-label={`${theme.name} setup`}>
      <label>
        <span className="sr-only">Rename {theme.name}</span>
        <input
          value={name}
          aria-label={`Rename ${theme.name}`}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <div className="theme-manager-row-actions">
        <button
          type="button"
          disabled={!name.trim()}
          onClick={() => onRename(theme.id, name)}
        >
          Rename
        </button>
        <button
          type="button"
          onClick={() => onUpdate(
            theme.id,
            currentState,
            preferredCategoryIds,
          )}
        >
          Update from current setup
        </button>
        <button type="button" onClick={() => onDuplicate(theme.id)}>
          Duplicate
        </button>
        <button type="button" onClick={() => onRequestDelete(theme.id)}>
          Delete
        </button>
      </div>
      {deletePending ? (
        <div className="theme-manager-confirmation" role="group" aria-label={`Delete ${theme.name}`}>
          <p>Delete {theme.name}?</p>
          <button type="button" onClick={() => onDelete(theme.id)}>
            Confirm delete
          </button>
          <button type="button" onClick={onCancelDelete}>
            Keep setup
          </button>
        </div>
      ) : null}
    </li>
  );
}

/** What "Save current setup" stores, read from the same state it saves. */
function savePreview(state: ThemeComparableState): string {
  const layers = state.layerIds.length;
  const opacity = Object.keys(state.opacityOverrides).length;
  return [
    `${layers} ${layers === 1 ? "layer" : "layers"}`,
    ...(opacity > 0 ? [`${opacity} opacity ${opacity === 1 ? "setting" : "settings"}`] : []),
    state.taxSaleEnabled
      ? `tax sale on (${state.mapMode === "current" ? "current notices" : "historical records"})`
      : "tax sale off",
  ].join(" · ");
}

export function ThemeManagerDialog({
  themes,
  currentState,
  preferredCategoryIds,
  notice,
  suggestedName = "",
  onSave,
  onRename,
  onUpdate,
  onDuplicate,
  onDelete,
  onClose,
}: ThemeManagerDialogProps) {
  const [newThemeName, setNewThemeName] = useState(suggestedName);
  // The receipt says where the setup went, until the next change replaces it.
  const [receipt, setReceipt] = useState<string | null>(null);
  const keep = (result: boolean | void, message: string) => {
    setReceipt(result === false ? null : message);
    return result !== false;
  };
  const [deletePendingId, setDeletePendingId] = useState<string | null>(null);
  // The shared chrome captures the opener, moves focus in, keeps Tab inside
  // and gives focus back. This dialog did all of that except the Tab, so a
  // reader could walk out of it and into the map behind.
  const dialogRef = useDialogChrome<HTMLElement>(onClose);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const customThemes = themes.filter(
    (theme): theme is CustomMapThemeDefinition => theme.kind === "custom",
  );

  // The name field rather than the first control: this dialog is for making a
  // setup. The suggested name starts selected, so typing replaces it and one
  // tap on Save keeps it.
  useEffect(() => {
    nameInputRef.current?.focus();
    nameInputRef.current?.select();
  }, []);

  const submitCurrentSetup = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = newThemeName.trim();
    if (name && keep(onSave(name), `Saved “${name}” in this browser.`)) setNewThemeName("");
  };

  return (
    <div className="theme-manager-backdrop">
      <section
        ref={dialogRef}
        className="theme-manager-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="theme-manager-title"
      >
        <h2 id="theme-manager-title">My setups</h2>
        {notice ? (
          <p className="theme-manager-notice" role="status" aria-live="polite">
            {notice}
          </p>
        ) : null}
        {!notice && receipt ? (
          <p className="theme-manager-receipt" role="status" aria-live="polite">
            {receipt}
          </p>
        ) : null}
        <form id="theme-manager-save-form" className="theme-manager-save" onSubmit={submitCurrentSetup}>
          <label>
            Setup name
            <input
              ref={nameInputRef}
              value={newThemeName}
              onChange={(event) => setNewThemeName(event.target.value)}
            />
          </label>
          <small id="theme-manager-save-hint" className="theme-manager-hint">
            {newThemeName.trim() ? `Saves ${savePreview(currentState)}, in this browser only.` : "Name it to save it."}
          </small>
        </form>

        {customThemes.length > 0 ? (
          <ul className="theme-manager-list">
            {customThemes.map((theme) => (
              <ThemeManagerRow
                key={theme.id}
                theme={theme}
                currentState={currentState}
                preferredCategoryIds={preferredCategoryIds}
                deletePending={deletePendingId === theme.id}
                onRename={(themeId, name) => keep(onRename(themeId, name), `Renamed “${name.trim()}” in this browser.`)}
                onUpdate={(themeId, state, categories) => keep(onUpdate(themeId, state, categories), `Updated “${theme.name}” in this browser.`)}
                onDuplicate={(themeId) => keep(onDuplicate(themeId), `Copied “${theme.name}” in this browser.`)}
                onRequestDelete={setDeletePendingId}
                onCancelDelete={() => setDeletePendingId(null)}
                onDelete={(themeId) => {
                  keep(onDelete(themeId), `Deleted “${theme.name}” from this browser.`);
                  setDeletePendingId(null);
                }}
              />
            ))}
          </ul>
        ) : (
          <p className="theme-manager-empty">No saved setups yet. Saved setups appear here to rename, update, copy or delete.</p>
        )}

        {/* Save sits in the footer beside Done, so on a phone it stays in
            reach however long the list of saved setups grows. */}
        <div className="theme-manager-footer">
          <button type="submit" form="theme-manager-save-form" className="theme-manager-save-action" disabled={!newThemeName.trim()} aria-describedby="theme-manager-save-hint">
            Save current setup
          </button>
          <button type="button" onClick={onClose}>
            Done
          </button>
        </div>
      </section>
    </div>
  );
}
