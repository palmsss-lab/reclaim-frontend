import { useState } from "react";
import { Link } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { UsernameSettings } from "./UsernameSettings";
import "./UsernameSettings.css";
import { api } from "../api/client";
import { GoogleButton } from "./GoogleButton";
import { ErrorNotice, Field, LoadingState, Panel, useApiResource } from "./ui";
import { useSuccessToast } from "./Toast";

export function AccountMethods({ profileLayout = false }) {
  const { session } = useAuth();
  const resource = useApiResource("account-security", () => api("me/security"));
  const [password, setPassword] = useState("");
  const notify = useSuccessToast();
  const data = resource.payload?.data;
  return <Panel title={profileLayout ? "Account settings" : "Username and sign-in methods"}>
    {resource.loading && <LoadingState label="Loading sign-in methods…" />}
    <ErrorNotice error={resource.error} retry={false} />
    {resource.error && <button type="button" className="button button-secondary" onClick={resource.reload}>Retry sign-in methods</button>}
    {data && <>
      <UsernameSettings account={data} />
      <section className="account-sign-in-methods" aria-label="Sign-in methods">
      {profileLayout && <h3>Sign-in methods</h3>}
      <div className="account-sign-in-status">
      <p>Google sign-in: <strong>{data.google_linked ? "Linked" : "Not linked"}</strong></p>
      <p>Reclaim password: <strong>{data.has_local_password ? "Available" : "Not set"}</strong></p>
      </div>
      {!data.google_linked && data.has_local_password && <>
        <p>Confirm your Reclaim password, then choose the Google account you want to link. Matching emails never link automatically.</p>
        <Field label="Confirm Reclaim password to link Google" name="google-link-password"><input id="google-link-password" type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} /></Field>
        <GoogleButton linking currentPassword={password} disabled={!password} onSuccess={() => { setPassword(""); notify("Google sign-in linked."); resource.reload(); }} />
      </>}
      {!data.has_local_password && <>
        <Link className="button button-secondary" to={session.role === "staff" ? "/staff/security" : "/change-password"}>Set Reclaim password</Link>
      </>}
      {data.google_linked && <p>Google unlinking is not offered here. Your linked Google identity remains available when you set a Reclaim password.</p>}
      </section>
    </>}
  </Panel>;
}
