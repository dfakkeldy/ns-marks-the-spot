import "./SetupMapKey.css";

/**
 * One quiet line over the map about where this view came from. A plain visit
 * is offered the last view back; a link says it is a link, and always wins.
 * Neither counts down, returns uninvited or asks twice.
 */
export function ReturnNote({ kind, setupName, onReturn, onDismiss }: {
  kind: "offer" | "link";
  setupName: string;
  /** Absent on a link when this browser holds no earlier view to go back to. */
  onReturn?: () => void;
  onDismiss: () => void;
}) {
  return (
    <section className="return-note" aria-label={kind === "offer" ? "Your last view" : "Opened from a link"}>
      <p>{kind === "offer" ? <>Last visit: <strong>{setupName}</strong></> : <>Opened from a link: <strong>{setupName}</strong></>}</p>
      <div>
        {onReturn ? <button type="button" onClick={onReturn}>{kind === "offer" ? "Go back" : "Return to my map"}</button> : null}
        <button type="button" onClick={onDismiss}>{kind === "offer" ? "Start fresh" : "Keep this view"}</button>
      </div>
    </section>
  );
}
