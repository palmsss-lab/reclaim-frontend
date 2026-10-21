import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import { ErrorNotice, Field } from "./ui";
import { useSuccessToast } from "./Toast";

export function UsernameSettings({ account }) {
  const [editing, setEditing] = useState(false);
  const editButton = useRef(null);
  const previouslyEditing = useRef(false);
  useEffect(() => {
    if (editing) document.getElementById("account-username")?.focus();
    else if (previouslyEditing.current) editButton.current?.focus();
    previouslyEditing.current = editing;
  }, [editing]);
  const [username, setUsername] = useState(account.username || "");
  const [savedUsername, setSavedUsername] = useState(account.username);
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const notify = useSuccessToast();
  const [busy, setBusy] = useState(false);
  async function save(event) {
    event.preventDefault(); if (busy) return; setBusy(true); setError(null);
    try {
      const response = await api("me/username", { method: "PATCH", body: { username, ...(account.has_local_password ? { current_password: password } : {}) } });
      setUsername(response.data.username); setSavedUsername(response.data.username); notify("Username updated."); setEditing(false);
    } catch (failure) { setError(failure); }
    finally { setPassword(""); setBusy(false); }
  }
  return <section className="username-settings" aria-labelledby="username-settings-heading">
    <h3 id="username-settings-heading">Sign-in username</h3>
    <p>{savedUsername ? <><strong>{savedUsername}</strong> · Your email also works for sign-in.</> : "You have not added a username."}</p>
    <ErrorNotice error={error} title="Username could not be saved" focus fields={{ username: { id: "account-username", label: "Username" }, current_password: { id: "username-password", label: "Confirm Reclaim password" } }} />
    {!editing ? <button ref={editButton} className="button button-secondary" type="button" onClick={() => setEditing(true)}>{savedUsername ? "Edit username" : "Add a username"}</button> : <form onSubmit={save} className="auth-form-stack">
      <p>{account.has_local_password ? "Confirm your Reclaim password to save changes." : "A username does not create a password. Continue using Google until you set a separate Reclaim password."}</p>
      <Field label="Username" name="account-username" error={error?.errors?.username} hint="3–30 characters. Start with a letter; use letters, numbers, dots, underscores or hyphens. Not case-sensitive."><input id="account-username" autoComplete="username" autoCapitalize="none" spellCheck={false} minLength="3" maxLength="30" pattern="[A-Za-z][A-Za-z0-9._\-]{2,29}" value={username} onChange={event => setUsername(event.target.value)} required disabled={busy} /></Field>
      {account.has_local_password && <Field label="Confirm Reclaim password" name="username-password" error={error?.errors?.current_password}><input id="username-password" type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required disabled={busy} /></Field>}
      <div><button className="button button-primary" type="submit" disabled={busy}>{busy ? "Saving username…" : "Save username"}</button></div>
      <div><button className="button button-secondary" type="button" disabled={busy} onClick={() => { setEditing(false); setUsername(savedUsername || ""); setPassword(""); setError(null); }}>Cancel</button></div>
    </form>}
  </section>;
}
