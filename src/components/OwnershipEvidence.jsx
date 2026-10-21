import { useState } from "react";
import { FormDialog } from "./FormDialog";
import { ImagePreview } from "./Images";

export default function OwnershipEvidence({ claim, item = claim.item }) {
  const [open, setOpen] = useState(false);
  const claimantName = claim.claimant?.full_name || "Name unavailable";
  return <div className="staff-evidence-control">
    <button className="text-button" type="button" aria-haspopup="dialog" onClick={() => setOpen(true)}>View claim evidence</button>
    <FormDialog open={open} title="Claim evidence" closeLabel="Close claim evidence" className="staff-claim-evidence-dialog" onClose={() => setOpen(false)}>
      <dl className="detail-list">
        <div><dt>Claimant</dt><dd>{claimantName}</dd></div>
        <div><dt>Item</dt><dd>{item?.item_description || ("Item #" + claim.item_id)}</dd></div>
        {claim.claimant?.contact_details && <div><dt>Claimant contact</dt><dd>{claim.claimant.contact_details}</dd></div>}
      </dl>
      <h3>Written evidence</h3>
      <p className="staff-claim-written-evidence">{claim.evidence_text}</p>
      {claim.has_proof_image && <section aria-label="Proof image">
        <h3>Proof image</h3>
        <ImagePreview path={"items/" + claim.item_id + "/claims/" + claim.claimant_id + "/proof-image"} alt={"Private ownership proof from " + claimantName} />
      </section>}
    </FormDialog>
  </div>;
}
