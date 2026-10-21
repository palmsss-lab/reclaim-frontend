import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { googlePopup } from "../auth/google";
import { useAuth } from "../auth/AuthContext";
import { ErrorNotice } from "./ui";
import "./GoogleButton.css";
import { afterSignIn } from "../auth/returnPath";

export function GoogleButton({ linking = false, currentPassword = "", onSuccess, disabled = false, returnTo }) {
  const { acceptGoogleLogin } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const pending = useRef(null);
  useEffect(() => () => pending.current?.abort(), []);
  async function start() {
    if (busy) return;
    const controller = new AbortController(); pending.current = controller;
    setBusy(true); setError(null);
    try {
      const response = await googlePopup({ linking, currentPassword, signal: controller.signal });
      if (linking) onSuccess?.();
      else {
        const session = await acceptGoogleLogin(response);
        if (onSuccess) onSuccess(session);
        else navigate(afterSignIn(session, returnTo), { replace: true });
      }
    } catch (failure) { if (!controller.signal.aborted) setError(failure); }
    finally { if (!controller.signal.aborted) setBusy(false); pending.current = null; }
  }
  return <div className="google-signin"><ErrorNotice error={error} />
    <button type="button" className="button button-secondary google-button" disabled={disabled || busy} onClick={start} aria-busy={busy}>
      {busy ? "Waiting for Google…" : linking ? "Link Google account" : "Continue with Google"}
    </button>
    {busy && <p role="status">Complete Google sign-in in the popup window.</p>}
  </div>;
}
