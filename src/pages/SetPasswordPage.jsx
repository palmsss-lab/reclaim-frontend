import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { GoogleButton } from "../components/GoogleButton";
import { ErrorNotice, Field, PageHeading } from "../components/ui";
import "./AuthPages.css";
import { readSetupProof, clearSetupProof } from "../auth/passwordSetupProof";

export default function SetPasswordPage() {
  const notify = useSuccessToast();
  const { session, clearLocalSession } = useAuth();
  const navigate = useNavigate();
  const [proof] = useState(() => readSetupProof(window.location.search));
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { window.history.replaceState(window.history.state, "", window.location.pathname); }, []);
  async function submit(event) {
    event.preventDefault(); if (busy) return; const form = event.currentTarget;
    const values = new FormData(form); setBusy(true); setError(null);
    try {
      await api("me/password/setup", { method: "POST", body: { proof,
        password: values.get("password"), password_confirmation: values.get("password_confirmation") } });
      clearSetupProof(); clearLocalSession(); notify("Password set."); navigate("/login?password=changed", { replace: true });
    } catch (failure) { setError(failure); }
    finally { form.reset(); setBusy(false); }
  }
  return <div className="auth-layout"><section className="panel auth-content">
    <PageHeading title="Set Reclaim password" description="Choose a separate password for the same account. Your Google password stays with Google." />
    <ErrorNotice error={error} focus fields={{ password: { id: "setup-password", label: "New Reclaim password" }, password_confirmation: { id: "setup-confirm", label: "Confirm Reclaim password" } }} />
    {!proof ? <p>This setup link is missing or invalid. Request a new one from <Link to={session?.role === "staff" ? "/staff/security" : "/change-password"}>Change password</Link>.</p> : !session ? <>
      <p>Sign in with the linked Google account to verify which Reclaim account this password belongs to.</p>
      <GoogleButton onSuccess={() => {}} />
    </> : <form onSubmit={submit} aria-busy={busy || undefined}><div className="auth-form-stack">
      <Field label="New Reclaim password" name="setup-password" hint="At least 12 characters." error={error?.errors?.password}><input id="setup-password" name="password" type="password" minLength="12" maxLength="255" autoComplete="new-password" required /></Field>
      <Field label="Confirm Reclaim password" name="setup-confirm" error={error?.errors?.password_confirmation}><input id="setup-confirm" name="password_confirmation" type="password" minLength="12" maxLength="255" autoComplete="new-password" required /></Field>
    </div><button className="button button-primary auth-submit" type="submit" disabled={busy}>{busy ? "Setting password…" : "Set Reclaim password"}</button></form>}
    {proof && <p>Need a new link? <Link to={session?.role === "staff" ? "/staff/security" : "/change-password"}>Request another setup email</Link>.</p>}
  </section></div>;
}
import { useSuccessToast } from "../components/Toast";
