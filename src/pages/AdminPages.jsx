import { useSuccessToast } from "../components/Toast";
import { useConfirm } from "../components/Confirmation";
import { FormDialog } from "../components/FormDialog";
import { useAuth } from "../auth/AuthContext";
import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { api } from "../api/client";
import { DataTable, EmptyState, ErrorNotice, Field, LoadingState, PageHeading, Panel, Pager, StatusBadge, useApiResource } from "../components/ui";
import "./AdminPages.css";

function CreateStaffAccount({ onCreated }) {
  const [values, setValues] = useState({ name: "", email: "", staff_full_name: "", password: "", password_confirmation: "" });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault(); if (busy) return; setBusy(true); setError(null);
    try { const result = await api("accounts", { method: "POST", body: values }); onCreated(result?.data || result); setValues({ name: "", email: "", staff_full_name: "", password: "", password_confirmation: "" }); }
    catch (requestError) { setError(requestError); }
    finally { setBusy(false); }
  }
  return <>
    <ErrorNotice error={error} focus fields={{ name: { id: "account-name", label: "Account display name" }, email: { id: "account-email", label: "Email address" }, staff_full_name: { id: "staff-full-name", label: "Staff identity name" }, password: { id: "account-password", label: "Initial password" }, password_confirmation: { id: "account-password-confirm", label: "Confirm password" } }} /><form onSubmit={submit} aria-busy={busy || undefined}><div className="form-grid">
      <Field label="Account display name" name="account-name" error={error?.errors?.name}><input id="account-name" maxLength="255" value={values.name} onChange={(event) => setValues({ ...values, name: event.target.value })} required /></Field>
      <Field label="Email address" name="account-email" error={error?.errors?.email}><input id="account-email" type="email" maxLength="255" value={values.email} onChange={(event) => setValues({ ...values, email: event.target.value })} required /></Field>
      <Field label="Staff identity name" name="staff-full-name" error={error?.errors?.staff_full_name}><input id="staff-full-name" maxLength="120" value={values.staff_full_name} onChange={(event) => setValues({ ...values, staff_full_name: event.target.value })} required /></Field>
      <Field label="Initial password" name="account-password" error={error?.errors?.password} hint="At least 12 characters."><input id="account-password" type="password" minLength="12" autoComplete="new-password" value={values.password} onChange={(event) => setValues({ ...values, password: event.target.value })} required /></Field>
      <Field label="Confirm password" name="account-password-confirm" error={error?.errors?.password_confirmation}><input id="account-password-confirm" type="password" minLength="12" autoComplete="new-password" value={values.password_confirmation} onChange={(event) => setValues({ ...values, password_confirmation: event.target.value })} required /></Field>
    </div><div className="form-actions"><button className="button button-primary" type="submit" disabled={busy}>{busy ? "Creating account…" : "Create staff account"}</button></div></form>
  </>;
}

export function AccountsPage() {
  const notify = useSuccessToast();
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [pageNumber, setPageNumber] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const query = { per_page: 20, page: pageNumber, q: appliedSearch || undefined };
  const resource = useApiResource("admin-accounts-" + JSON.stringify(query), () => api("accounts", { query }));
  return <>
    <PageHeading eyebrow="ADMINISTRATION" title="Account administration" description="View user accounts and manage staff accounts and administrator permissions." action={<button className="button button-primary" type="button" onClick={() => setShowCreate(true)}>Create staff account</button>} />
    <FormDialog open={showCreate} title="Create staff account" description="New staff accounts are active and start without administrator access." onClose={() => setShowCreate(false)}><CreateStaffAccount onCreated={(row) => { notify("Staff account created.", "account-" + row.id); setShowCreate(false); resource.reload(); }} /></FormDialog>
    <Panel title="Account directory">
      <form className="admin-search" onSubmit={(event) => { event.preventDefault(); setPageNumber(1); setAppliedSearch(search); }}><Field label="Search accounts" name="account-search" error={resource.error?.errors?.q}><input id="account-search" type="search" placeholder="Name, email, or staff identity…" value={search} onChange={(event) => setSearch(event.target.value)} /></Field><button className="button button-secondary" type="submit">Search</button></form>
      {resource.loading ? <LoadingState label="Loading accounts…" /> : resource.error ? <ErrorNotice error={resource.error} fields={{ q: { id: "account-search", label: "Search accounts" } }} focus={resource.error.status === 422} /> : <>
      <h3>User accounts</h3>
      <DataTable caption="User accounts" rows={resource.rows.filter(row => row.can_manage !== true)} rowKey={row => row.id} emptyTitle="No user accounts on this page" columns={[
        { key: "name", label: "Account", render: row => <><strong>{row.name}</strong><small className="table-subline">{row.email}</small></> },
        { key: "active", label: "Account state", render: row => <StatusBadge value={row.is_active ? "ACTIVE" : "DEACTIVATED"} /> },
      ]} />
      <h3>Staff accounts</h3>
      <DataTable caption="Staff accounts" rows={resource.rows.filter(row => row.can_manage === true)} rowKey={(row) => row.id} emptyTitle="No staff accounts on this page" columns={[
        { key: "name", label: "Account", render: (row) => <><strong>{row.name}</strong><small className="table-subline">{row.email}</small></> },
        { key: "staff", label: "Staff identity", render: (row) => row.staff?.full_name || "No staff link" },
        { key: "admin", label: "Administrator", render: (row) => row.is_account_admin ? "Yes" : "No" },
        { key: "active", label: "Account state", render: (row) => <StatusBadge value={row.is_active ? "ACTIVE" : "DEACTIVATED"} /> },
        { key: "open", label: "Manage", render: (row) => <Link to={"/admin/accounts/" + row.id}>Manage</Link> },
      ]} /></>}
      {!resource.loading && !resource.error && <><p className="muted-copy">Search and pagination cover both account lists. User accounts are read-only.</p><Pager page={resource.page} onPage={setPageNumber} /></>}
    </Panel>
  </>;
}

export function AccountDetailPage() {
  const notify = useSuccessToast();
  const confirm = useConfirm();
  const { refreshIdentity } = useAuth();
  const { accountId } = useParams();
  const resource = useApiResource("admin-account-" + accountId, () => api("accounts/" + accountId));
  const [values, setValues] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const account = resource.payload?.data;
  const form = values || account;
  async function save(event) {
    event.preventDefault(); if (busy) return; setBusy(true); setError(null);
    try { await api("accounts/" + accountId, { method: "PATCH", body: { name: values?.name ?? account.name, email: values?.email ?? account.email } }); notify("Staff account updated."); setValues(null); resource.reload(); }
    catch (requestError) { setError(requestError); }
    finally { setBusy(false); }
  }
  async function changeAdmin() {
    if (busy) return;
    const next = !account.is_account_admin;
    if (!await confirm((next ? "Grant" : "Remove") + " administrator permission for " + account.name + "?")) return;
    setBusy(true); setError(null);
    try { await api("accounts/" + accountId + "/administrator", { method: "PUT", body: { is_account_admin: next } }); notify(next ? "Staff administrator permission granted." : "Staff administrator permission removed."); await refreshIdentity(); resource.reload(); }
    catch (requestError) { setError(requestError); }
    finally { setBusy(false); }
  }
  async function deactivate() {
    if (busy) return;
    if (!await confirm("Deactivate this account? It will retain its staff history, but will lose API access.")) return;
    setBusy(true); setError(null);
    try { await api("accounts/" + accountId + "/deactivate", { method: "POST" }); notify("Staff account deactivated."); resource.reload(); }
    catch (requestError) { setError(requestError); }
    finally { setBusy(false); }
  }
  if (resource.loading) return <LoadingState label="Loading staff account…" />;
  if (resource.error) return <><PageHeading eyebrow="ADMINISTRATION" title="Staff account" /><ErrorNotice error={resource.error} /></>;
  if (account.can_manage !== true) return <>
    <PageHeading title="User account" action={<Link className="button button-secondary" to="/admin/accounts">Back to accounts</Link>} />
    <Panel title="Account information" description="Read-only. Account holders manage their own profile and password.">
      <dl className="detail-list"><div><dt>Name</dt><dd>{account.name}</dd></div><div><dt>Email address</dt><dd>{account.email}</dd></div><div><dt>Account state</dt><dd>{account.is_active ? "Active" : "Deactivated"}</dd></div></dl>
    </Panel>
  </>;
  return <>
    <PageHeading eyebrow="ADMINISTRATION" title={account.name} description={"Account #" + account.id + " · staff identity " + (account.staff?.full_name || "not linked")} action={<Link className="button button-secondary" to="/admin/accounts">Back to accounts</Link>} />
    <ErrorNotice error={error} focus fields={{ name: { id: "edit-account-name", label: "Account display name" }, email: { id: "edit-account-email", label: "Email address" } }} />
    <div className="account-detail-grid">
      <Panel title="Account details"><form onSubmit={save}><div className="auth-form-stack">
        <Field label="Account display name" name="edit-account-name" error={error?.errors?.name}><input id="edit-account-name" maxLength="255" value={form?.name || ""} onChange={(event) => setValues({ ...(values || account), name: event.target.value })} required /></Field>
        <Field label="Email address" name="edit-account-email" error={error?.errors?.email}><input id="edit-account-email" type="email" value={form?.email || ""} onChange={(event) => setValues({ ...(values || account), email: event.target.value })} required /></Field>
        <Field label="Staff identity name" name="immutable-staff-name"><input id="immutable-staff-name" value={account.staff?.full_name || "No linked staff record"} readOnly /><small>This identity is retained in item and review history.</small></Field>
      </div><div className="form-actions"><button className="button button-primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Save account details"}</button></div></form></Panel>
      <Panel title="Permissions and access" description="Role and active state are checked from the current account record on every protected request.">
        <dl className="detail-list"><div><dt>Administrator</dt><dd>{account.is_account_admin ? "Yes" : "No"}</dd></div><div><dt>Account state</dt><dd>{account.is_active ? "Active" : "Deactivated"}</dd></div><div><dt>Staff ID</dt><dd>{account.staff?.staff_id ?? "—"}</dd></div></dl>
        <div className="form-actions"><button className="button button-secondary" type="button" disabled={busy || !account.is_active || !account.staff} onClick={changeAdmin}>{account.is_account_admin ? "Remove administrator" : "Grant administrator"}</button>{account.is_active && <button className="button button-danger" type="button" disabled={busy} onClick={deactivate}>Deactivate account</button>}</div>
        {!account.staff && <p className="muted-copy">Administrator permission is available only to linked staff accounts.</p>}
        {!account.is_active && <p className="muted-copy">This account cannot be reactivated here. Existing staff and item history remain intact.</p>}
      </Panel>
    </div>
  </>;
}

const resources = {
  categories: { label: "Categories", path: "categories", id: "category_id", fields: [{ key: "category_name", label: "Category name", max: 60 }] },
  locations: { label: "Storage locations", path: "storage-locations", id: "location_id", fields: [{ key: "location_code", label: "Location code", max: 30 }, { key: "location_description", label: "Description", max: 200 }] },
};

export function ReferenceDataPage() {
  const notify = useSuccessToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const type = resources[searchParams.get("type")] ? searchParams.get("type") : "categories";
  useEffect(() => { setEditing(null); setFormValues({}); setPageNumber(1); setSearch(""); setAppliedSearch(""); setError(null); }, [type]);
  const config = resources[type];
  const noun = type === "categories" ? "category" : "storage location";
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [pageNumber, setPageNumber] = useState(1);
  const [editing, setEditing] = useState(null);
  const [formValues, setFormValues] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const query = { per_page: 20, page: pageNumber, q: appliedSearch || undefined };
  const resource = useApiResource("reference-" + type + "-" + JSON.stringify(query), () => api(config.path, { query }), true);

  function chooseType(nextType) { setSearchParams({ type: nextType }); setPageNumber(1); setEditing(null); setFormValues({}); setFormOpen(false); setError(null); }
  function edit(row) { setEditing(row); setFormValues(Object.fromEntries(config.fields.map((field) => [field.key, row[field.key] || ""]))); setError(null); setFormOpen(true); }
  async function save(event) {
    event.preventDefault(); if (busy) return; setBusy(true); setError(null);
    try {
      const path = config.path + (editing ? "/" + editing[config.id] : "");
      const response = await api(path, { method: editing ? "PATCH" : "POST", body: formValues });
      notify((type === "categories" ? "Category" : "Storage location") + (editing ? " updated." : " created."), editing ? undefined : config.path + "-create-" + response.data[config.id]);
      setEditing(null); setFormValues({}); setFormOpen(false); resource.reload();
      return response;
    } catch (requestError) { setError(requestError); }
    finally { setBusy(false); }
  }

  const columns = [
    ...config.fields.map((field) => ({ key: field.key, label: field.label })),
    { key: "edit", label: "Actions", render: (row) => <button className="button button-secondary button-small" type="button" onClick={() => edit(row)}>Edit</button> },
  ];
  return <>
    <PageHeading title={config.label} description={type === "categories" ? "Add or update the categories used to describe found items." : "Add or update the locations where staff store found items."} />
    <Panel className="reference-tabs"><nav aria-label="Categories and storage locations">{Object.entries(resources).map(([key, item]) => <button key={key} type="button" className={"reference-tab" + (type === key ? " active" : "")} aria-current={type === key ? "page" : undefined} onClick={() => chooseType(key)}>{item.label}</button>)}</nav></Panel>
    <div className="reference-layout">
      <Panel title={config.label + " actions"} description={"Add a " + noun + " or edit one in the list."}><button className="button button-primary" type="button" onClick={() => { setEditing(null); setFormValues({}); setError(null); setFormOpen(true); }}>Add {noun}</button></Panel>
      <FormDialog discardLabel="Discard changes" open={formOpen} title={editing ? "Update " + noun : "Add " + noun} onClose={() => { setFormOpen(false); setEditing(null); setFormValues({}); }}><ErrorNotice error={error} focus fields={Object.fromEntries(config.fields.map(field => [field.key, { id: "reference-" + field.key, label: field.label }]))} /><form onSubmit={save} aria-busy={busy || undefined}><div className="auth-form-stack">{config.fields.map((field) => <Field key={field.key} label={field.label} hint={field.key === "location_code" ? "Use the code staff recognise on the storage shelf or room." : undefined} name={"reference-" + field.key} error={error?.errors?.[field.key]}><input id={"reference-" + field.key} maxLength={field.max} value={formValues[field.key] || ""} onChange={(event) => setFormValues({ ...formValues, [field.key]: event.target.value })} required /></Field>)}</div>
          <div className="form-actions"><button className="button button-primary" type="submit" disabled={busy}>{busy ? "Saving…" : editing ? "Save changes" : "Add " + noun}</button></div>
        </form></FormDialog>
      <Panel title={config.label + " directory"}>
        <form className="admin-search" onSubmit={(event) => { event.preventDefault(); setPageNumber(1); setAppliedSearch(search); }}><Field label={"Search " + config.label.toLowerCase()} name="reference-search" error={resource.error?.errors?.q}><input id="reference-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} /></Field><button className="button button-secondary" type="submit">Search</button></form>
        {resource.loading && !resource.payload ? <LoadingState label={"Loading " + config.label.toLowerCase() + "…"} /> : resource.error ? <ErrorNotice error={resource.error} fields={{ q: { id: "reference-search", label: "Search" } }} focus={resource.error.status === 422} /> : <DataTable caption={config.label} rows={resource.rows} rowKey={(row) => row[config.id]} emptyTitle={"No " + config.label.toLowerCase() + (appliedSearch ? " match" : " yet")} emptyText={appliedSearch ? "Try another search or clear it to see all " + config.label.toLowerCase() + "." : "Add a " + noun + " to make it available for item intake."} emptyAction={appliedSearch ? <button type="button" className="button button-secondary" onClick={() => { setSearch(""); setAppliedSearch(""); setPageNumber(1); }}>Clear search</button> : undefined} columns={columns} />}
        {!resource.loading && !resource.error && <Pager page={resource.page} onPage={setPageNumber} />}
      </Panel>
    </div>
  </>;
}
