import { useDialogChrome } from "./useDialogChrome";

export function LicensingLockDialog({ reason, onClose, label = "Export georeferenced PDF" }: {
  reason: string; onClose: () => void; label?: string;
}) {
  const dialogRef = useDialogChrome<HTMLDivElement>(onClose);
  return <div className="export-dialog-backdrop" role="presentation">
    <div ref={dialogRef} className="export-dialog" role="dialog" aria-modal="true" aria-label={label} data-owns-escape="">
      <h2>Export locked</h2><p role="alert">{reason}</p>
      <button type="button" onClick={onClose}>Close export</button>
    </div>
  </div>;
}
