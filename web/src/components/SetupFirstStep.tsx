import "./SetupMapKey.css";
import type { ReactNode } from "react";

/**
 * A setup's one visible first step. An action when the task has one the data
 * supports; otherwise only the note that says what to do next.
 */
export function SetupFirstStep({ label, onClick, href, note }: {
  label?: string;
  onClick?: () => void;
  href?: string;
  note?: ReactNode;
}) {
  return (
    <div className="setup-step">
      {label && href ? <a className="setup-step-action" href={href}>{label}</a> : null}
      {label && !href ? <button type="button" className="setup-step-action" onClick={onClick}>{label}</button> : null}
      {note ? <p className="setup-step-note">{note}</p> : null}
    </div>
  );
}
