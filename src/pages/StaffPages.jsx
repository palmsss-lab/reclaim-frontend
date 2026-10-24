import { useSuccessToast } from "../components/Toast";
import PossibleMatchForm from "../components/PossibleMatchForm";
import { FoundItemFields, WorkflowField, WorkflowForm, foundItemTargets } from "../components/WorkflowForm";
import { useConfirm } from "../components/Confirmation";
import { DraftImage, useRecordImage } from "../components/DraftImage";
import { ImageManager } from "../components/Images";
import { FormDialog } from "../components/FormDialog";
import WalkInFinder from "../components/WalkInFinder";
import { useState } from "react";
import { Link, useLocation, useParams } from "react-router";
import { useQueueFilters } from "../hooks/useQueueFilters";
import { reviewContext } from "../navigation/reviewContext";
import { api, allPages, pageInfo } from "../api/client";
import { DataTable, EmptyState, ErrorNotice, Field, LoadingState, PageHeading, Panel, Pager, StatusBadge, formatDate, useApiResource } from "../components/ui";
import "./StaffPages.css";

function localDateTime() {
  const date = new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
function apiDateTime(value) { return value ? new Date(value).toISOString() : ""; }
function ReportFilters({ values, onChange, onSubmit, statuses, error }) {
  return <form className="staff-filter-form" onSubmit={onSubmit}>
    <Field label="Search reports" name="report-search" error={error?.errors?.q}><input id="report-search" type="search" placeholder="Search description or reporter…" value={values.q} onChange={(event) => onChange({ ...values, q: event.target.value })} /></Field>
    <Field label="Status" name="report-status" error={error?.errors?.status}><select id="report-status" value={values.status} onChange={(event) => onChange({ ...values, status: event.target.value })}><option value="">All statuses</option>{statuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></Field>
    <button className="button button-secondary" type="submit">Apply filters</button>
  </form>;
}
function ReferenceOptions() {
  return useApiResource("staff-reference-options", async () => {
    const [categories, locations, people] = await Promise.all([
      allPages("categories"),
      allPages("storage-locations"),
      allPages("people"),
    ]);
    return { categories: categories.data || [], locations: locations.data || [], people: people.data || [] };
  });
}

export function StaffDashboardPage() {
  const resource = useApiResource("staff-dashboard", async () => {
    const [finder, missing, claims, occupancy] = await Promise.all([
      api("staff/finder-reports", { query: { status: "PENDING", per_page: 5 } }),
      api("staff/missing-reports", { query: { status: "OPEN", per_page: 5 } }),
      api("reports/pending-claims", { query: { per_page: 5 } }),
      allPages("reports/storage-occupancy"),
    ]);
    return { finder, missing, claims, occupancy };
  });
  const data = resource.payload;
  const storedItems = (data?.occupancy?.data || []).reduce((sum, row) => sum + Number(row.current_item_count || 0), 0);

  return <>
    <PageHeading eyebrow="OPERATIONS" title="Staff dashboard" description="Review new reports, track claims, and manage items in storage." action={<Link className="button button-primary" to="/staff/items/new">Receive an item</Link>} />
    <div className="section-note"><strong>Workflow:</strong> Receive the item after physical handover, choose its storage location, and publish a separate public description before a user can claim it.</div>
    {resource.loading && <LoadingState label="Loading Reclaim operations…" />}
    <ErrorNotice error={resource.error} />
    {data && <>
      <div className="stats-grid"><div className="stat-card"><span>Finder reports</span><strong>{pageInfo(data.finder).total}</strong><small>Awaiting handover review</small></div><div className="stat-card"><span>Missing reports</span><strong>{pageInfo(data.missing).total}</strong><small>Open reports</small></div><div className="stat-card"><span>Pending claims</span><strong>{pageInfo(data.claims).total}</strong><small>Require staff review</small></div><div className="stat-card"><span>Items in storage</span><strong>{storedItems}</strong><small>Across all storage locations</small></div></div>
      <div className="staff-dashboard-grid">
        <Panel title="Finder reports awaiting handover" action={<Link to="/staff/finder-reports">View queue</Link>}>
          <DataTable caption="Finder reports awaiting handover" rows={data.finder.data || []} rowKey={(row) => row.report_id} emptyTitle="No finder reports awaiting handover" emptyText="There are no found-item reports awaiting handover review." columns={[
            { key: "item_description", label: "Item", render: (row) => <><strong>{row.item_description}</strong><small className="table-subline">{row.reporter_name} · {row.reporter_email}</small></> },
            { key: "submitted_at", label: "Reported", render: (row) => formatDate(row.submitted_at) },
            { key: "open", label: "Review", render: (row) => <Link to={"/staff/finder-reports/" + row.report_id} state={{ reviewFrom: "/staff" }}>Review</Link> },
          ]} />
        </Panel>
        <Panel title="Claims to review" action={<Link to="/staff/claims">View claims</Link>}>
          <DataTable caption="Pending claims" rows={data.claims.data || []} rowKey={(row) => row.item_id + "-" + row.claimant_id} emptyTitle="No claims awaiting review" emptyText="There are no claims awaiting review." columns={[
            { key: "claimant", label: "Claimant", render: (row) => row.claimant?.full_name || "—" },
            { key: "item", label: "Item", render: (row) => <><strong>{row.item?.item_description || ("Item #" + row.item_id)}</strong><small className="table-subline">{row.item?.category?.category_name || ""}</small></> },
            { key: "submitted_at", label: "Claim submitted", render: (row) => formatDate(row.submitted_at) },
            { key: "open", label: "Review", render: (row) => <Link to={"/staff/items/" + row.item_id + "?claimant=" + row.claimant_id} state={{ reviewFrom: "/staff" }}>Review</Link> },
          ]} />
        </Panel>
      </div>
    </>}
  </>;
}

export function FinderQueuePage() {
  const { filters, setFilters, applied, pageNumber, setPageNumber, apply, clear, reviewFrom } = useQueueFilters("PENDING");
  const query = { per_page: 20, page: pageNumber };
  if (applied.q) query.q = applied.q;
  if (applied.status) query.status = applied.status;
  const key = JSON.stringify(query);
  const resource = useApiResource("staff-finder-queue-" + key, () => api("staff/finder-reports", { query }));
  return <>
    <PageHeading eyebrow="INTAKE" title="Finder reports" description="Review a private report, then record the physical handover once staff receives the item." action={<Link className="button button-primary" to="/staff/items/new">Direct staff intake</Link>} />
    <Panel title="Report queue" description="Finder details and contact information are staff-only.">
      <ReportFilters values={filters} onChange={setFilters} onSubmit={apply} error={resource.error} statuses={["PENDING", "RECEIVED", "CLOSED", "WITHDRAWN"]} />
      {resource.loading ? <LoadingState label="Loading finder reports…" /> : resource.error ? <ErrorNotice error={resource.error} focus={resource.error.status === 422} fields={{ q: { id: "report-search", label: "Search reports" }, status: { id: "report-status", label: "Status" } }} /> : <DataTable caption="Staff finder reports" rows={resource.rows} rowKey={(row) => row.report_id} emptyTitle={applied.q || applied.status ? "No finder reports match" : "No finder reports yet"} emptyText={applied.q || applied.status ? "Try a different search or clear the filters." : "Found-item reports will appear here when submitted."} emptyAction={applied.q || applied.status ? <button type="button" className="button button-secondary" onClick={clear}>Clear filters</button> : undefined} columns={[
        { key: "item_description", label: "Item", render: (row) => <><strong>{row.item_description}</strong><small className="table-subline">{row.reporter_name} · {row.reporter_email}</small></> },
        { key: "found_place", label: "Found place" },
        { key: "found_at", label: "Found", render: (row) => formatDate(row.found_at) },
        { key: "status", label: "Status", render: (row) => <StatusBadge value={row.status} /> },
        { key: "review", label: "Review", render: (row) => <Link to={"/staff/finder-reports/" + row.report_id} state={{ reviewFrom }}>Open report</Link> },
      ]} />}
      {!resource.loading && !resource.error && <Pager page={resource.page} onPage={setPageNumber} />}
    </Panel>
  </>;
}

export function FinderReportDetailPage() {
  const notify = useSuccessToast();
  const back = reviewContext(useLocation().state?.reviewFrom, "/staff/finder-reports");
  const confirm = useConfirm();
  const { reportId } = useParams();
  const resource = useApiResource("staff-finder-report-" + reportId, () => api("staff/finder-reports/" + reportId), true);
  const refs = ReferenceOptions();
  const [values, setValues] = useState({ category_id: "", initial_location_id: "" });
  const [actionError, setActionError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [busy, setBusy] = useState(false);
  const [handoverOpen, setHandoverOpen] = useState(false);
  const [closureError, setClosureError] = useState(null);
  const report = resource.payload?.data;
  async function receive(event) {
    event.preventDefault();
    if (busy) return;
    if (!await confirm("Confirm the physical handover and create one item with its initial storage assignment?", { confirmLabel: "Receive item" })) return;
    setBusy(true); setActionError(null); setSuccess(null);
    try {
      const result = await api("staff/finder-reports/" + reportId + "/receive", { method: "POST", body: { category_id: Number(values.category_id), initial_location_id: Number(values.initial_location_id) } });
      setSuccess(result?.data || result); notify("Handover recorded. Item received and stored.", "handover-" + reportId); setHandoverOpen(false); resource.reload();
    } catch (error) { setActionError(error); }
    finally { setBusy(false); }
  }
  async function closeReport() {
    if (!await confirm("Close this finder report? A closed report cannot be reopened.", { confirmLabel: "Close report", danger: true })) return;
    setBusy(true); setSuccess(null);
    try { await api("staff/finder-reports/" + reportId + "/close", { method: "POST", body: {} }); setClosureError(null); notify("Found-item report closed."); resource.reload(); }
    catch (error) { setClosureError(error); }
    finally { setBusy(false); }
  }

  return <>
    <PageHeading eyebrow="FINDER REPORT REVIEW" title={report ? "Report #" + report.report_id : "Finder report"} description="Only staff can view the reporter's identity and exact found place." action={<Link className="button button-secondary" to={back.to}>{back.label}</Link>} />
    {resource.loading && !report ? <LoadingState label="Loading finder report…" /> : resource.error ? <ErrorNotice error={resource.error} /> : report && <>
      <p><a href="#handover-actions" onClick={event => { event.preventDefault(); document.getElementById("handover-actions")?.focus(); }}>Go to handover actions</a></p>
      <div className="staff-detail-grid">
        <ImageManager path={"staff/finder-reports/" + reportId + "/images"} readOnly />
        <Panel title="Reported item"><dl className="detail-list"><div><dt>Description</dt><dd>{report.item_description}</dd></div><div><dt>Found place</dt><dd>{report.found_place}</dd></div><div><dt>Found at</dt><dd>{formatDate(report.found_at, { time: true })}</dd></div><div><dt>Submitted</dt><dd>{formatDate(report.submitted_at, { time: true })}</dd></div><div><dt>Reporter</dt><dd>{report.reporter_name}</dd></div><div><dt>Reporter email</dt><dd>{report.reporter_email}</dd></div><div><dt>Contact details</dt><dd>{report.reporter_contact}</dd></div><div><dt>Status</dt><dd><StatusBadge value={report.status} /></dd></div></dl></Panel>
        <section id="handover-actions" tabIndex="-1" aria-label="Physical handover">
        <Panel title="Physical handover" description="Select the official category and where staff places the item.">
          <ErrorNotice error={closureError} focus onDismiss={() => setClosureError(null)} />
          <div className="inline-actions handover-actions">
          {success?.item_id && <Link className="button button-secondary" to={"/staff/items/" + success.item_id}>Open received item</Link>}
          <button className="button button-primary" type="button" aria-disabled={report.status !== "PENDING" || undefined} onClick={() => { if (report.status === "PENDING") setHandoverOpen(true); }}>{report.status === "RECEIVED" ? "Handover recorded" : "Record physical handover"}</button>
          {report.status === "PENDING" && <button className="button button-secondary" type="button" disabled={busy} onClick={closeReport}>{busy ? "Closing report…" : "Close report"}</button>}
          </div>
          <FormDialog open={handoverOpen && report.status === "PENDING"} discardLabel="Discard changes" title="Record physical handover" description="Select the official category and initial storage location for the received item." onClose={() => { setHandoverOpen(false); setValues({ category_id: "", initial_location_id: "" }); setActionError(null); }}><WorkflowForm onSubmit={receive} validationTitle="Check the form" failureTitle="Couldn't receive the item" busy={busy} error={actionError} fields={{ category_id: { id: "handover-category", label: "Official category" }, initial_location_id: { id: "handover-location", label: "Initial storage location" } }} actions={<button className="button button-primary" type="submit" disabled={busy || refs.loading}>{busy ? "Recording handover…" : "Record physical handover"}</button>}>
            <WorkflowField label="Official category" name="handover-category" error={actionError?.errors?.category_id}><select id="handover-category" value={values.category_id} onChange={(event) => setValues({ ...values, category_id: event.target.value })} required><option value="">Select a category</option>{refs.payload?.categories?.map((row) => <option value={row.category_id} key={row.category_id}>{row.category_name}</option>)}</select></WorkflowField>
            <WorkflowField label="Initial storage location" name="handover-location" error={actionError?.errors?.initial_location_id}><select id="handover-location" value={values.initial_location_id} onChange={(event) => setValues({ ...values, initial_location_id: event.target.value })} required><option value="">Select a location</option>{refs.payload?.locations?.map((row) => <option value={row.location_id} key={row.location_id}>{row.location_code} · {row.location_description}</option>)}</select></WorkflowField>
            {refs.loading && <LoadingState label="Loading categories and storage locations…" />}{refs.error && <ErrorNotice error={refs.error} />}
            <div className="notice notice-info">Submitting handover creates the found item and first storage assignment. Each pending report can be received once.</div>
          </WorkflowForm></FormDialog>
          {report.status !== "PENDING" && <p className="muted-copy">This report is {report.status}. Further handover changes are not available.</p>}
        </Panel>
        </section>
      </div>
    </>}
  </>;
}

export function MissingQueuePage() {
  const { filters, setFilters, applied, pageNumber, setPageNumber, apply, clear, reviewFrom } = useQueueFilters("OPEN");
  const query = { per_page: 20, page: pageNumber };
  if (applied.q) query.q = applied.q;
  if (applied.status) query.status = applied.status;
  const key = JSON.stringify(query);
  const resource = useApiResource("staff-missing-queue-" + key, () => api("staff/missing-reports", { query }));
  return <>
    <PageHeading eyebrow="REPORT REVIEW" title="Missing-item reports" description="Review private descriptions and last-known locations submitted by community members." />
    <Panel title="Missing report queue" description="Reporter contact details are visible only to authorized staff.">
      <ReportFilters values={filters} onChange={setFilters} onSubmit={apply} error={resource.error} statuses={["OPEN", "RESOLVED", "WITHDRAWN"]} />
      {resource.loading ? <LoadingState label="Loading missing reports…" /> : resource.error ? <ErrorNotice error={resource.error} focus={resource.error.status === 422} fields={{ q: { id: "report-search", label: "Search reports" }, status: { id: "report-status", label: "Status" } }} /> : <DataTable caption="Staff missing-item reports" rows={resource.rows} rowKey={(row) => row.report_id} emptyTitle={applied.q || applied.status ? "No missing reports match" : "No missing-item reports yet"} emptyText={applied.q || applied.status ? "Try a different search or clear the filters." : "Missing-item reports will appear here when submitted."} emptyAction={applied.q || applied.status ? <button type="button" className="button button-secondary" onClick={clear}>Clear filters</button> : undefined} columns={[
        { key: "item_description", label: "Item", render: (row) => <><strong>{row.item_description}</strong><small className="table-subline">{row.category_name || "No category selected"}</small></> },
        { key: "reporter_name", label: "Reporter", render: (row) => <><strong>{row.reporter_name}</strong><small className="table-subline">{row.reporter_email}</small></> },
        { key: "last_known_location", label: "Last known location" },
        { key: "status", label: "Status", render: (row) => <StatusBadge value={row.status} /> },
        { key: "review", label: "Review", render: (row) => <Link to={"/staff/missing-reports/" + row.report_id} state={{ reviewFrom }}>Open report</Link> },
      ]} />}
      {!resource.loading && !resource.error && <Pager page={resource.page} onPage={setPageNumber} />}
    </Panel>
  </>;
}

export function MissingReportDetailPage() {
  const notify = useSuccessToast();
  const back = reviewContext(useLocation().state?.reviewFrom, "/staff/missing-reports");
  const { reportId } = useParams();
  const resource = useApiResource("staff-missing-report-" + reportId, () => api("staff/missing-reports/" + reportId));
  const [actionError, setActionError] = useState(null);
  const [busy, setBusy] = useState(false);
  const report = resource.payload?.data;
  async function review() {
    if (busy) return; setBusy(true); setActionError(null);
    try { await api("staff/missing-reports/" + reportId + "/review", { method: "POST", body: {} }); notify("Missing-item report reviewed."); resource.reload(); }
    catch (error) { setActionError(error); }
    finally { setBusy(false); }
  }
  return <>
    <PageHeading eyebrow="MISSING REPORT REVIEW" title={report ? "Report #" + report.report_id : "Missing report"} description="Review records staff identity and time. It does not resolve the user's report or change found items." action={<Link className="button button-secondary" to={back.to}>{back.label}</Link>} />
    {resource.loading ? <LoadingState label="Loading missing report…" /> : resource.error ? <ErrorNotice error={resource.error} /> : report && <>
      <ErrorNotice error={actionError} />
      <ImageManager path={"staff/missing-reports/" + reportId + "/images"} readOnly />
      <Panel title="Private report details"><dl className="detail-list"><div><dt>Description</dt><dd>{report.item_description}</dd></div><div><dt>Category</dt><dd>{report.category_name || "Not selected"}</dd></div><div><dt>Last-known location</dt><dd>{report.last_known_location}</dd></div><div><dt>Last seen</dt><dd>{formatDate(report.lost_at, { time: true })}</dd></div><div><dt>Reporter</dt><dd>{report.reporter_name}</dd></div><div><dt>Reporter contact</dt><dd>{report.reporter_contact}</dd></div><div><dt>Reporter email</dt><dd>{report.reporter_email}</dd></div><div><dt>Status</dt><dd><StatusBadge value={report.status} /></dd></div><div><dt>Previously reviewed</dt><dd>{report.reviewer_name ? report.reviewer_name + " · " + formatDate(report.reviewed_at, { time: true }) : "No"}</dd></div></dl>
        {!report.reviewed_at && report.status !== "WITHDRAWN" && <div className="form-actions"><button className="button button-primary" type="button" disabled={busy} onClick={review}>{busy ? "Recording review…" : "Record review"}</button></div>}
        {report.status === "OPEN" && <div className="form-actions"><PossibleMatchForm reportId={report.report_id} onSent={resource.reload} /></div>}
      </Panel>
    </>}
  </>;
}

export function IntakePage() {
  const draft = useRecordImage();
  const notify = useSuccessToast();
  const refs = ReferenceOptions();
  const [values, setValues] = useState({ finder_id: "", category_id: "", initial_location_id: "", item_description: "", found_place: "", found_at: localDateTime() });
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [busy, setBusy] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  async function submit(event) {
    event.preventDefault(); if (busy) return; setBusy(true); setError(null); setSuccess(null);
    const body = { finder_id: Number(values.finder_id), category_id: Number(values.category_id), initial_location_id: Number(values.initial_location_id), item_description: values.item_description, found_place: values.found_place, found_at: apiDateTime(values.found_at) };
    try { const result = await draft.save(() => api("items", { method: "POST", body }), row => "items/" + row.item_id + "/images"); setSuccess(result); draft.reset(); notify("Item received and stored.", "intake-" + result.item_id); setFormOpen(false); }
    catch (requestError) { setError(requestError); }
    finally { setBusy(false); }
  }
  return <>
    <PageHeading eyebrow="INTAKE" title="Receive a found item" description="Create a staff intake record with its initial storage assignment." action={<Link className="button button-secondary" to="/staff/finder-reports">Review finder reports</Link>} />
    {success && <p><Link to={"/staff/items/" + success.item_id}>Open item record #{success.item_id}</Link></p>}
    <Panel className="reference-form-panel" title="Staff intake" description="Describe the found item, then record its finder and initial storage location after physical handover.">
      {refs.error && <ErrorNotice error={refs.error} />}
      <div className="form-actions intake-actions">
        <button className="button button-primary" type="button" onClick={() => { if (success) { setSuccess(null); setValues({ finder_id: "", category_id: "", initial_location_id: "", item_description: "", found_place: "", found_at: localDateTime() }); } setFormOpen(true); }}>{success ? "Receive another item" : "Start staff intake"}</button>
        <WalkInFinder onCreated={person => { refs.reload(); setValues(current => ({ ...current, finder_id: String(person.person_id) })); }} />
      </div>
      <FormDialog open={formOpen} discardLabel="Discard changes" title="Receive a found item" description="Record item details, finder, category, and the first storage assignment after handover." onClose={() => { setFormOpen(false); if (draft.record) setSuccess(draft.record); draft.reset(); setValues({ finder_id: "", category_id: "", initial_location_id: "", item_description: "", found_place: "", found_at: localDateTime() }); setError(null); }}><WorkflowForm onSubmit={submit} validationTitle="Check the form" failureTitle="Couldn't receive the item" busy={busy} error={error} fields={{ image: { id: "intake-image", label: "Photo" }, ...foundItemTargets("intake", "category_id", "Official category", true), finder_id: { id: "finder_id", label: "Finder" }, initial_location_id: { id: "initial_location_id", label: "Initial storage location" } }} actions={<button className="button button-primary" type="submit" disabled={busy || refs.loading || Boolean(success) || draft.uncertain}>{busy ? "Saving intake…" : draft.record ? "Finish saving intake" : "Receive item and assign storage"}</button>}>
        <fieldset className="record-draft-fields" disabled={busy || Boolean(draft.record)}><FoundItemFields passive prefix="intake" values={values} onChange={setValues} error={error} maxDateTime={localDateTime()} category={<WorkflowField label="Official category" name="category_id" error={error?.errors?.category_id}><select id="category_id" value={values.category_id} onChange={(event) => setValues({ ...values, category_id: event.target.value })} required><option value="">Select a category</option>{refs.payload?.categories?.map((row) => <option key={row.category_id} value={row.category_id}>{row.category_name}</option>)}</select></WorkflowField>} />
        <fieldset className="workflow-section"><legend>Handover details</legend><div className="workflow-grid">
          <WorkflowField label="Finder" name="finder_id" error={error?.errors?.finder_id}><select id="finder_id" value={values.finder_id} onChange={(event) => setValues({ ...values, finder_id: event.target.value })} required><option value="">Select a person</option>{refs.payload?.people?.map((row) => <option key={row.person_id} value={row.person_id}>{row.full_name} · {row.contact_details}</option>)}</select></WorkflowField>
          <WorkflowField label="Initial storage location" name="initial_location_id" error={error?.errors?.initial_location_id}><select id="initial_location_id" value={values.initial_location_id} onChange={(event) => setValues({ ...values, initial_location_id: event.target.value })} required><option value="">Select a location</option>{refs.payload?.locations?.map((row) => <option key={row.location_id} value={row.location_id}>{row.location_code} · {row.location_description}</option>)}</select></WorkflowField>
        </div></fieldset></fieldset>
        <DraftImage onChange={() => setError(null)} draft={draft} id="intake-image" intake busy={busy} error={error} onViewSaved={row => { setSuccess(row); setFormOpen(false); draft.reset(); }} />
      </WorkflowForm></FormDialog>
    </Panel>
  </>;
}
