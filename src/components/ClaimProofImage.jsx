import { useState } from "react";
import { ImagePreview } from "./Images";
import { FormDialog } from "./FormDialog";

export function ClaimProofImage({ hasImage, path, claimantName, modal = false }) {
  const [open, setOpen] = useState(false);
  if (!hasImage) return null;
  if (modal) return <div className="claim-proof-trigger">
    <button className="text-button" type="button" aria-haspopup="dialog" onClick={() => setOpen(true)}>View proof image</button>
    <FormDialog open={open} title="Proof image" closeLabel="Close proof image" className="claim-proof-dialog" description="Your private ownership proof." onClose={() => setOpen(false)}>
      <ImagePreview path={path} alt="Your private ownership proof" />
    </FormDialog>
  </div>;
  return <details className="claim-proof" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>View proof image{claimantName ? " for " + claimantName : ""}</summary>
    {open && <ImagePreview path={path} alt={claimantName ? "Private ownership proof from " + claimantName : "Your private ownership proof"} />}
  </details>;
}
