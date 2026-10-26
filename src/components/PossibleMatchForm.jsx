import { useState } from "react";
import { api, ApiError } from "../api/client";
import { useSuccessToast } from "./Toast";
import { FormDialog } from "./FormDialog";
import { EmptyState, ErrorNotice, Field, LoadingState, Pager, useApiResource } from "./ui";

export default function PossibleMatchForm({ reportId, onSent }) {
  const [open, setOpen] = useState(false);
  return <>
    <button className="button button-secondary" type="button" onClick={() => setOpen(true)}>Notify possible match</button>
    <FormDialog open={open} title="Notify a possible match" description="Select a published item for this report's owner to review. This does not confirm ownership, create a claim, resolve the report, or promise a return." onClose={() => setOpen(false)}>
      {open && <MatchSelection reportId={reportId} onSent={() => { setOpen(false); onSent(); }} />}
    </FormDialog>
  </>;
}

function MatchSelection({ reportId, onSent }) {
  const notify = useSuccessToast();
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [itemId, setItemId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const resource = useApiResource("possible-match-" + query + page, () => api("public/items", { query: { q: query, page, per_page: 20 } }));
  async function submit(event) {
    event.preventDefault(); if (busy || !itemId) return;
    setBusy(true); setError(null);
    try {
      const result = await api("staff/missing-reports/" + reportId + "/possible-matches", { method: "POST", body: { item_id: Number(itemId) } });
      if (result?.message !== "Possible-match notification recorded.") throw new ApiError("The notification could not be confirmed. Refresh the report before trying again.");
      notify("Possible-match notification recorded."); onSent();
    } catch (requestError) { setError(requestError); if (requestError.status === 409) { setItemId(""); resource.reload(); } }
    finally { setBusy(false); }
  }
  return <>
    <form className="staff-search-form" onSubmit={event => { event.preventDefault(); setQuery(search); setPage(1); setItemId(""); }}>
      <Field name="possible-match-search" label="Search published items"><input id="possible-match-search" type="search" maxLength="200" value={search} disabled={busy} onChange={event => setSearch(event.target.value)} /></Field>
      <button className="button button-secondary" type="submit" disabled={busy}>Search items</button>
    </form>
    <form onSubmit={submit} aria-busy={busy || undefined}>
      <ErrorNotice error={error} focus />
      {resource.loading ? <LoadingState label="Loading possible items…" /> : resource.error ? <ErrorNotice error={resource.error} /> : resource.rows.length ? <Field name="possible-match-item" label="Possible item" error={error?.errors?.item_id}>
        <select id="possible-match-item" required disabled={busy} value={itemId} onChange={event => setItemId(event.target.value)}><option value="">Select a published item</option>{resource.rows.map(item => <option key={item.item_id} value={item.item_id}>#{item.item_id} · {item.public_description}</option>)}</select>
      </Field> : <EmptyState title="No published items match">Try another search. Staff must receive and publish an item before suggesting it.</EmptyState>}
      {!resource.loading && !resource.error && <Pager page={resource.page} onPage={value => { if (!busy) { setPage(value); setItemId(""); } }} />}
      <div className="form-actions"><button className="button button-primary" type="submit" disabled={busy || resource.loading || Boolean(resource.error) || !itemId}>{busy ? "Recording notification…" : "Notify report owner"}</button></div>
    </form>
  </>;
}
