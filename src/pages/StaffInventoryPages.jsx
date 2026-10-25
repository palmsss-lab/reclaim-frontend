import ReferenceSelect, { referenceReady, useReferenceList } from "../components/ReferenceSelect";
import WalkInClaim from "../components/WalkInClaim";
import StaffStatus from "../components/StaffStatus";
import { useSuccessToast } from "../components/Toast";
import { useConfirm } from "../components/Confirmation";
import { ImageManager } from "../components/Images";
import { FormDialog } from "../components/FormDialog";
import OwnershipEvidence from "../components/OwnershipEvidence";
import { useEffect, useRef, useState } from "react";
import { StatusTabs } from "../components/StatusTabs";
import { statusPages } from "../api/statusPages";
import { Link, useLocation, useParams, useSearchParams } from "react-router";
import { api, pageInfo } from "../api/client";
import { DataTable, EmptyState, ErrorNotice, Field, LoadingState, PageHeading, Panel, Pager, formatDate, useApiResource } from "../components/ui";
import "./StaffInventoryPages.css";
import { reviewContext } from "../navigation/reviewContext";


export function ItemListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const status = searchParams.get("status") === "returned" ? "returned" : "stored";
  const pageNumber = Math.max(1, Number(searchParams.get("page")) || 1);
  const fields = ["q", "category_id", "location_id", "received_from", "received_to"];
  const applied = Object.fromEntries(fields.map(key => [key, searchParams.get(key) || ""]));
  const [filters, setFilters] = useState(applied);
  const searchKey = searchParams.toString();
  const filtersActive = fields.some(key => Boolean(applied[key]));
  useEffect(() => { setFilters(Object.fromEntries(fields.map(key => [key, searchParams.get(key) || ""]))); }, [searchKey]);
  function setPageNumber(page) { setSearchParams({ ...applied, status, page: String(page) }); }
  const categories = useReferenceList("categories");
  const locations = useReferenceList("storage-locations");
  const resource = useApiResource("staff-items-" + searchKey, () => statusPages("items", {
    query: { ...applied, location_scope: "history" }, statuses: ["stored", "returned"], active: status, page: pageNumber,
  }));

  return <>
    <PageHeading eyebrow="INVENTORY" title="Found items" description="Search stored and returned items using staff-only item details, location filters, and receipt dates." action={<Link className="button button-primary" to="/staff/items/new">Receive an item</Link>} />
    <Panel className="inventory-panel" title="Item inventory">
      <StatusTabs label="Item classification" options={[{ value: "stored", label: "In storage" }, { value: "returned", label: "Returned" }]} value={status} counts={resource.payload?.tabCounts} onChange={value => setSearchParams({ ...applied, status: value, page: "1" })}>
      <p className="muted-copy">Items remain in storage until staff completes a return, including items with pending or rejected claims. Counts include all items matching these filters.</p>
      <form className="inventory-filter-form" aria-describedby="inventory-filter-help" onSubmit={(event) => { event.preventDefault(); setSearchParams({ ...filters, status, page: "1" }); }}>
        <Field label="Search items" name="item-search" error={resource.error?.errors?.q}><input id="item-search" type="search" placeholder="Item description…" value={filters.q} onChange={(event) => setFilters({ ...filters, q: event.target.value })} /></Field>
        <ReferenceSelect resource={categories} required={false} label="Category" id="item-category" value={filters.category_id} onChange={event => setFilters({ ...filters, category_id: event.target.value })} fieldError={resource.error?.errors?.category_id} rowKey="category_id" optionLabel={row => row.category_name} placeholder="All categories" emptyText="No categories are available." />
        <ReferenceSelect resource={locations} required={false} label="Storage location" id="item-location" value={filters.location_id} onChange={event => setFilters({ ...filters, location_id: event.target.value })} fieldError={resource.error?.errors?.location_id} rowKey="location_id" optionLabel={row => row.location_code} placeholder="All locations" emptyText="No storage locations are available." />
        <Field label="Received from" name="item-received-from" error={resource.error?.errors?.received_from}><input id="item-received-from" type="date" value={filters.received_from} onChange={(event) => setFilters({ ...filters, received_from: event.target.value })} /></Field>
        <Field label="Received through" name="item-received-to" error={resource.error?.errors?.received_to}><input id="item-received-to" type="date" value={filters.received_to} onChange={(event) => setFilters({ ...filters, received_to: event.target.value })} /></Field>
        <button className="button button-secondary" type="submit">Apply filters</button>
      </form>
      <p id="inventory-filter-help" className="inventory-filter-help">Storage location matches current and previous placements. Receipt dates include both endpoints.</p>
      <p className="inventory-table-hint">Item details and actions stack into labeled cards when space is limited.</p>

      {resource.loading ? <LoadingState label="Loading item inventory…" /> : resource.error ? <ErrorNotice error={resource.error} fields={{ q: { id: "item-search", label: "Search items" }, category_id: { id: "item-category", label: "Category" }, location_id: { id: "item-location", label: "Storage location" }, received_from: { id: "item-received-from", label: "Received from" }, received_to: { id: "item-received-to", label: "Received through" } }} focus={resource.error.status === 422} /> : <DataTable caption="Staff item inventory" rows={resource.rows} rowKey={(row) => row.item_id} emptyTitle={filtersActive ? "No items match" : status === "returned" ? "No returned items yet" : "No items in storage"} emptyText={filtersActive ? "Try a different search or clear the filters." : status === "returned" ? "Items appear here after staff completes a return." : "Received items will appear here while they are in storage."} emptyAction={filtersActive ? <button type="button" className="button button-secondary" onClick={() => setSearchParams({ status, page: "1" })}>Clear filters</button> : undefined} columns={[
        { key: "item_description", label: "Item", render: (row) => <strong>{row.item_description}</strong> },
        { key: "category_name", label: "Category" },
        { key: "found_place", label: "Found place" },
        { key: "received_at", label: "Received", render: (row) => formatDate(row.received_at) },
        { key: "current_location_code", label: "Current storage", render: (row) => row.current_location_code || "No open assignment" },
        { key: "details", label: "Open item", render: (row) => <Link to={"/staff/items/" + row.item_id} state={{ inventorySearch: searchKey }}>Open item</Link> },
      ]} />}
      {!resource.loading && !resource.error && <Pager page={resource.page} onPage={setPageNumber} />}
      </StatusTabs>
    </Panel>
  </>;
}

export function ItemDetailPage() {
  const notify = useSuccessToast();
  const confirm = useConfirm();
  const { itemId } = useParams();
  const navigation = useLocation();
  const inventoryUrl = "/staff/items" + (navigation.state?.inventorySearch ? "?" + navigation.state.inventorySearch : "");
  const back = reviewContext(navigation.state?.reviewFrom, inventoryUrl);
  const [detailParams, setDetailParams] = useSearchParams();
  const claimsPage = Math.max(1, Number(detailParams.get("claims_page")) || 1);
  const historyPage = Math.max(1, Number(detailParams.get("history_page")) || 1);
  const selectedClaimant = /^[1-9]\d*$/.test(detailParams.get("claimant") || "") ? detailParams.get("claimant") : "";
  const focusedSelection = useRef("");
  const locateSelected = Boolean(selectedClaimant && !detailParams.has("claims_page"));
  function changeDetailPage(key, page) { setDetailParams(current => { const next = new URLSearchParams(current); next.set(key, String(page)); return next; }, { state: navigation.state }); }

  const [transferLocation, setTransferLocation] = useState("");
  const [publicDescription, setPublicDescription] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [busyAction, setBusyAction] = useState("");
  const [publishOpen, setPublishOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const locations = useReferenceList("storage-locations");
  const resource = useApiResource("staff-item-detail-" + itemId, async () => {
    const itemResponse = await api("items/" + itemId);
    const listing = await api("public/items/" + itemId).catch((error) => { if (error.status === 404) return null; throw error; });
    return { item: itemResponse?.data || itemResponse, listing: listing?.data || null };
  }, true);
  const data = resource.payload;
  const item = data?.item;
  const listing = data?.listing;
  const claimsResource = useApiResource("item-claims-" + itemId + "-" + claimsPage + "-" + (locateSelected ? selectedClaimant : ""), async () => {
    let page = claimsPage;
    let result = await api("items/" + itemId + "/claims", { query: { per_page: 20, page } });
    // The API has no claimant filter. Follow its real pages when a queue selects an older claim.
    while (locateSelected && !result.data?.some(claim => String(claim.claimant_id) === selectedClaimant) && page < pageInfo(result).lastPage) {
      result = await api("items/" + itemId + "/claims", { query: { per_page: 20, page: ++page } });
    }
    return result;
  }, true);
  const historyResource = useApiResource("item-history-" + itemId + "-" + historyPage, () => api("items/" + itemId + "/storage-history", { query: { per_page: 20, page: historyPage } }), true);
  const activeClaims = claimsResource.rows;
  useEffect(() => {
    const key = itemId + "-" + selectedClaimant;
    if (!selectedClaimant) focusedSelection.current = "";
    if (selectedClaimant && !resource.loading && !claimsResource.loading && focusedSelection.current !== key) {
      const row = document.getElementById("claim-" + key);
      if (row) { row.focus(); focusedSelection.current = key; }
    }
  }, [selectedClaimant, itemId, resource.loading, claimsResource.loading, claimsResource.payload]);

  async function runAction(action, request, message) {
    if (busyAction) return;
    setBusyAction(action); setActionError(null);
    try { await request(); notify(action === "transfer" ? "Storage assignment created." : action === "publish" ? "Item listing published." : message); resource.reload(); claimsResource.reload(); historyResource.reload(); return true; }
    catch (error) { setActionError(error); return false; }
    finally { setBusyAction(""); }
  }

  async function transfer(event) {
    event.preventDefault();
    if (!transferLocation) return;
    if (await runAction("transfer", () => api("items/" + itemId + "/transfers", { method: "POST", body: { location_id: Number(transferLocation) } }), "The storage transfer was recorded.")) { setTransferOpen(false); setTransferLocation(""); }
  }
  async function publish(event) {
    event.preventDefault();
    const summary = publicDescription ?? listing?.public_description ?? "";
    if (!summary.trim()) return;
    if (await runAction("publish", () => api("staff/items/" + itemId + "/public-listing", { method: "PUT", body: { public_description: summary } }), "The staff-authored public summary was published.")) { setPublishOpen(false); setPublicDescription(null); }
  }
  async function unpublish() {
    if (!await confirm("Remove this item's public listing? The listing history will remain recorded.", { confirmLabel: "Remove public listing" })) return;
    runAction("unpublish", () => api("staff/items/" + itemId + "/public-listing", { method: "DELETE" }), "Item listing removed.");
  }
  async function reviewClaim(claim, action) {
    if (busyAction || resource.loading || claimsResource.loading) return;
    const claimant = claim.claimant?.full_name || ("claimant #" + claim.claimant_id);
    const message = action === "return"
      ? "Return item #" + itemId + " to " + claimant + "? This closes its storage assignment, removes the item from public listings, and rejects all other pending claims for this item."
      : "Reject " + claimant + "\u2019s claim for item #" + itemId + "? This decision cannot be undone here.";
    if (!await confirm(message, { confirmLabel: action === "return" ? "Return item" : "Reject claim", danger: action !== "return" })) return;
    const actionName = action === "return" ? "return" : "reject";
    runAction(actionName + "-" + claim.claimant_id,
      () => api("items/" + itemId + "/claims/" + claim.claimant_id + "/" + actionName, { method: "POST", body: {} }),
      action === "return" ? "Item returned. Storage closed." : "Claim rejected.");
  }

  if (resource.loading && !item) return <LoadingState label="Loading staff item record…" />;
  if (resource.error) return <><PageHeading eyebrow="INVENTORY" title="Item record" /><ErrorNotice error={resource.error} /></>;
  return <>
    <PageHeading eyebrow="INVENTORY · ITEM #" title={"Item #" + item.item_id} description="This staff view includes private finder, location, claim, and storage details." action={<Link className="button button-secondary" to={back.to}>{back.label}</Link>} />
    <ErrorNotice error={!publishOpen && !transferOpen ? actionError : null} focus />
    <div className="item-detail-grid">
      <Panel title="Item and finder details"><dl className="detail-list"><div><dt>Internal description</dt><dd>{item.item_description}</dd></div><div><dt>Found place</dt><dd>{item.found_place}</dd></div><div><dt>Found at</dt><dd>{formatDate(item.found_at, { time: true })}</dd></div><div><dt>Received at</dt><dd>{formatDate(item.received_at, { time: true })}</dd></div><div><dt>Category</dt><dd>{item.category?.category_name}</dd></div><div><dt>Finder</dt><dd>{item.finder?.full_name}</dd></div><div><dt>Finder contact</dt><dd>{item.finder?.contact_details}</dd></div><div><dt>Received by</dt><dd>{item.receiving_staff?.full_name}</dd></div><div><dt>Current location</dt><dd>{item.current_location ? item.current_location.location_code + " · " + item.current_location.location_description : "No open storage assignment"}</dd></div><div><dt>Item state</dt><dd>{item.is_returned ? "Returned" : item.current_assignment ? "Stored" : "No active placement"}</dd></div></dl></Panel>
      <div className="inventory-action-stack">
        <Panel title="Public listing" description="The safe summary and separately approved item photos appear in public browse.">
          {listing && <div className="notice notice-info"><strong>Currently public</strong><span>{listing.public_description}</span></div>}
          {item.is_returned || !item.current_assignment ? <p className="muted-copy">Only currently stored, unreturned items can be published.</p> : <><div className="form-actions"><button className="button button-primary" type="button" onClick={() => setPublishOpen(true)}>{listing ? "Edit public listing" : "Publish summary"}</button>{listing && <button className="button button-secondary" type="button" disabled={Boolean(busyAction)} onClick={unpublish}>Unpublish</button>}</div><FormDialog discardLabel="Discard changes" open={publishOpen} title={listing ? "Update public listing" : "Publish public summary"} onClose={() => { setPublishOpen(false); setPublicDescription(null); setActionError(null); }}><form onSubmit={publish} aria-busy={busyAction === "publish" || undefined}>
            <ErrorNotice error={actionError} focus fields={{ public_description: { id: "public_description", label: "Public summary" } }} /><Field label={listing ? "Update public summary" : "Safe public summary"} name="public_description" error={actionError?.errors?.public_description} hint="Do not include finder names, contact details, exact places, or private evidence."><textarea id="public_description" maxLength="2000" value={publicDescription ?? listing?.public_description ?? ""} onChange={(event) => setPublicDescription(event.target.value)} required /></Field>
            <div className="form-actions"><button className="button button-primary" type="submit" disabled={Boolean(busyAction)}>{busyAction === "publish" ? "Publishing…" : listing ? "Update public listing" : "Publish summary"}</button></div>
          </form></FormDialog></>}
        </Panel>
        <Panel title="Transfer storage" description="A transfer creates a new assignment and retains previous history.">
          {item.is_returned || !item.current_assignment ? <p className="muted-copy">This item has no open assignment to transfer.</p> : <><button className="button button-secondary" type="button" onClick={() => setTransferOpen(true)}>Transfer storage</button><FormDialog discardLabel="Discard changes" open={transferOpen} title="Transfer storage" onClose={() => { setTransferOpen(false); setTransferLocation(""); setActionError(null); }}><form onSubmit={transfer} aria-busy={busyAction === "transfer" || undefined}><ErrorNotice error={actionError} focus fields={{ location_id: { id: "transfer-location", label: "New storage location" } }} /><ReferenceSelect resource={locations} label="New storage location" id="transfer-location" value={transferLocation} onChange={event => setTransferLocation(event.target.value)} fieldError={actionError?.errors?.location_id} rowKey="location_id" excludeId={item.current_location?.location_id} optionLabel={row => row.location_code + " · " + row.location_description} placeholder="Select a location" emptyText="No other storage locations are available. Add a different location in Categories and storage." /><div className="form-actions"><button className="button button-secondary" type="submit" disabled={Boolean(busyAction) || !referenceReady(locations) || !transferLocation}>{busyAction === "transfer" ? "Transferring…" : "Record transfer"}</button></div></form></FormDialog></>}
        </Panel>
      </div>
    </div>
    <ImageManager path={"items/" + itemId + "/images"} publication readOnly={item.is_returned || !item.current_assignment} />
    <Panel className="inventory-lower-panel staff-claims-panel" title="Ownership claims" description="Claim evidence and claimant contacts are visible only to authorized staff.">
      <div className="form-actions"><WalkInClaim itemId={itemId} disabled={Boolean(busyAction) || resource.loading || item.is_returned || !item.current_assignment} onCreated={() => { resource.reload(); claimsResource.reload(); }} /></div>
      <ErrorNotice error={claimsResource.error} retry={false} />
      {claimsResource.error && <button className="button button-secondary" type="button" onClick={claimsResource.reload}>Retry claims</button>}
      {claimsResource.loading && !claimsResource.payload ? <LoadingState label="Loading item claims…" /> : !claimsResource.error && <>
      {claimsResource.payload && <p role="status">{claimsResource.page.total} claims in total</p>}
      {selectedClaimant && !activeClaims.some(claim => String(claim.claimant_id) === selectedClaimant) && <p className="muted-copy">The selected claim is not on this page.</p>}
      <DataTable caption="Claims for this item" rows={activeClaims} rowProps={claim => String(claim.claimant_id) === selectedClaimant ? { id: "claim-" + itemId + "-" + selectedClaimant, tabIndex: -1, className: "selected-claim" } : {}} rowKey={(claim) => claim.claimant_id} emptyTitle="No claims on this item" emptyText="No ownership claims have been submitted for this item." columns={[
        { key: "claimant", label: "Claimant", render: (claim) => <div><strong>{claim.claimant?.full_name}</strong>{String(claim.claimant_id) === selectedClaimant && <span className="selected-claim-label">Selected claim</span>}<small className="table-subline">{claim.claimant?.contact_details}</small></div> },
        { key: "evidence_text", label: "Evidence", render: (claim) => <OwnershipEvidence claim={claim} item={item} /> },
        { key: "submitted_at", label: "Submitted", render: (claim) => formatDate(claim.submitted_at, { time: true }) },
        { key: "outcome", label: "Outcome", render: (claim) => <StaffStatus value={claim.outcome} /> },
        { key: "reviewer", label: "Reviewed by", render: (claim) => claim.reviewer?.full_name ? claim.reviewer.full_name + " · " + formatDate(claim.reviewed_at) : "—" },
        { key: "actions", label: "Actions", render: (claim) => claim.outcome === "PENDING" ? <div className="claim-decision"><strong>{claim.claimant?.full_name}</strong><div className="inline-actions"><button className="button button-secondary button-small" type="button" disabled={Boolean(busyAction) || claimsResource.loading || resource.loading} onClick={() => reviewClaim(claim, "reject")}>Reject</button><button className="button button-primary button-small" type="button" disabled={Boolean(busyAction) || claimsResource.loading || resource.loading || item.is_returned} onClick={() => reviewClaim(claim, "return")}>Return item</button></div></div> : "—" },
      ]} />
      <Pager label="Claim pagination" page={claimsResource.page} onPage={page => changeDetailPage("claims_page", page)} />
      </>}
    </Panel>
    <Panel className="inventory-lower-panel" title="Storage history" description="Assignments remain visible after transfer or return.">
      <ErrorNotice error={historyResource.error} retry={false} />
      {historyResource.error && <button className="button button-secondary" type="button" onClick={historyResource.reload}>Retry storage history</button>}
      {historyResource.loading && !historyResource.payload ? <LoadingState label="Loading storage history…" /> : !historyResource.error && <>
      {historyResource.payload && <p role="status">{historyResource.page.total} storage assignments in total</p>}
      <DataTable caption="Storage assignment history" rows={historyResource.rows} rowKey={(row) => row.assignment_no} emptyTitle="No storage history" emptyText="No storage placements have been recorded for this item." columns={[
        { key: "assignment_no", label: "Assignment" },
        { key: "location", label: "Location", render: (row) => <><strong>{row.location?.location_code}</strong><small className="table-subline">{row.location?.location_description}</small></> },
        { key: "assigned_at", label: "Placed", render: (row) => formatDate(row.assigned_at, { time: true }) },
        { key: "assigner", label: "Assigned by", render: (row) => row.assigning_staff?.full_name || "—" },
        { key: "removed_at", label: "Closed", render: (row) => formatDate(row.removed_at, { time: true }) },
      ]} />
      <Pager label="Storage history pagination" page={historyResource.page} onPage={page => changeDetailPage("history_page", page)} />
      </>}
    </Panel>
  </>;
}

export function StaffClaimsPage() {
  const [params, setParams] = useSearchParams();
  const navigation = useLocation();
  const pageNumber = Math.max(1, Number(params.get("page")) || 1);
  const setPageNumber = page => setParams({ page: String(page) });
  const resource = useApiResource("staff-pending-claims-" + pageNumber, () => api("reports/pending-claims", { query: { per_page: 20, page: pageNumber } }));
  return <>
    <PageHeading eyebrow="CLAIM REVIEW" title="Pending claims" description="Review evidence, then open the item record to reject or complete a return." />
    <Panel className="staff-claims-panel" title="Claims awaiting review" description="This report includes the evidence text and related item and claimant details for staff.">
      {resource.loading ? <LoadingState label="Loading pending claims…" /> : resource.error ? <ErrorNotice error={resource.error} /> : <DataTable caption="Pending claims" rows={resource.rows} rowKey={(row) => row.item_id + "-" + row.claimant_id} emptyTitle="No claims awaiting review" emptyText="There are no claims awaiting review." columns={[
        { key: "claimant", label: "Claimant", render: (row) => <div><strong>{row.claimant?.full_name}</strong><small className="table-subline">{row.claimant?.contact_details}</small></div> },
        { key: "item", label: "Item", render: (row) => <div><strong>{row.item?.item_description}</strong><small className="table-subline">{row.item?.category?.category_name} · #{row.item_id}</small></div> },
        { key: "evidence_text", label: "Evidence", render: (row) => <OwnershipEvidence claim={row} /> },
        { key: "submitted_at", label: "Submitted", render: (row) => formatDate(row.submitted_at, { time: true }) },
        { key: "review", label: "Review", render: (row) => <Link className="button button-secondary button-small" to={"/staff/items/" + row.item_id + "?claimant=" + row.claimant_id} state={{ reviewFrom: navigation.pathname + navigation.search }}>Review item</Link> },
      ]} />}
      {!resource.loading && !resource.error && <Pager page={resource.page} onPage={setPageNumber} />}
    </Panel>
  </>;
}

export function StaffReportsPage() {
  const [filters, setFilters] = useState({ category_id: "", location_id: "", received_from: "", received_to: "" });
  const [applied, setApplied] = useState(filters);
  const [reportPages, setReportPages] = useState({ pending: 1, rates: 1, occupancy: 1, intake: 1 });
  const categories = useReferenceList("categories");
  const locations = useReferenceList("storage-locations");
  const dates = { received_from: applied.received_from || undefined, received_to: applied.received_to || undefined };
  const category = { category_id: applied.category_id || undefined };
  const pendingQuery = { ...category, ...dates, per_page: 20, page: reportPages.pending };
  const ratesQuery = { ...category, ...dates, per_page: 20, page: reportPages.rates };
  const occupancyQuery = { location_id: applied.location_id || undefined, per_page: 20, page: reportPages.occupancy };
  const intakeQuery = { ...category, ...dates, per_page: 20, page: reportPages.intake };
  const pending = useApiResource("report-pending-" + JSON.stringify(pendingQuery), () => api("reports/pending-claims", { query: pendingQuery }));
  const rates = useApiResource("report-rates-" + JSON.stringify(ratesQuery), () => api("reports/return-rates", { query: ratesQuery }));
  const occupancy = useApiResource("report-occupancy-" + JSON.stringify(occupancyQuery), () => api("reports/storage-occupancy", { query: occupancyQuery }));
  const intake = useApiResource("report-intake-" + JSON.stringify(intakeQuery), () => api("reports/monthly-intake", { query: intakeQuery }));
  const resource = { error: [pending, rates, occupancy, intake].find(report => report.error)?.error };
  const reportFiltersActive = Boolean(applied.category_id || applied.received_from || applied.received_to);
  const clearReportFilters = <button type="button" className="button button-secondary" onClick={() => { const cleared = { category_id: "", location_id: "", received_from: "", received_to: "" }; setFilters(cleared); setApplied(cleared); setReportPages({ pending: 1, rates: 1, occupancy: 1, intake: 1 }); }}>Clear report filters</button>;
  return <>
    <PageHeading eyebrow="OPERATIONS" title="Reports" description="View pending claims, return rates, current storage occupancy, and monthly intake from current records." />
    <Panel className="report-filter-panel" title="Report filters"><form className="report-filter-form" onSubmit={(event) => { event.preventDefault(); setReportPages({ pending: 1, rates: 1, occupancy: 1, intake: 1 }); setApplied(filters); }}>
      <ReferenceSelect resource={categories} required={false} label="Category" id="report-category" value={filters.category_id} onChange={event => setFilters({ ...filters, category_id: event.target.value })} fieldError={resource.error?.errors?.category_id} rowKey="category_id" optionLabel={row => row.category_name} placeholder="All categories" emptyText="No categories are available." />
      <ReferenceSelect resource={locations} required={false} label="Location (occupancy)" id="report-location" value={filters.location_id} onChange={event => setFilters({ ...filters, location_id: event.target.value })} fieldError={resource.error?.errors?.location_id} rowKey="location_id" optionLabel={row => row.location_code} placeholder="All locations" emptyText="No storage locations are available." />
      <Field label="Received from" name="report-from" error={resource.error?.errors?.received_from}><input id="report-from" type="date" value={filters.received_from} onChange={(event) => setFilters({ ...filters, received_from: event.target.value })} /></Field>
      <Field label="Received through" name="report-to" error={resource.error?.errors?.received_to}><input id="report-to" type="date" value={filters.received_to} onChange={(event) => setFilters({ ...filters, received_to: event.target.value })} /></Field>
      <button className="button button-secondary" type="submit">Run reports</button>
    </form></Panel>

    <div className="staff-report-grid">
      <Panel title="Pending claims">{pending.loading ? <LoadingState label="Loading pending claims…" /> : pending.error ? <ErrorNotice error={pending.error} /> : <><DataTable caption="Pending claims report" rows={pending.rows} rowKey={(row) => row.item_id + "-" + row.claimant_id} emptyTitle="No pending claims" emptyText={reportFiltersActive ? "No pending claims match the selected category and dates. Adjust the report filters to broaden the results." : "There are no claims awaiting review."} emptyAction={reportFiltersActive ? clearReportFilters : undefined} columns={[
        { key: "claimant", label: "Claimant", render: (row) => row.claimant?.full_name },
        { key: "item", label: "Item", render: (row) => row.item?.item_description },
        { key: "submitted_at", label: "Submitted", render: (row) => formatDate(row.submitted_at) },
      ]} /><Pager page={pending.page} onPage={(page) => setReportPages((current) => ({ ...current, pending: page }))} /></>}</Panel>
      <Panel title="Return rates">{rates.loading ? <LoadingState label="Loading return rates…" /> : rates.error ? <ErrorNotice error={rates.error} /> : <><DataTable caption="Return rates report" rows={rates.rows} rowKey={(row) => row.category_id} emptyTitle="No return-rate data" emptyText={reportFiltersActive ? "No received items match the selected category and dates. Adjust the report filters to broaden the results." : "Return-rate information will appear after items have been received."} emptyAction={reportFiltersActive ? clearReportFilters : undefined} columns={[
        { key: "category_name", label: "Category" }, { key: "received_items", label: "Received" }, { key: "returned_items", label: "Returned" }, { key: "return_rate_percent", label: "Return rate", render: (row) => row.return_rate_percent === null ? "—" : row.return_rate_percent + "%" },
      ]} /><Pager page={rates.page} onPage={(page) => setReportPages((current) => ({ ...current, rates: page }))} /></>}</Panel>
      <Panel title="Storage occupancy">{occupancy.loading ? <LoadingState label="Loading storage occupancy…" /> : occupancy.error ? <ErrorNotice error={occupancy.error} /> : <><DataTable caption="Storage occupancy report" rows={occupancy.rows} rowKey={(row) => row.location_id} emptyTitle="No storage locations found" emptyText={applied.location_id ? "No occupancy results for this location. Choose another location or select All locations." : "Add a storage location in Categories and storage to track occupancy."} emptyAction={applied.location_id ? clearReportFilters : undefined} columns={[
        { key: "location_code", label: "Location" }, { key: "location_description", label: "Description" }, { key: "current_item_count", label: "Stored items" }, { key: "average_holding_days", label: "Avg. days", render: (row) => row.average_holding_days === null ? "—" : row.average_holding_days },
      ]} /><Pager page={occupancy.page} onPage={(page) => setReportPages((current) => ({ ...current, occupancy: page }))} /></>}</Panel>
      <Panel title="Monthly intake"><p className="muted-copy">The running total includes receipts before the selected start date.</p>{intake.loading ? <LoadingState label="Loading monthly intake…" /> : intake.error ? <ErrorNotice error={intake.error} /> : <><DataTable caption="Monthly intake report" rows={intake.rows} rowKey={(row) => row.month} emptyTitle="No intake in this period" emptyText={reportFiltersActive ? "No items were received for the selected category and dates. Adjust the report filters to broaden the results." : "Monthly intake will appear here after items have been received."} emptyAction={reportFiltersActive ? clearReportFilters : undefined} columns={[
        { key: "month", label: "Month" }, { key: "monthly_intake", label: "Received" }, { key: "running_total", label: "Running total" },
      ]} /><Pager page={intake.page} onPage={(page) => setReportPages((current) => ({ ...current, intake: page }))} /></>}</Panel>
    </div>
  </>;
}
