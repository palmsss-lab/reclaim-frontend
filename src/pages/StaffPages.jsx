import { DashboardContent, DashboardStat } from "../components/Dashboard";
import ReferenceSelect, { referenceReady, useReferenceList } from "../components/ReferenceSelect";
import StaffStatus, { staffStatusLabel } from "../components/StaffStatus";
import { manilaDateTime as localDateTime, manilaInputTimestamp as apiDateTime } from "../api/dates";
import { useSuccessToast } from "../components/Toast";
import PossibleMatchForm from "../components/PossibleMatchForm";
import { FoundItemFields, WorkflowForm, foundItemTargets } from "../components/WorkflowForm";
import { useConfirm } from "../components/Confirmation";
import { DraftImage, useRecordImage } from "../components/DraftImage";
import { ImageManager } from "../components/Images";
import { FormDialog } from "../components/FormDialog";
import WalkInFinder from "../components/WalkInFinder";
import { useState } from "react";
import { Link, useLocation, useParams } from "react-router";
import { useQueueFilters } from "../hooks/useQueueFilters";
import { reviewContext } from "../navigation/reviewContext";
import { api, allPages } from "../api/client";
import { DataTable, EmptyState, ErrorNotice, Field, LoadingState, PageHeading, Panel, Pager, formatDate, useApiResource } from "../components/ui";
import "./StaffPages.css";

function ReportFilters({ values, onChange, onSubmit, statuses, error }) {
  return <form className="staff-filter-form" onSubmit={onSubmit}>
    <Field label="Search reports" name="report-search" error={error?.errors?.q}><input id="report-search" type="search" placeholder="Search description or reporter…" value={values.q} onChange={(event) => onChange({ ...values, q: event.target.value })} /></Field>
    <Field label="Status" name="report-status" error={error?.errors?.status}><select id="report-status" value={values.status} onChange={(event) => onChange({ ...values, status: event.target.value })}><option value="">All statuses</option>{statuses.map((status) => <option key={status} value={status}>{staffStatusLabel(status)}</option>)}</select></Field>
    <button className="button button-secondary" type="submit">Apply filters</button>
  </form>;
}

export function StaffDashboardPage() {
  const finder = useApiResource("dashboard-finder", () => api("staff/finder-reports", { query: { status: "PENDING", per_page: 5 } }));
  const missing = useApiResource("dashboard-missing", () => api("staff/missing-reports", { query: { status: "OPEN", per_page: 5 } }));
  const claims = useApiResource("dashboard-claims", () => api("reports/pending-claims", { query: { per_page: 5 } }));
  const occupancy = useApiResource("dashboard-occupancy", () => allPages("reports/storage-occupancy"));
  const storedItems = occupancy.rows.reduce((sum, row) => sum + Number(row.current_item_count || 0), 0);
  return <>
    <PageHeading title="Staff dashboard" description="Review new reports, track claims, and manage items in storage." action={<Link className="button button-primary" to="/staff/items/new">Receive an item</Link>} />
    <div className="section-note"><strong>Workflow:</strong> Receive the item after physical handover, choose its storage location, and publish a separate public description before a user can claim it.</div>
    <div className="stats-grid">
      <DashboardStat resource={finder} label="Finder reports" note="Awaiting handover review" />
      <DashboardStat resource={missing} label="Missing reports" note="Open reports" />
      <DashboardStat resource={claims} label="Pending claims" note="Require staff review" />
      <DashboardStat resource={occupancy} label="Items in storage" value={storedItems} note="Across all storage locations" />
    </div>
    <div className="staff-dashboard-grid">
      <Panel title="Finder reports awaiting handover" action={<Link to="/staff/finder-reports">View queue</Link>}>
        <DashboardContent resource={finder} label="Finder reports">
          <DataTable caption="Finder reports awaiting handover" rows={finder.rows} rowKey={row => row.report_id} emptyTitle="No finder reports awaiting handover" emptyText="There are no found-item reports awaiting handover review." columns={[
            { key: "item_description", label: "Item", render: row => <><strong>{row.item_description}</strong><small className="table-subline">{row.reporter_name} · {row.reporter_email}</small></> },
            { key: "submitted_at", label: "Reported", render: row => formatDate(row.submitted_at) },
            { key: "open", label: "Review", render: row => <Link to={"/staff/finder-reports/" + row.report_id} state={{ reviewFrom: "/staff" }}>Review</Link> },
          ]} />
        </DashboardContent>
      </Panel>
      <Panel title="Claims to review" action={<Link to="/staff/claims">View claims</Link>}>
        <DashboardContent resource={claims} label="Pending claims">
          <DataTable caption="Pending claims" rows={claims.rows} rowKey={row => row.item_id + "-" + row.claimant_id} emptyTitle="No claims awaiting review" emptyText="There are no claims awaiting review." columns={[
            { key: "claimant", label: "Claimant", render: row => row.claimant?.full_name || "—" },
            { key: "item", label: "Item", render: row => <><strong>{row.item?.item_description || ("Item #" + row.item_id)}</strong><small className="table-subline">{row.item?.category?.category_name || ""}</small></> },
            { key: "submitted_at", label: "Claim submitted", render: row => formatDate(row.submitted_at) },
            { key: "open", label: "Review", render: row => <Link to={"/staff/items/" + row.item_id + "?claimant=" + row.claimant_id} state={{ reviewFrom: "/staff" }}>Review</Link> },
          ]} />
        </DashboardContent>
      </Panel>
    </div>
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
        { key: "status", label: "Status", render: (row) => <StaffStatus value={row.status} /> },
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
  const categories = useReferenceList("categories");
  const locations = useReferenceList("storage-locations");
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
    } catch (error) {
      if (error.status === 409) { setHandoverOpen(false); setClosureError(error); resource.reload(); }
      else setActionError(error);
    }
    finally { setBusy(false); }
  }
  async function closeReport() {
    if (!await confirm("Close this finder report? A closed report cannot be reopened.", { confirmLabel: "Close report", danger: true })) return;
    setBusy(true); setSuccess(null);
    try { await api("staff/finder-reports/" + reportId + "/close", { method: "POST", body: {} }); setClosureError(null); notify("Found-item report closed."); resource.reload(); }
    catch (error) { setClosureError(error); if (error.status === 409) resource.reload(); }
    finally { setBusy(false); }
  }

  return <>
    <PageHeading eyebrow="FINDER REPORT REVIEW" title={report ? "Report #" + report.report_id : "Finder report"} description="Only staff can view the reporter's identity and exact found place." action={<Link className="button button-secondary" to={back.to}>{back.label}</Link>} />
    {resource.loading && !report ? <LoadingState label="Loading finder report…" /> : resource.error ? <ErrorNotice error={resource.error} /> : report && <>
      <p><a href="#handover-actions" onClick={event => { event.preventDefault(); document.getElementById("handover-actions")?.focus(); }}>Go to handover actions</a></p>
      <div className="staff-detail-grid">
        <ImageManager path={"staff/finder-reports/" + reportId + "/images"} readOnly />
        <Panel title="Reported item"><dl className="detail-list"><div><dt>Description</dt><dd>{report.item_description}</dd></div><div><dt>Found place</dt><dd>{report.found_place}</dd></div><div><dt>Found at</dt><dd>{formatDate(report.found_at, { time: true })}</dd></div><div><dt>Submitted</dt><dd>{formatDate(report.submitted_at, { time: true })}</dd></div><div><dt>Reporter</dt><dd>{report.reporter_name}</dd></div><div><dt>Reporter email</dt><dd>{report.reporter_email}</dd></div><div><dt>Contact details</dt><dd>{report.reporter_contact}</dd></div><div><dt>Status</dt><dd><StaffStatus value={report.status} /></dd></div></dl></Panel>
        <section id="handover-actions" tabIndex="-1" aria-label="Physical handover">
        <Panel title="Physical handover" description="Select the official category and where staff places the item.">
          <ErrorNotice error={closureError} focus onDismiss={() => setClosureError(null)} />
          <div className="inline-actions handover-actions">
          {(report.received_item_id || success?.item_id) && <Link className="button button-secondary" to={"/staff/items/" + (report.received_item_id || success.item_id)}>Open received item</Link>}
          <button className="button button-primary" type="button" disabled={busy || resource.loading} aria-disabled={report.status !== "PENDING" || undefined} onClick={() => { if (report.status === "PENDING") setHandoverOpen(true); }}>{report.status === "RECEIVED" ? "Handover recorded" : "Record physical handover"}</button>
          {report.status === "PENDING" && <button className="button button-secondary" type="button" disabled={busy || resource.loading} onClick={closeReport}>{busy ? "Closing report…" : "Close report"}</button>}
          </div>
          <FormDialog open={handoverOpen && report.status === "PENDING"} discardLabel="Discard changes" title="Record physical handover" description="Select the official category and initial storage location for the received item." onClose={() => { setHandoverOpen(false); setValues({ category_id: "", initial_location_id: "" }); setActionError(null); }}><WorkflowForm onSubmit={receive} validationTitle="Check the form" failureTitle="Couldn't receive the item" busy={busy} error={actionError} fields={{ category_id: { id: "handover-category", label: "Official category" }, initial_location_id: { id: "handover-location", label: "Initial storage location" } }} actions={<button className="button button-primary" type="submit" disabled={busy || !referenceReady(categories) || !referenceReady(locations)}>{busy ? "Recording handover…" : "Record physical handover"}</button>}>
            <ReferenceSelect resource={categories} label="Official category" id="handover-category" value={values.category_id} onChange={event => setValues({ ...values, category_id: event.target.value })} fieldError={actionError?.errors?.category_id} rowKey="category_id" optionLabel={row => row.category_name} placeholder="Select a category" emptyText="No categories are available. Add an official category in Categories and storage." />
            <ReferenceSelect resource={locations} label="Initial storage location" id="handover-location" value={values.initial_location_id} onChange={event => setValues({ ...values, initial_location_id: event.target.value })} fieldError={actionError?.errors?.initial_location_id} rowKey="location_id" optionLabel={row => row.location_code + " · " + row.location_description} placeholder="Select a location" emptyText="No storage locations are available. Add a location in Categories and storage." />

            <div className="notice notice-info">Submitting handover creates the found item and first storage assignment. Each pending report can be received once.</div>
          </WorkflowForm></FormDialog>
          {report.status !== "PENDING" && <p className="muted-copy">{report.status === "CLOSED" ? "This report was closed without recording item handover." : report.status === "RECEIVED" ? "Staff has recorded receipt and initial storage placement." : "The reporter withdrew this report."} Further handover changes are not available.</p>}
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
        { key: "status", label: "Status", render: (row) => <StaffStatus value={row.status} /> },
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
      <Panel title="Private report details"><dl className="detail-list"><div><dt>Description</dt><dd>{report.item_description}</dd></div><div><dt>Category</dt><dd>{report.category_name || "Not selected"}</dd></div><div><dt>Last-known location</dt><dd>{report.last_known_location}</dd></div><div><dt>Last seen</dt><dd>{formatDate(report.lost_at, { time: true })}</dd></div><div><dt>Reporter</dt><dd>{report.reporter_name}</dd></div><div><dt>Reporter contact</dt><dd>{report.reporter_contact}</dd></div><div><dt>Reporter email</dt><dd>{report.reporter_email}</dd></div><div><dt>Status</dt><dd><StaffStatus value={report.status} /></dd></div><div><dt>Previously reviewed</dt><dd>{report.reviewer_name ? report.reviewer_name + " · " + formatDate(report.reviewed_at, { time: true }) : "No"}</dd></div></dl>
        {!report.reviewed_at && report.status !== "WITHDRAWN" && <div className="form-actions"><button className="button button-primary" type="button" disabled={busy} onClick={review}>{busy ? "Recording review…" : "Record review"}</button></div>}
        {report.status === "OPEN" && <div className="form-actions"><PossibleMatchForm reportId={report.report_id} onSent={resource.reload} /></div>}
      </Panel>
    </>}
  </>;
}

export function IntakePage() {
  const draft = useRecordImage();
  const notify = useSuccessToast();
  const categories = useReferenceList("categories");
  const locations = useReferenceList("storage-locations");
  const people = useReferenceList("people");
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

      <div className="form-actions intake-actions">
        <button className="button button-primary" type="button" onClick={() => { if (success) { setSuccess(null); setValues({ finder_id: "", category_id: "", initial_location_id: "", item_description: "", found_place: "", found_at: localDateTime() }); } setFormOpen(true); }}>{success ? "Receive another item" : "Start staff intake"}</button>
        <WalkInFinder onCreated={person => { people.reload(); setValues(current => ({ ...current, finder_id: String(person.person_id) })); }} />
      </div>
      <FormDialog open={formOpen} discardLabel="Discard changes" title="Receive a found item" description="Record item details, finder, category, and the first storage assignment after handover." onClose={() => { setFormOpen(false); if (draft.record) setSuccess(draft.record); draft.reset(); setValues({ finder_id: "", category_id: "", initial_location_id: "", item_description: "", found_place: "", found_at: localDateTime() }); setError(null); }}><WorkflowForm onSubmit={submit} validationTitle="Check the form" failureTitle="Couldn't receive the item" busy={busy} error={error} fields={{ image: { id: "intake-image", label: "Photo" }, ...foundItemTargets("intake", "category_id", "Official category", true), finder_id: { id: "finder_id", label: "Finder" }, initial_location_id: { id: "initial_location_id", label: "Initial storage location" } }} actions={<button className="button button-primary" type="submit" disabled={busy || !referenceReady(categories) || !referenceReady(locations) || !referenceReady(people) || Boolean(success) || draft.uncertain}>{busy ? "Saving intake…" : draft.record ? "Finish saving intake" : "Receive item and assign storage"}</button>}>
        <fieldset className="record-draft-fields" disabled={busy || Boolean(draft.record)}><FoundItemFields passive timeHint="Philippine time (Asia/Manila, UTC+08:00)." prefix="intake" values={values} onChange={setValues} error={error} maxDateTime={localDateTime()} category={<ReferenceSelect resource={categories} label="Official category" id="category_id" value={values.category_id} onChange={event => setValues({ ...values, category_id: event.target.value })} fieldError={error?.errors?.category_id} rowKey="category_id" optionLabel={row => row.category_name} placeholder="Select a category" emptyText="No categories are available. Add an official category in Categories and storage." />} />
        <fieldset className="workflow-section"><legend>Handover details</legend><div className="workflow-grid">
          <ReferenceSelect resource={people} label="Finder" id="finder_id" value={values.finder_id} onChange={event => setValues({ ...values, finder_id: event.target.value })} fieldError={error?.errors?.finder_id} rowKey="person_id" optionLabel={row => row.full_name + " · " + row.contact_details} placeholder="Select a person" emptyText="No people are available. Add a walk-in finder before intake." />
          <ReferenceSelect resource={locations} label="Initial storage location" id="initial_location_id" value={values.initial_location_id} onChange={event => setValues({ ...values, initial_location_id: event.target.value })} fieldError={error?.errors?.initial_location_id} rowKey="location_id" optionLabel={row => row.location_code + " · " + row.location_description} placeholder="Select a location" emptyText="No storage locations are available. Add a location in Categories and storage." />
        </div></fieldset></fieldset>
        <DraftImage onChange={() => setError(null)} draft={draft} id="intake-image" intake busy={busy} error={error} onViewSaved={row => { setSuccess(row); setFormOpen(false); draft.reset(); }} />
      </WorkflowForm></FormDialog>
    </Panel>
  </>;
}
