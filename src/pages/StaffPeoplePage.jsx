import { useState } from "react";
import { api } from "../api/client";
import { FormDialog } from "../components/FormDialog";
import { WorkflowForm } from "../components/WorkflowForm";
import { useSuccessToast } from "../components/Toast";
import { DataTable, ErrorNotice, Field, LoadingState, PageHeading, Panel, Pager, useApiResource } from "../components/ui";

export default function StaffPeoplePage() {
  const [search, setSearch] = useState(""), [query, setQuery] = useState(""), [page, setPage] = useState(1);
  const people = useApiResource("people-directory-" + query + "-" + page, () => api("people", { query: { q: query || undefined, per_page: 20, page } }));
  const [person, setPerson] = useState(null), [values, setValues] = useState({ full_name: "", contact_details: "" }), [busy, setBusy] = useState(false), [error, setError] = useState(null);
  const notify = useSuccessToast();
  async function save(event) {
    event.preventDefault(); if (busy || person?.is_account_holder !== false) return;
    setBusy(true); setError(null);
    try {
      await api("people/" + person.person_id, { method: "PATCH", body: { full_name: values.full_name.trim(), contact_details: values.contact_details.trim() } });
      notify("Walk-in person corrected. Existing records keep the same person."); setPerson(null); people.reload();
    } catch (failure) { setError(failure); if (failure.status === 403 || failure.status === 409) people.reload(); }
    finally { setBusy(false); }
  }
  return <>
    <PageHeading eyebrow="REFERENCE DATA" title="People" description="Correct walk-in names and contact details without replacing their identity or historical records. Account holders manage their own profiles." />
    <Panel title="People directory">
      <form className="staff-filter-form" onSubmit={event => { event.preventDefault(); setQuery(search); setPage(1); }}><Field label="Search people" name="people-search"><input id="people-search" type="search" value={search} onChange={event => setSearch(event.target.value)} /></Field><button className="button button-secondary" type="submit">Search</button></form>
      {people.loading ? <LoadingState label="Loading people…" /> : people.error ? <ErrorNotice error={people.error} /> : <DataTable caption="People directory" rows={people.rows} rowKey={row => row.person_id} emptyTitle="No people found" emptyText="Try another search. New walk-in people can be added during staff intake." columns={[
        { key: "full_name", label: "Name" }, { key: "contact_details", label: "Contact details" },
        { key: "profile", label: "Profile", render: row => row.is_account_holder === false ? "Walk-in person" : "Account profile — owner-managed" },
        { key: "edit", label: "Correction", render: row => row.is_account_holder === false ? <button type="button" className="button button-secondary" aria-label={"Edit walk-in person " + row.full_name} onClick={() => { setError(null); setValues({ full_name: row.full_name, contact_details: row.contact_details || "" }); setPerson(row); }}>Correct details</button> : <span>Only the account holder can edit</span> },
      ]} />}
      {!people.loading && !people.error && <Pager page={people.page} onPage={setPage} />}
    </Panel>
    <FormDialog open={Boolean(person)} title="Correct walk-in person" description="This updates the existing person. Their claims and item history remain linked." discardLabel="Discard changes" onClose={() => { setPerson(null); setError(null); }}>
      <WorkflowForm onSubmit={save} error={error} busy={busy} failureTitle="Couldn't correct the person" fields={{ full_name: { id: "person-name", label: "Full name" }, contact_details: { id: "person-contact", label: "Contact details" } }} actions={<button className="button button-primary" type="submit" disabled={busy}>{busy ? "Saving correction…" : "Save correction"}</button>}>
        <Field label="Full name" name="person-name" error={error?.errors?.full_name}><input id="person-name" required maxLength={120} value={values.full_name} onChange={event => setValues({ ...values, full_name: event.target.value })} /></Field>
        <Field label="Contact details" name="person-contact" error={error?.errors?.contact_details}><input id="person-contact" required maxLength={200} value={values.contact_details} onChange={event => setValues({ ...values, contact_details: event.target.value })} /></Field>
      </WorkflowForm>
    </FormDialog>
  </>;
}
