import { useState } from "react";
import { api } from "../api/client";
import { FormDialog } from "./FormDialog";
import { WorkflowField, WorkflowForm } from "./WorkflowForm";
import { useSuccessToast } from "./Toast";

export default function WalkInFinder({ onCreated }) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState({ full_name: "", contact_details: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const notify = useSuccessToast();
  function reset() { setOpen(false); setValues({ full_name: "", contact_details: "" }); setError(null); }
  async function save(event) {
    event.preventDefault(); if (busy) return; setBusy(true); setError(null);
    try {
      const response = await api("people", { method: "POST", body: values });
      onCreated(response.data); reset(); notify("Finder added and selected for intake.", "person-" + response.data.person_id);
    } catch (failure) { setError(failure); }
    finally { setBusy(false); }
  }
  return <>
    <button className="button button-secondary" type="button" onClick={() => setOpen(true)}>Add walk-in finder</button>
    <FormDialog open={open} discardLabel="Discard changes" title="Add walk-in finder" description="For a finder without an existing person record. This creates an intake contact, not a sign-in account." onClose={reset}>
      <WorkflowForm onSubmit={save} validationTitle="Check the form" failureTitle="Couldn't save the finder" error={error} busy={busy} fields={{ full_name: { id: "finder-name", label: "Full name" }, contact_details: { id: "finder-contact", label: "Contact details" } }} actions={<button className="button button-primary" type="submit" disabled={busy}>{busy ? "Saving finder…" : "Save finder"}</button>}>
        <WorkflowField label="Full name" name="finder-name" error={error?.errors?.full_name}><input id="finder-name" maxLength={120} autoComplete="off" required value={values.full_name} onChange={event => setValues({ ...values, full_name: event.target.value })} /></WorkflowField>
        <WorkflowField label="Contact details" name="finder-contact" error={error?.errors?.contact_details}><input id="finder-contact" maxLength={200} autoComplete="off" required value={values.contact_details} onChange={event => setValues({ ...values, contact_details: event.target.value })} /></WorkflowField>
      </WorkflowForm>
    </FormDialog>
  </>;
}
