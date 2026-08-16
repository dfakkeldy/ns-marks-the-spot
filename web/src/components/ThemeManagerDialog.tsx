import { useEffect, useRef, useState, type FormEvent } from "react";
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
  onSave: (name: string) => void;
  onRename: (themeId: string, name: string) => void;
  onUpdate: (
    themeId: string,
    state: ThemeComparableState,
    preferredCategoryIds: readonly LayerCategoryId[],
  ) => void;
  onDuplicate: (themeId: string) => void;
  onDelete: (themeId: string) => void;
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
    <li className="theme-manager-row" aria-label={`${theme.name} theme`}>
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
            Keep theme
          </button>
        </div>
      ) : null}
    </li>
  );
}

export function ThemeManagerDialog({
  themes,
  currentState,
  preferredCategoryIds,
  notice,
  onSave,
  onRename,
  onUpdate,
  onDuplicate,
  onDelete,
  onClose,
}: ThemeManagerDialogProps) {
  const [newThemeName, setNewThemeName] = useState("");
  const [deletePendingId, setDeletePendingId] = useState<string | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const customThemes = themes.filter(
    (theme): theme is CustomMapThemeDefinition => theme.kind === "custom",
  );

  useEffect(() => {
    returnFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    nameInputRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      returnFocusRef.current?.focus();
    };
  }, [onClose]);

  const submitCurrentSetup = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = newThemeName.trim();
    if (name) onSave(name);
  };

  return (
    <div className="theme-manager-backdrop">
      <section
        className="theme-manager-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="theme-manager-title"
      >
        <h2 id="theme-manager-title">My map themes</h2>
        {notice ? (
          <p className="theme-manager-notice" role="status" aria-live="polite">
            {notice}
          </p>
        ) : null}
        <form className="theme-manager-save" onSubmit={submitCurrentSetup}>
          <label>
            Theme name
            <input
              ref={nameInputRef}
              value={newThemeName}
              onChange={(event) => setNewThemeName(event.target.value)}
            />
          </label>
          <button type="submit" disabled={!newThemeName.trim()}>
            Save current setup
          </button>
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
                onRename={onRename}
                onUpdate={onUpdate}
                onDuplicate={onDuplicate}
                onRequestDelete={setDeletePendingId}
                onCancelDelete={() => setDeletePendingId(null)}
                onDelete={(themeId) => {
                  onDelete(themeId);
                  setDeletePendingId(null);
                }}
              />
            ))}
          </ul>
        ) : (
          <p className="theme-manager-empty">No custom themes saved.</p>
        )}

        <div className="theme-manager-footer">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </section>
    </div>
  );
}
