import { UserStatus } from "../components/UserStatus";
import NotificationTarget from "../components/NotificationTarget";
import { useSuccessToast } from "../components/Toast";
import { FoundItemFields, WorkflowForm, foundItemTargets } from "../components/WorkflowForm";
import { useConfirm } from "../components/Confirmation";
import { AccountMethods } from "../components/AccountMethods";
import { StatusTabs } from "../components/StatusTabs";
import { statusPages } from "../api/statusPages";
import { DraftImage, useRecordImage } from "../components/DraftImage";
import { ReportImages } from "../components/Images";
import { ClaimProofImage } from "../components/ClaimProofImage";
import { FormDialog } from "../components/FormDialog";
import { PublicCategorySelect as CategorySelect } from "../components/PublicCategories";
import { useState } from "react";
import { Link } from "react-router";
import { api, pageInfo } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { DataTable, EmptyState, ErrorNotice, Field, LoadingState, PageHeading, Panel, Pager, formatDate, useApiResource } from "../components/ui";
import "./UserPages.css";

function localDateTime(value) {
  const date = value ? new Date(value) : new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
function apiDateTime(value) { return value ? new Date(value).toISOString() : ""; }
export function UserHomePage() {
  const { session } = useAuth();
  const verified = session?.identity?.email_verified === true;
  const resource = useApiResource("user-dashboard-" + verified, async () => {
    if (!verified) return { summary: null };
    const [finder, missing, claims] = await Promise.all([
      api("my/finder-reports", { query: { per_page: 4 } }),
      api("my/missing-reports", { query: { per_page: 4 } }),
      api("my/claims", { query: { per_page: 4 } }),
    ]);
    return { summary: { finder, missing, claims } };
  });
  const summary = resource.payload?.summary;
  const finderCount = summary ? pageInfo(summary.finder).total : 0;
  const missingCount = summary ? pageInfo(summary.missing).total : 0;
  const claimCount = summary ? pageInfo(summary.claims).total : 0;

  return <div className="user-workspace">
    <PageHeading eyebrow="MY RECLAIM" title={"Welcome, " + (session?.identity?.full_name || "there")} description="Keep track of the items you found, the belongings you lost, and your ownership claims." action={<Link className="button button-primary" to="/my/finder-reports">Report an item found</Link>} />
    {!verified && <div className="notice notice-info" role="status"><strong>Verify your email to continue</strong><span>Reclaim needs a verified email before you can submit reports or claims.</span><Link to="/verify-email">Open email verification</Link></div>}
    {resource.error && <ErrorNotice error={resource.error} />}
    {resource.loading && verified ? <LoadingState label="Loading your reports…" /> : verified && !resource.error && <>
      <div className="stats-grid user-stats"><div className="stat-card"><span>Found-item reports</span><strong>{finderCount}</strong><small>Items you have reported finding</small></div><div className="stat-card"><span>Missing reports</span><strong>{missingCount}</strong><small>Items you are looking for</small></div><div className="stat-card"><span>Ownership claims</span><strong>{claimCount}</strong><small>Claims sent to Reclaim staff</small></div><div className="stat-card"><span>Email status</span><strong className="user-verified-value">Verified</strong><small>Reports and claims are enabled</small></div></div>
      <div className="user-dashboard-grid">
        <Panel title="Recent activity" description="Your private reports and claims.">
          <div className="user-activity-list">
            {summary?.finder?.data?.slice(0, 2).map((report) => <Link to="/my/finder-reports" className="user-activity-row" key={"finder-" + report.report_id}><span className="activity-icon">F</span><span><strong>{report.item_description}</strong><small>Found-item report · {formatDate(report.created_at)}</small></span><UserStatus kind="finder" value={report.status} /></Link>)}
            {summary?.missing?.data?.slice(0, 2).map((report) => <Link to="/my/missing-reports" className="user-activity-row" key={"missing-" + report.report_id}><span className="activity-icon">M</span><span><strong>{report.item_description}</strong><small>Missing report · {formatDate(report.created_at)}</small></span><UserStatus kind="missing" value={report.status} /></Link>)}
            {summary?.claims?.data?.slice(0, 2).map((claim) => <Link to="/my/claims" className="user-activity-row" key={"claim-" + claim.item_id}><span className="activity-icon">C</span><span><strong>{claim.public_description || claim.category_name || ("Item #" + claim.item_id)}</strong><small>Ownership claim · {formatDate(claim.submitted_at)}</small></span><UserStatus kind="claim" value={claim.outcome} /></Link>)}
            {!finderCount && !missingCount && !claimCount && <EmptyState title="Your Reclaim activity will appear here">Use the links below to get started.</EmptyState>}
          </div>
        </Panel>
        <Panel title="What would you like to do?">
          <div className="quick-link-list"><Link to="/my/finder-reports"><div><strong>My found-item reports</strong><small>Report something you found and follow its handover to staff</small></div></Link><Link to="/my/missing-reports"><div><strong>My missing items</strong><small>Report a lost belonging or mark it resolved when you find it</small></div></Link><Link to="/my/claims"><div><strong>My claims</strong><small>Check staff decisions on items you believe are yours</small></div></Link><Link to="/profile"><div><strong>Account settings</strong><small>Update your contact details and sign-in methods</small></div></Link></div>
        </Panel>
      </div>
    </>}
  </div>;
}

function FinderReportForm({ onCreated, onPartial }) {
  const draft = useRecordImage();
  const [values, setValues] = useState({ item_description: "", found_place: "", found_at: localDateTime(), category_id: "" });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault(); if (busy) return; setBusy(true); setError(null);
    const body = { item_description: values.item_description, found_place: values.found_place, found_at: apiDateTime(values.found_at) };
    if (values.category_id) body.category_id = Number(values.category_id);
    try { const record = await draft.save(async () => (await api("my/finder-reports", { method: "POST", body })).data, row => "my/finder-reports/" + row.report_id + "/images"); onCreated(record); setValues({ item_description: "", found_place: "", found_at: localDateTime(), category_id: "" }); }
    catch (requestError) { setError(requestError); }
    finally { setBusy(false); }
  }
  return <>
    <WorkflowForm validationTitle="Check the form" failureTitle="Couldn't submit your report" onSubmit={submit} busy={busy} error={error} fields={{ ...foundItemTargets("finder", "finder-category"), image: { id: "finder-image", label: "Photo" } }} actions={<button className="button button-primary" type="submit" disabled={busy || draft.uncertain}>{busy ? "Sending report…" : draft.record ? "Finish saving report" : "Submit found-item report"}</button>}>
      <fieldset className="record-draft-fields" disabled={busy || Boolean(draft.record)}><FoundItemFields prefix="finder" values={values} onChange={setValues} error={error} maxDateTime={localDateTime()} category={<CategorySelect id="finder-category" error={error?.errors?.category_id} value={values.category_id} onChange={(event) => setValues({ ...values, category_id: event.target.value })} />} />
      </fieldset><DraftImage onChange={() => setError(null)} draft={draft} id="finder-image" busy={busy} error={error} onViewSaved={onPartial} />
    </WorkflowForm>
  </>;
}

export function FinderReportsPage() {
  const notify = useSuccessToast();
  const confirm = useConfirm();
  const [pageNumber, setPageNumber] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const resource = useApiResource("my-finder-reports-" + pageNumber, () => api("my/finder-reports", { query: { per_page: 20, page: pageNumber } }));
  async function withdraw(reportId) {
    if (!await confirm("Withdraw this pending found-item report?", { confirmLabel: "Withdraw report" })) return;
    setBusyId(reportId); setActionError(null);
    try { await api("my/finder-reports/" + reportId + "/withdraw", { method: "POST", body: {} }); notify("Found-item report withdrawn."); resource.reload(); }
    catch (error) { setActionError(error); }
    finally { setBusyId(null); }
  }
  return <>
    <PageHeading title="My found-item reports" description="Report something you found, then hand it to staff. Your report stays private; staff decide when to publish the received item." action={<button className="button button-primary" type="button" onClick={() => setShowForm(true)}>Report found item</button>} />
    <FormDialog discardLabel="Discard changes" open={showForm} title="Report an item you found" description="This creates a private found-item report. Staff will record handover before it becomes a stored item." onClose={() => { setShowForm(false); setPageNumber(1); resource.reload(); }}><FinderReportForm onPartial={() => { setShowForm(false); setPageNumber(1); resource.reload(); }} onCreated={(report) => { setShowForm(false); notify("Found-item report submitted.", "finder-" + report.report_id); resource.reload(); }} /></FormDialog>
    <ErrorNotice error={actionError} />
    <NotificationTarget kind="finder-reports" />
    <Panel className="user-reports-panel" title="Your found-item reports" description="Only reports submitted by your account are shown here.">
      {resource.loading ? <LoadingState label="Loading found-item reports…" /> : resource.error ? <ErrorNotice error={resource.error} /> : <DataTable mobileCards caption="Your found-item reports" rows={resource.rows} rowKey={(row) => row.report_id} emptyTitle="No found-item reports yet" emptyText="Use Report found item to send your first report." columns={[
        { key: "images", label: "Images", render: (row) => <ReportImages report={row} kind="finder" /> },
        { key: "item_description", label: "Item", render: (row) => <><strong>{row.item_description}</strong><small className="table-subline">{row.category_name || "Category not selected"} · Found {formatDate(row.found_at)}</small></> },
        { key: "found_place", label: "Found place" },
        { key: "status", label: "Status", render: (row) => <UserStatus kind="finder" value={row.status} /> },
        { key: "submitted_at", label: "Submitted", render: (row) => formatDate(row.submitted_at) },
        { key: "actions", label: "Actions", render: (row) => row.status === "PENDING" ? <button className="button button-secondary button-small" type="button" disabled={busyId === row.report_id} onClick={() => withdraw(row.report_id)}>{busyId === row.report_id ? "Withdrawing…" : "Withdraw"}</button> : row.received_item_id ? <span>Item #{row.received_item_id}</span> : "—" },
      ]} />}
      {!resource.loading && !resource.error && <Pager page={resource.page} onPage={setPageNumber} />}
    </Panel>
  </>;
}

function MissingReportForm({ report, onSaved, onPartial }) {
  const draft = useRecordImage();
  const [values, setValues] = useState({ item_description: report?.item_description || "", last_known_location: report?.last_known_location || "", lost_at: localDateTime(report?.lost_at), category_id: report?.category_id ? String(report.category_id) : "" });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault(); if (busy) return; setBusy(true); setError(null);
    const body = { item_description: values.item_description, last_known_location: values.last_known_location, lost_at: apiDateTime(values.lost_at), category_id: values.category_id || null };
    try {
      const save = async () => (await api(report ? "my/missing-reports/" + report.report_id : "my/missing-reports", { method: report ? "PATCH" : "POST", body })).data;
      const row = report ? await save() : await draft.save(save, row => "my/missing-reports/" + row.report_id + "/images");
      onSaved(row);
    } catch (requestError) { setError(requestError); }
    finally { setBusy(false); }
  }
  return <>
    <ErrorNotice error={error} focus fields={{ item_description: { id: "missing-description", label: "Item description" }, last_known_location: { id: "last_known_location", label: "Last-known location" }, lost_at: { id: "lost_at", label: "When was it last seen?" }, category_id: { id: "category_id", label: "Category" }, image: { id: "missing-image", label: "Photo" } }} /><form onSubmit={submit} aria-busy={busy || undefined}><fieldset className="record-draft-fields" disabled={busy || Boolean(draft.record)}><div className="form-grid">
      <Field label="Item description" name="missing-description" error={error?.errors?.item_description}><textarea id="missing-description" maxLength="16000" value={values.item_description} onChange={(event) => setValues({ ...values, item_description: event.target.value })} required /></Field>
      <Field label="Last-known location" name="last_known_location" error={error?.errors?.last_known_location}><input id="last_known_location" maxLength="200" value={values.last_known_location} onChange={(event) => setValues({ ...values, last_known_location: event.target.value })} required /></Field>
      <Field label="When was it last seen?" name="lost_at" error={error?.errors?.lost_at}><input id="lost_at" type="datetime-local" max={localDateTime()} value={values.lost_at} onChange={(event) => setValues({ ...values, lost_at: event.target.value })} required /></Field>
      <CategorySelect error={error?.errors?.category_id} value={values.category_id} onChange={(event) => setValues({ ...values, category_id: event.target.value })} />
    </div></fieldset>{!report && <DraftImage onChange={() => setError(null)} draft={draft} id="missing-image" busy={busy} error={error} onViewSaved={onPartial} />}<div className="form-actions"><button className="button button-primary" type="submit" disabled={busy || draft.uncertain}>{busy ? "Saving report…" : draft.record ? "Finish saving report" : report ? "Save changes" : "Submit missing report"}</button></div></form>
  </>;
}

export function MissingReportsEmptyState({ status, counts, onSelectStatus }) {
  const total = counts && Object.values(counts).reduce((sum, count) => sum + count, 0);
  if (total === 0) return <EmptyState title="No missing-item reports yet">Use Report missing item to send your first missing-item report.</EmptyState>;
  const next = status === "OPEN" ? (counts?.RESOLVED ? "RESOLVED" : "WITHDRAWN") : "OPEN";
  const labels = { OPEN: "still-missing", RESOLVED: "resolved", WITHDRAWN: "withdrawn" };
  return <EmptyState title={status === "OPEN" ? "No items marked as still missing" : "No " + labels[status] + " reports"} action={<button className="button button-secondary" type="button" onClick={() => onSelectStatus(next)}>View {labels[next]} reports</button>}>You have no reports in this tab. Your other reports are available in their status tabs.</EmptyState>;
}

export function MissingReportsPage() {
  const notify = useSuccessToast();
  const confirm = useConfirm();
  const [status, setStatus] = useState("OPEN");
  const [pageNumber, setPageNumber] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const resource = useApiResource("my-missing-reports-" + status + "-" + pageNumber, () => statusPages("my/missing-reports", { statuses: ["OPEN", "RESOLVED", "WITHDRAWN"], active: status, page: pageNumber }), true);

  async function changeState(report, action) {
    const label = action === "resolve" ? "resolve" : "withdraw";
    if (!await confirm("Do you want to " + label + " this open missing-item report? You won't be able to reopen this report.", { confirmLabel: action === "resolve" ? "Resolve report" : "Withdraw report" })) return;
    setBusyId(report.report_id); setActionError(null);
    try { await api("my/missing-reports/" + report.report_id + "/" + action, { method: "POST", body: {} }); notify(action === "resolve" ? "Missing-item report resolved." : "Missing-item report withdrawn."); setPageNumber(1); resource.reload(); }
    catch (error) { setActionError(error); }
    finally { setBusyId(null); }
  }

  return <>
    <PageHeading title="My missing items" description="Report what you lost and where you last saw it. Only you and staff can see these details. Mark your report resolved when you find the item." action={<button className="button button-primary" type="button" onClick={() => { setEditing(null); setShowForm(true); }}>Report missing item</button>} />
    <FormDialog discardLabel="Discard changes" open={showForm} title={editing ? "Edit missing-item report" : "Report a missing item"} description="Details stay private to you and authorized staff." onClose={() => { setShowForm(false); setEditing(null); resource.reload(); }}><MissingReportForm onPartial={() => { setShowForm(false); setEditing(null); setStatus("OPEN"); setPageNumber(1); resource.reload(); }} key={editing?.report_id || "new"} report={editing} onSaved={(row) => { setShowForm(false); setEditing(null); setStatus("OPEN"); setPageNumber(1); notify(editing ? "Missing-item report updated." : "Missing-item report submitted.", editing ? undefined : "missing-create-" + row.report_id); resource.reload(); }} /></FormDialog>
    <ErrorNotice error={actionError} />
    <NotificationTarget kind="missing-reports" />
    <Panel className="user-reports-panel" title="Your missing-item reports">
      <StatusTabs label="Missing report state" options={[{ value: "OPEN", label: "Still Missing" }, { value: "RESOLVED", label: "Resolved" }, { value: "WITHDRAWN", label: "Withdrawn" }]} value={status} counts={resource.payload?.tabCounts} onChange={value => { setStatus(value); setPageNumber(1); }}>
      <p className="muted-copy">Resolving your report does not return a stored item or change an ownership claim.</p>
      {resource.loading ? <LoadingState label="Loading missing reports…" /> : resource.error ? <ErrorNotice error={resource.error} /> : !resource.rows.length ? <MissingReportsEmptyState status={status} counts={resource.payload?.tabCounts} onSelectStatus={value => { setStatus(value); setPageNumber(1); }} /> : <DataTable mobileCards caption="Your missing-item reports" rows={resource.rows} rowKey={(row) => row.report_id} columns={[
        { key: "images", label: "Images", render: (row) => <ReportImages report={row} kind="missing" /> },
        { key: "item_description", label: "Item", render: (row) => <><strong>{row.item_description}</strong><small className="table-subline">{row.category_name || "Category not selected"}</small></> },
        { key: "last_known_location", label: "Last known location" },
        { key: "lost_at", label: "Last seen", render: (row) => formatDate(row.lost_at, { time: true }) },
        { key: "status", label: "Status", render: (row) => <UserStatus kind="missing" value={row.status} /> },
        { key: "actions", label: "Actions", render: (row) => row.status === "OPEN" ? <div className="inline-actions"><button type="button" className="button button-secondary button-small" onClick={(event) => { setEditing(row); setShowForm(true); }}>Edit</button><button type="button" className="button button-secondary button-small" disabled={busyId === row.report_id} onClick={() => changeState(row, "resolve")}>Resolve</button><button type="button" className="text-button" disabled={busyId === row.report_id} onClick={() => changeState(row, "withdraw")}>Withdraw</button></div> : "—" },
      ]} />}
      {!resource.loading && !resource.error && <Pager page={resource.page} onPage={setPageNumber} />}
      </StatusTabs>
    </Panel>
  </>;
}

export function ClaimsPage() {
  const [pageNumber, setPageNumber] = useState(1);
  const resource = useApiResource("my-claims-" + pageNumber, () => api("my/claims", { query: { per_page: 20, page: pageNumber } }));
  return <>
    <PageHeading eyebrow="OWNERSHIP CLAIMS" title="My claims" description="Follow the status of claims you submitted. Evidence is visible only to you and authorized staff." action={<Link className="button button-secondary" to="/">Browse found items</Link>} />
    <NotificationTarget kind="claims" />
    <Panel className="user-claims-panel" title="Your ownership claims">
      {resource.loading ? <LoadingState label="Loading your claims…" /> : resource.error ? <ErrorNotice error={resource.error} /> : <DataTable mobileCards caption="Your ownership claims" rows={resource.rows} rowKey={(row) => row.item_id} emptyTitle="No ownership claims yet" emptyText="Browse public items and describe proof of ownership to submit a claim." columns={[
        { key: "public_description", label: "Item", render: (row) => <div><strong>{row.public_description || row.category_name || ("Item #" + row.item_id)}</strong><small className="table-subline">Reference #{row.item_id}</small></div> },
        { key: "category_name", label: "Category" },
        { key: "submitted_at", label: "Submitted", render: (row) => formatDate(row.submitted_at) },
        { key: "evidence_text", label: "Your evidence", render: (row) => <div className="claim-evidence"><span className="evidence-preview">{row.evidence_text}</span><ClaimProofImage modal hasImage={row.has_proof_image} path={"my/claims/" + row.item_id + "/proof-image"} /></div> },
        { key: "outcome", label: "Status", render: (row) => <UserStatus kind="claim" value={row.outcome} /> },
      ]} />}
      {!resource.loading && !resource.error && <Pager page={resource.page} onPage={setPageNumber} />}
    </Panel>
  </>;
}

export function ProfilePage() {
  const notify = useSuccessToast();
  const { refreshIdentity } = useAuth();
  const resource = useApiResource("my-profile", () => api("me/profile"));
  const [values, setValues] = useState(null);
  const [error, setError] = useState(null);
  const [verificationNeeded, setVerificationNeeded] = useState(false);
  const [busy, setBusy] = useState(false);
  const profile = resource.payload?.data;
  const currentValues = values || { full_name: profile?.person?.full_name || "", contact_details: profile?.person?.contact_details || "", email: profile?.email || "" };
  async function saveProfile(event) {
    event.preventDefault(); if (busy) return; setBusy(true); setError(null);
    try {
      await api("me/profile", { method: "PATCH", body: currentValues });
      setVerificationNeeded(currentValues.email !== profile.email);
      notify("Profile updated.");
      setValues(null);
      resource.reload();
      await refreshIdentity();
    } catch (requestError) { setError(requestError); }
    finally { setBusy(false); }
  }

  if (resource.loading && !profile) return <LoadingState label="Loading your profile…" />;
  return <>
    <PageHeading title="Your profile" description="Keep your contact details and username up to date. Authorized staff may use your contact details to follow up on reports or claims." />
    <ErrorNotice error={resource.error || error} focus={Boolean(error)} fields={{ full_name: { id: "profile-name", label: "Full name" }, contact_details: { id: "profile-contact", label: "Contact details" }, email: { id: "profile-email", label: "Email address" } }} />
    {verificationNeeded && <div className="notice notice-info" role="status">Check your new email for the verification link before submitting reports.</div>}
    <div className="profile-grid">
      <Panel title="Personal information" description={profile?.email_verified ? "Your email is verified." : "Changing your email sends a new verification link."}>
        {profile && <form onSubmit={saveProfile}><div className="auth-form-stack">
          <Field label="Full name" name="profile-name" error={error?.errors?.full_name}><input id="profile-name" value={currentValues.full_name} onChange={(event) => setValues({ ...currentValues, full_name: event.target.value })} required /></Field>
          <Field label="Contact details" name="profile-contact" error={error?.errors?.contact_details}><input id="profile-contact" value={currentValues.contact_details} onChange={(event) => setValues({ ...currentValues, contact_details: event.target.value })} required /></Field>
          <Field label="Email address" name="profile-email" error={error?.errors?.email}><input id="profile-email" type="email" value={currentValues.email} onChange={(event) => setValues({ ...currentValues, email: event.target.value })} required /></Field>
        </div><div className="form-actions"><button className="button button-primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Save profile"}</button></div></form>}
      </Panel>
      <AccountMethods />
    </div>
  </>;
}
