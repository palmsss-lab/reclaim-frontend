import { useState } from "react";
import { api } from "../api/client";
import { FormDialog } from "./FormDialog";
import { Field } from "./ui";
import { WorkflowForm } from "./WorkflowForm";
import { useSuccessToast } from "./Toast";
import ReferenceSelect, { referenceReady, useReferenceList } from "./ReferenceSelect";

export default function WalkInClaim({ itemId, disabled, onCreated }) {
  const people = useReferenceList("people");
  const notify = useSuccessToast();
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(null);
  const [claimant, setClaimant] = useState(""), [evidence, setEvidence] = useState("");
  async function submit(event) {
    event.preventDefault();
    if (busy || !referenceReady(people) || !evidence.trim() || !people.rows.some(row => String(row.person_id) === claimant && row.is_account_holder === false)) return;
    setBusy(true); setError(null);
    try {
      const response = await api("items/" + itemId + "/claims", { method: "POST", body: { claimant_id: Number(claimant), evidence_text: evidence.trim() } });
      const claim = response?.data;
      if (claim?.outcome !== "PENDING" || Number(claim.item_id) !== Number(itemId) || Number(claim.claimant_id) !== Number(claimant) || claim.reviewed_at !== null || claim.reviewed_by !== null) throw new Error("The pending claim could not be confirmed.");
      notify("Walk-in claim recorded. Ownership still requires verification."); setOpen(false); setClaimant(""); setEvidence(""); onCreated();
    } catch (failure) { setError(failure); if (failure.status === 409) onCreated(); }
    finally { setBusy(false); }
  }
  return <>
    <button type="button" className="button button-secondary" disabled={disabled} onClick={() => setOpen(true)}>Record walk-in claim</button>
    <FormDialog open={open} title="Record walk-in claim" description="Record an existing walk-in person's ownership evidence. Account holders must submit their own claims. Recording a claim does not verify ownership or record physical return." discardLabel="Discard changes" onClose={() => { setOpen(false); setError(null); setClaimant(""); setEvidence(""); }}>
      <WorkflowForm onSubmit={submit} busy={busy} error={error} failureTitle="Couldn't record the claim" fields={{ claimant_id: { id: "walk-in-claimant", label: "Walk-in claimant" }, evidence_text: { id: "walk-in-evidence", label: "Ownership evidence" } }} actions={<button type="submit" className="button button-primary" disabled={busy || !referenceReady(people) || !evidence.trim()}>{busy ? "Recording claim…" : "Record pending claim"}</button>}>
        <ReferenceSelect resource={people} label="Walk-in claimant" id="walk-in-claimant" value={claimant} onChange={event => setClaimant(event.target.value)} rowKey="person_id" disableOption={row => row.is_account_holder !== false} optionLabel={row => row.full_name + " · " + row.contact_details + (row.is_account_holder ? " (account holder)" : "")} placeholder="Select an existing walk-in person" emptyText="No people are available. Use Add walk-in finder on the staff intake page to create a person first." />
        <Field label="Ownership evidence" name="walk-in-evidence" error={error?.errors?.evidence_text}><textarea id="walk-in-evidence" required maxLength={16000} value={evidence} onChange={event => setEvidence(event.target.value)} /></Field>
      </WorkflowForm>
    </FormDialog>
  </>;
}
