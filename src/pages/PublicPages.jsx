import { UserStatus } from "../components/UserStatus";
import { useSuccessToast } from "../components/Toast";
import { WorkflowField, WorkflowForm } from "../components/WorkflowForm";
import { PublicImages } from "../components/Images";
import { DraftImage } from "../components/DraftImage";
import { ClaimProofImage } from "../components/ClaimProofImage";
import { submitOwnershipClaim } from "../api/claimProof";
import { FormDialog } from "../components/FormDialog";
import { authPath } from "../auth/returnPath";
const browseFields = { q: { id: "browse-query", label: "Search item summaries" }, category_id: { id: "browse-category", label: "Category" }, received_from: { id: "received-from", label: "Received from" }, received_to: { id: "received-to", label: "Received through" } };
import { PublicCategorySelect } from "../components/PublicCategories";
import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { EmptyState, ErrorNotice, Field, LoadingState, PageHeading, Panel, formatDate, useApiResource } from "../components/ui";
import "./PublicPages.css";
import { ItemGlyph, PublicItemCard } from "../components/PublicItemCard";

export function PublicBrowsePage() {
  const { session } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryKey = searchParams.toString();
  const query = Object.fromEntries(searchParams.entries());
  const [filters, setFilters] = useState({ q: query.q || "", category_id: query.category_id || "", received_from: query.received_from || "", received_to: query.received_to || "" });
  const { loading, error, rows, page, reload } = useApiResource("public-items-" + queryKey, () => api("public/items", { query: { ...query, per_page: 20 } }));

  useEffect(() => {
    const current = Object.fromEntries(searchParams.entries());
    setFilters({ q: current.q || "", category_id: current.category_id || "", received_from: current.received_from || "", received_to: current.received_to || "" });
  }, [queryKey]);

  const hasFilters = Boolean(query.q || query.category_id || query.received_from || query.received_to);
  function clearFilters() {
    setFilters({ q: "", category_id: "", received_from: "", received_to: "" });
    setSearchParams({});
  }

  function search(event) {
    event.preventDefault();
    const next = {};
    Object.entries(filters).forEach(([key, value]) => { if (value) next[key] = value; });
    next.page = "1";
    setSearchParams(next);
  }

  return <div className="public-browse">
    <PageHeading title="Browse found items" description="Lost something? Look through items received by Reclaim. Open an item to see its details and send a private ownership claim." />
    {session?.role !== "staff" && <section className="browse-next-steps" aria-label="Report an item">
      <div><strong>Can't find your item?</strong><p>Report it missing so staff know what you are looking for.</p><Link to="/my/missing-reports">Report missing item</Link></div>
      <div><strong>Found someone else's belongings?</strong><p>Send a private report, then arrange handover with staff.</p><Link to="/my/finder-reports">Report found item</Link></div>
    </section>}
    <form className="browse-filters" aria-label="Search found items" onSubmit={search}>
      <Field label="Search item summaries" name="browse-query" error={error?.errors?.q}><span className="search-input-wrap"><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5" /></svg><input id="browse-query" type="search" placeholder="Search by item description…" value={filters.q} onChange={(event) => setFilters({ ...filters, q: event.target.value })} /></span></Field>
      <PublicCategorySelect id="browse-category" label="Category" error={error?.errors?.category_id} all value={filters.category_id} onChange={(event) => setFilters({ ...filters, category_id: event.target.value })} />
      <Field label="Received from" name="received-from" error={error?.errors?.received_from}><input id="received-from" type="date" value={filters.received_from} onChange={(event) => setFilters({ ...filters, received_from: event.target.value })} /></Field>
      <Field label="Received through" name="received-to" error={error?.errors?.received_to}><input id="received-to" type="date" value={filters.received_to} onChange={(event) => setFilters({ ...filters, received_to: event.target.value })} /></Field>
      <button className="button button-primary browse-search" type="submit">Search items</button>
    </form>
    <div className="browse-columns">
      <Panel className="browse-results-panel" title="Available listings" description="Only items received and published by staff appear here. Exact locations and identifying details stay private." action={<div className="browse-result-actions">{hasFilters && <button className="text-button" type="button" onClick={clearFilters}>Clear filters</button>}<span className="results-count" role="status" aria-atomic="true">{!loading && !error ? page.total + (page.total === 1 ? " item" : " items") : ""}</span></div>}>
        {loading ? <LoadingState label="Searching found items…" /> : error ? <><ErrorNotice error={error} retry={false} fields={browseFields} focus={error.status === 422} title={error.status === 422 ? "Check your search filters" : "Found items could not be loaded"} /><p className="muted-copy">{error.status === 422 ? "Choose a valid category and date range, or clear the filters." : "Check your connection, then retry. Your filters have been kept."}</p><button className="button button-secondary" type="button" onClick={reload}>Retry listings</button></> : rows.length ? <div className="public-item-grid">{rows.map((item) => <PublicItemCard key={item.item_id} item={item} />)}</div> : <EmptyState title={hasFilters ? "No public items match" : "No found items are listed yet"} action={hasFilters ? <button className="button button-secondary" type="button" onClick={clearFilters}>Clear filters</button> : session?.role !== "staff" ? <Link className="button button-primary" to="/my/missing-reports">Report missing item</Link> : null}>{hasFilters ? "Try fewer words or clear the filters. If your item isn't listed, you can report it missing." : "Staff publish items after receiving them. If you lost something, send a missing-item report and check back here."}</EmptyState>}
        {!loading && !error && page.lastPage > 1 && <nav className="pager" aria-label="Public item pagination"><button type="button" className="button button-secondary button-small" disabled={page.currentPage <= 1} onClick={() => setSearchParams({ ...query, page: String(page.currentPage - 1) })}>Previous</button><span>Page {page.currentPage} of {page.lastPage}</span><button type="button" className="button button-secondary button-small" disabled={page.currentPage >= page.lastPage} onClick={() => setSearchParams({ ...query, page: String(page.currentPage + 1) })}>Next</button></nav>}
      </Panel>
    </div>
  </div>;
}

export function PublicItemPage() {
  const { itemId } = useParams();
  const { session, checkingSession, sessionError, retrySession } = useAuth();
  const { loading, error, payload } = useApiResource("public-item-" + itemId, () => api("public/items/" + itemId));
  const item = payload?.data;
  const claimKey = "claim-" + session?.identity?.person_id + "-" + itemId;
  const claimState = useApiResource(claimKey, async () => {
    if (session?.role !== "user" || !session.identity?.email_verified) return { data: null };
    try { return await api("my/claims/" + itemId); }
    catch (requestError) { if (requestError.status === 404) return { data: null }; throw requestError; }
  });
  const [evidence, setEvidence] = useState("");
  const [proofImage, setProofImage] = useState(null);
  const [mutationError, setMutationError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(null);
  const [claimOpen, setClaimOpen] = useState(false);
  const notify = useSuccessToast();

  async function submitClaim(event) {
    event.preventDefault(); if (submitting) return; setSubmitting(true); setMutationError(null); setSuccess(null);
    try {
      const response = await submitOwnershipClaim(itemId, evidence, proofImage);
      setSuccess(response?.data || response);
      notify("Claim submitted.", "claim-" + itemId);
      setEvidence("");
      setProofImage(null);
      setClaimOpen(false);
      claimState.reload();
    } catch (requestError) { setMutationError(requestError); }
    finally { setSubmitting(false); }
  }

  if (loading) return <LoadingState label="Loading public item…" />;
  if (error) return <div className="item-error"><ErrorNotice error={error} title={error.status === 404 ? "This listing is no longer available" : "Item details could not be loaded"} /><Link className="button button-secondary" to="/">Back to browse</Link></div>;
  const existingClaim = claimState.payload?.data;
  return <><Link className="back-link" to="/">← Back to found items</Link><PageHeading eyebrow="LOST & FOUND" title={item.public_description} description="Public item listing" /><div className="public-detail-layout">
    <div><div className="public-detail-card panel"><div className="detail-art"><PublicImages item={item} fallback={<ItemGlyph category={item.category_name} />} /></div><div className="detail-public-copy"><h2>Item details</h2><span className="category-pill">{item.category_name}</span><dl className="detail-list"><div><dt>Category</dt><dd>{item.category_name}</dd></div><div><dt>Found</dt><dd>{formatDate(item.found_at)}</dd></div><div><dt>Received by Reclaim</dt><dd>{formatDate(item.received_at)}</dd></div><div><dt>Reference</dt><dd>#{item.item_id}</dd></div></dl><p className="privacy-note">This public view omits finder contact details, exact locations, evidence, and storage information.</p></div></div></div>
    <aside className="claim-form-column"><Panel title="Think this may be yours?" description="Tell our staff what identifying details can confirm ownership.">
      {claimState.loading && session?.role === "user" ? <LoadingState label="Checking your claim…" /> : null}
      <ErrorNotice error={claimState.error} retry={false} title="Your claim status could not be checked" />
      {claimState.error && <button className="button button-secondary" type="button" onClick={claimState.reload}>Retry claim status</button>}
      {existingClaim ? <div className="existing-claim"><p>You already have a claim for this item.</p><UserStatus kind="claim" value={existingClaim.outcome} /><p className="muted-copy">Submitted {formatDate(existingClaim.submitted_at)}.</p><Link to="/my/claims">Open My Claims</Link><ClaimProofImage modal key={itemId} hasImage={existingClaim.has_proof_image} path={"my/claims/" + itemId + "/proof-image"} /></div> : null}
      {success && !existingClaim && <UserStatus kind="claim" value={success.outcome} />}
      {!session && !checkingSession && !sessionError && <div className="claim-auth-prompt"><p>Sign in with a verified Reclaim account to submit an ownership claim.</p><Link className="button button-primary" to={authPath("/login", "/items/" + itemId)}>Sign in to claim</Link></div>}
      {checkingSession && <p className="muted-copy" role="status">Checking your sign-in status before enabling claims.</p>}
      {sessionError && <div className="claim-auth-prompt"><p>We could not confirm your sign-in status. Retry before submitting a claim.</p><button className="button button-secondary" type="button" onClick={retrySession}>Retry session check</button></div>}
      {session?.role === "user" && !session.identity?.email_verified && <div className="claim-auth-prompt"><p>Verify your email before submitting a claim.</p><Link className="button button-primary" to={authPath("/verify-email", "/items/" + itemId)}>Verify email</Link></div>}
      {session?.role === "user" && session.identity?.email_verified && <><button className="button button-primary" type="button" disabled={claimState.loading || Boolean(claimState.error)} aria-disabled={Boolean(existingClaim || success || claimState.loading || claimState.error)} onClick={() => { if (!existingClaim && !success && !claimState.loading && !claimState.error) setClaimOpen(true); }}>{existingClaim || success ? "Ownership claim submitted" : "Submit ownership claim"}</button><FormDialog discardLabel="Discard changes" open={claimOpen && !existingClaim && !success} title="Submit an ownership claim" description="Evidence stays private to you and authorized staff." onClose={() => { setClaimOpen(false); setEvidence(""); setProofImage(null); setMutationError(null); }}><WorkflowForm validationTitle="Check the form" failureTitle="Couldn't submit your claim" onSubmit={submitClaim} busy={submitting} error={mutationError} fields={{ evidence_text: { id: "evidence_text", label: "Evidence of ownership" }, image: { id: "claim-proof-image", label: "Proof image" } }} actions={<button className="button button-primary" type="submit" disabled={submitting || claimState.loading || Boolean(claimState.error) || !evidence.trim()}>{submitting ? proofImage ? "Uploading proof and submitting claim…" : "Submitting claim…" : "Submit ownership claim"}</button>}><WorkflowField label="Evidence of ownership" name="evidence_text" error={mutationError?.errors?.evidence_text} hint="Describe private details that help staff confirm the item."><textarea id="evidence_text" maxLength="16000" rows="6" value={evidence} onChange={(event) => setEvidence(event.target.value)} required /></WorkflowField><DraftImage label="Proof image" id="claim-proof-image" draft={{ file: proofImage, setFile: setProofImage }} onChange={() => setMutationError(null)} busy={submitting} error={mutationError} /></WorkflowForm></FormDialog></>}
      {session?.role === "staff" && <p className="muted-copy">Sign in with a community account to submit an ownership claim.</p>}
    </Panel></aside>
  </div></>;
}
