import { useSuccessToast } from "../components/Toast";
import { useState } from "react";
import { useNavigate } from "react-router";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { ErrorNotice, Field, LoadingState, PageHeading, Panel, SuccessNotice, useApiResource } from "../components/ui";
import "./ChangePasswordPage.css";

export default function ChangePasswordPage() {
  const notify = useSuccessToast();
  const { session, clearLocalSession } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const needsSetup = session.identity.has_local_password === false;
  const security = useApiResource("password-setup-status", async () => needsSetup ? api("me/security") : null);
  const fields = { current_password: { id: "current-password", label: "Current password" }, password: { id: "new-password", label: "New password" }, password_confirmation: { id: "password-confirm", label: "Confirm new password" } };

  async function requestSetup() {
    if (busy) return;
    setBusy(true); setError(null); setMessage("");
    try { setMessage((await api("me/password/setup-email", { method: "POST" })).message); }
    catch (failure) { setError(failure); }
    finally { setBusy(false); }
  }

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      await api("auth/password", { method: "POST", body: {
        current_password: form.get("current_password"),
        password: form.get("password"),
        password_confirmation: form.get("password_confirmation"),
      } });
      clearLocalSession();
      notify("Password changed.");
      navigate("/login?password=changed", { replace: true });
    } catch (requestError) {
      setError(requestError);
    } finally {
      formElement.reset();
      setBusy(false);
    }
  }

  return <>
    <PageHeading eyebrow="ACCOUNT SECURITY" title={session.role === "staff" ? "Change password" : "Change your password"} description="Changing your password signs you out. Sign in again after saving." />
    {!needsSetup ? <Panel className="account-security-card">
      <ErrorNotice error={error} focus fields={fields} />
      <form onSubmit={submit} aria-busy={busy || undefined}>
        <div className="security-fields">
          <Field label="Current password" name="current-password" error={error?.errors?.current_password}><input id="current-password" name="current_password" type="password" autoComplete="current-password" required /></Field>
          <Field label="New password" name="new-password" error={error?.errors?.password} hint="At least 12 characters."><input id="new-password" name="password" type="password" autoComplete="new-password" minLength="12" required /></Field>
          <Field label="Confirm new password" name="password-confirm" error={error?.errors?.password_confirmation}><input id="password-confirm" name="password_confirmation" type="password" autoComplete="new-password" minLength="12" required /></Field>
        </div>
        <div className="form-actions"><button className="button button-primary" type="submit" disabled={busy}>{busy ? "Updating…" : "Change password"}</button></div>
      </form>
    </Panel> : <Panel className="account-security-card" title="Set a Reclaim password">
      <p>Your account does not have a Reclaim password yet. Request a single-use link at your verified email. Reclaim never receives your Google password.</p>
      {security.loading && <LoadingState label="Checking password setup eligibility…" />}
      <ErrorNotice error={error || security.error} focus retry={false} /><SuccessNotice>{message}</SuccessNotice>
      {security.error && <button className="button button-secondary" type="button" onClick={security.reload}>Retry password setup check</button>}
      {security.payload?.data && <>
        {!security.payload.data.email_verified && <p>Verify your Reclaim email before requesting password setup.</p>}
        <button className="button button-primary" type="button" disabled={busy || !security.payload.data.email_verified} onClick={requestSetup}>{busy ? "Sending setup link…" : "Send password setup link"}</button>
      </>}
    </Panel>}
  </>;
}
