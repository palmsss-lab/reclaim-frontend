import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { api, ApiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useSuccessToast } from "../components/Toast";
import { ErrorNotice, Field, PageHeading, Panel, SuccessNotice } from "../components/ui";
import "./AuthPages.css";
import { GoogleButton } from "../components/GoogleButton";
import { FormDialog } from "../components/FormDialog";
import { PasswordInput } from "../components/PasswordInput";
import { ResetCodeInput } from "../components/ResetCodeInput";
import { afterSignIn, authPath, returnPathFrom } from "../auth/returnPath";

const loginFields = { login: { id: "login-identifier", label: "Username or email" }, email: { id: "login-identifier", label: "Username or email" }, password: { id: "login-password", label: "Password" } };
const registrationFields = Object.fromEntries([["full_name", "Full name"], ["username", "Username"], ["contact_details", "Contact details"], ["email", "Email address"], ["password", "Password"], ["password_confirmation", "Confirm password"]].map(([key, label]) => [key, { id: key === "username" ? "register-username" : key, label }]));

function AuthFrame({ eyebrow, title, description, children }) {
  return <div className="auth-layout"><section className="auth-content panel"><PageHeading eyebrow={eyebrow} title={title} description={description} />{children}</section></div>;
}

export function LoginPage() {
  const { login, sessionNotice } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const destination = returnPathFrom(location);
  const [values, setValues] = useState({ login: "", password: "" });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice] = useState(location.state?.notice || "");
  const [resetSuccess] = useState(new URLSearchParams(location.search).get("reset") === "success" ? "Your password has been reset. Sign in with the new password." : "");
  const [passwordChanged] = useState(new URLSearchParams(location.search).get("password") === "changed" ? "Your password changed. Sign in again with the new password." : "");

  async function submit(event) {
    event.preventDefault(); if (busy) return; setBusy(true); setError(null);
    try {
      const session = await login(values);
      navigate(afterSignIn(session, destination), { replace: true });
    } catch (requestError) { setError(requestError); }
    finally { setValues((current) => ({ ...current, password: "", ...(Object.hasOwn(current, "password_confirmation") ? { password_confirmation: "" } : {}) })); setBusy(false); }
  }

  return <AuthFrame eyebrow="WELCOME BACK" title="Sign in to Reclaim" description="Use your Reclaim account to manage reports and claims.">
    {(notice || sessionNotice) && <div className="notice notice-info" role="status">{notice || sessionNotice}</div>}<SuccessNotice>{resetSuccess || passwordChanged}</SuccessNotice><ErrorNotice error={error} title="Couldn't sign in" fields={loginFields} focus />
    <Panel className="auth-card"><form onSubmit={submit} aria-busy={busy || undefined}>
      <div className="auth-form-stack">
        <Field label="Username or email" name="login-identifier" error={error?.errors?.login || error?.errors?.email}><input id="login-identifier" name="login" type="text" autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength="255" value={values.login} onChange={(event) => setValues({ ...values, login: event.target.value })} required /></Field>
        <Field label="Password" name="login-password" error={error?.errors?.password}><PasswordInput id="login-password" name="password" autoComplete="current-password" value={values.password} onChange={(event) => setValues({ ...values, password: event.target.value })} required /></Field>
      </div>
      <div className="auth-inline-link"><Link to={authPath("/forgot-password", destination)}>Forgot password?</Link></div>
      <button className="button button-primary auth-submit" type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
      <p className="auth-bottom-copy">New to Reclaim? <Link to={authPath("/register", destination)}>Create an account</Link></p>
    </form></Panel>
    <GoogleButton returnTo={destination} />
  </AuthFrame>;
}

export function RegistrationResult({ result, signInPath }) {
  const accepted = result?.verification_email?.status === "accepted";
  return <div className={"notice " + (accepted ? "notice-info" : "notice-error")} role={accepted ? "status" : "alert"}>
    <strong>Account created</strong>
    <span>{accepted ? "Your verification code email was accepted for sending. Sign in and enter the six-digit code within 10 minutes. Check your inbox and spam folder." : "Your verification email was not confirmed. Sign in and request a new verification email; do not register again."}</span>
    <Link to={signInPath}>Sign in to verify your email</Link>
  </div>;
}

export function RegisterPage() {
  const destination = returnPathFrom(useLocation());
  const [formOpen, setFormOpen] = useState(false);
  const [values, setValues] = useState({ full_name: "", contact_details: "", username: "", email: "", password: "", password_confirmation: "" });
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault(); if (busy) return; setBusy(true); setError(null); setResult(null);
    try {
      const response = await api("auth/register", { method: "POST", body: values });
      setResult(response);
      setFormOpen(false);
      setValues({ full_name: "", contact_details: "", username: "", email: "", password: "", password_confirmation: "" });
    } catch (requestError) {
      if (requestError.code === "account_created_email_failed") {
        setResult({ verification_email: { status: "failed" } });
        setFormOpen(false);
        setValues({ full_name: "", contact_details: "", username: "", email: "", password: "", password_confirmation: "" });
      } else setError(requestError);
    }
    finally { setBusy(false); }
  }

  return <AuthFrame eyebrow="GET STARTED" title="Create your account" description="Register as a community member to report found items and claim a match.">
    {result && <RegistrationResult result={result} signInPath={authPath("/login", destination || "/verify-email")} />}
    <Panel className="auth-card">{!result && <button className="button button-primary auth-submit" type="button" onClick={() => { setError(null); setFormOpen(true); }}>Create account</button>}
      <p className="auth-bottom-copy">Already registered? <Link to={authPath("/login", destination)}>Sign in</Link></p>
    </Panel>
    <FormDialog discardLabel="Discard changes" open={formOpen} title="Create your account" onClose={() => { setFormOpen(false); setValues({ full_name: "", contact_details: "", username: "", email: "", password: "", password_confirmation: "" }); setError(null); }}><ErrorNotice error={error} fields={registrationFields} focus /><form onSubmit={submit} aria-busy={busy || undefined}>
      <div className="auth-form-stack">
        <Field label="Full name" name="full_name" error={error?.errors?.full_name}><input id="full_name" name="full_name" autoComplete="name" maxLength="120" value={values.full_name} onChange={(event) => setValues({ ...values, full_name: event.target.value })} required /></Field>
        <Field label="Username" name="register-username" error={error?.errors?.username} hint="3–30 characters. Start with a letter; use letters, numbers, dots, underscores or hyphens. Not case-sensitive."><input id="register-username" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} minLength="3" maxLength="30" pattern="[A-Za-z][A-Za-z0-9._\-]{2,29}" value={values.username} onChange={event => setValues({ ...values, username: event.target.value })} required /></Field>
        <Field label="Contact details" name="contact_details" error={error?.errors?.contact_details}><input id="contact_details" name="contact_details" autoComplete="tel" maxLength="200" value={values.contact_details} onChange={(event) => setValues({ ...values, contact_details: event.target.value })} required /></Field>
        <Field label="Email address" name="email" error={error?.errors?.email}><input id="email" name="email" type="email" autoComplete="email" maxLength="255" value={values.email} onChange={(event) => setValues({ ...values, email: event.target.value })} required /></Field>
        <Field label="Password" name="password" error={error?.errors?.password} hint="At least 12 characters."><PasswordInput id="password" name="password" autoComplete="new-password" minLength="12" value={values.password} onChange={(event) => setValues({ ...values, password: event.target.value })} required /></Field>
        <Field label="Confirm password" name="password_confirmation" error={error?.errors?.password_confirmation}><PasswordInput id="password_confirmation" name="password_confirmation" autoComplete="new-password" minLength="12" value={values.password_confirmation} onChange={(event) => setValues({ ...values, password_confirmation: event.target.value })} required /></Field>
      </div>
      <button className="button button-primary auth-submit" type="submit" disabled={busy}>{busy ? "Creating account…" : "Create account"}</button>
    </form></FormDialog>
    <GoogleButton returnTo={destination} />
  </AuthFrame>;
}

export function ForgotPasswordPage() {
  const location = useLocation();
  const destination = returnPathFrom(location);
  const navigate = useNavigate();
  const [email, setEmail] = useState(location.state?.email || "");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault(); if (busy) return; setBusy(true); setError(null);
    try {
      const response = await api("auth/password/forgot", { method: "POST", body: { email } });
      navigate(authPath("/reset-password", destination), { state: { email, notice: response.message, resendAt: Date.now() + 60000 } });
    } catch (requestError) { setError(requestError); }
    finally { setBusy(false); }
  }
  return <AuthFrame eyebrow="ACCOUNT HELP" title="Reset your password" description="Enter your account email to request a six-digit reset code.">
    <p className="muted-copy">If you use Google and have not set a Reclaim password, sign in with Google, then open Change password from your account menu to request a setup link.</p>
    <ErrorNotice error={error} title="Couldn't request a reset code" focus fields={{ email: { id: "forgot-email", label: "Email address" } }} />
    <Panel className="auth-card"><form onSubmit={submit} aria-busy={busy || undefined}><Field label="Email address" name="forgot-email" error={error?.errors?.email}><input id="forgot-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></Field><button className="button button-primary auth-submit" type="submit" disabled={busy}>{busy ? "Sending..." : "Send reset code"}</button><p className="auth-bottom-copy"><Link to={authPath("/login", destination)}>Back to sign in</Link></p></form></Panel>
  </AuthFrame>;
}

export function ResetPasswordPage() {
  const location = useLocation();
  const destination = returnPathFrom(location);
  const email = location.state?.email || "";
  const [code, setCode] = useState(Array(6).fill(""));
  const [authorization, setAuthorization] = useState("");
  const [complete, setComplete] = useState(false);
  const [values, setValues] = useState({ password: "", password_confirmation: "" });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState("verify");
  const pending = useRef(false);
  const confirmation = useRef(null);
  const [notice, setNotice] = useState(location.state?.notice || "");
  const [resendAt, setResendAt] = useState(location.state?.resendAt || 0);
  const [now, setNow] = useState(Date.now());
  const remaining = Math.max(0, Math.ceil((resendAt - now) / 1000));
  const [legacyLink] = useState(new URLSearchParams(location.search).has("token"));
  useEffect(() => {
    if (legacyLink) window.history.replaceState(window.history.state, "", location.pathname);
  }, [legacyLink, location.pathname]);
  useEffect(() => {
    if (resendAt <= Date.now()) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [resendAt]);
  useEffect(() => { if (complete) confirmation.current?.focus(); }, [complete]);

  async function submit(event) {
    event.preventDefault(); if (pending.current) return;
    pending.current = true; setAction(authorization ? "reset" : "verify"); setBusy(true); setError(null);
    try {
      if (!authorization) {
        const response = await api("auth/password/verify-code", { method: "POST", body: { email, code: code.join("") } });
        if (!/^[a-f0-9]{64}$/.test(response?.data?.authorization || "")) throw new Error("Code verification was not confirmed.");
        setAuthorization(response.data.authorization);
        setCode(Array(6).fill("")); setNotice("");
      } else {
        await api("auth/password/reset", { method: "POST", body: { email, authorization, ...values } });
        setAuthorization(""); setComplete(true);
      }
    } catch (requestError) {
      if (requestError.errors?.authorization) setAuthorization("");
      setError(requestError);
    } finally {
      setValues({ password: "", password_confirmation: "" });
      pending.current = false; setBusy(false);
    }
  }
  async function resend() {
    if (pending.current || remaining > 0) return;
    pending.current = true; setAction("resend"); setBusy(true); setError(null);
    try {
      const response = await api("auth/password/forgot", { method: "POST", body: { email } });
      setNotice(response.message); setCode(Array(6).fill(""));
      const requestedAt = Date.now(); setNow(requestedAt); setResendAt(requestedAt + 60000);
    } catch (requestError) { setError(requestError); }
    finally { pending.current = false; setBusy(false); }
  }
  const requestLink = <Link to={authPath("/forgot-password", destination)} state={{ email }}>Request a reset code</Link>;
  if (complete) return <AuthFrame eyebrow="ACCOUNT HELP" title="Password reset" description="Your password has been changed.">
    <p ref={confirmation} tabIndex={-1} role="status">Sign in with your new password to continue.</p>
    <Link className="button button-primary auth-submit" to={authPath("/login", destination)}>Sign in</Link>
  </AuthFrame>;
  if (!email || legacyLink) return <AuthFrame eyebrow="ACCOUNT HELP" title="Request a reset code" description="Enter your email first so we can send a six-digit code.">
    {legacyLink && <p className="muted-copy">Password recovery now uses an email code. Request a new code to continue.</p>}
    {requestLink}
  </AuthFrame>;
  return <AuthFrame eyebrow="ACCOUNT HELP" title={authorization ? "Choose a new password" : "Enter reset code"}
    description={authorization ? "Code verified. Finish choosing your new password within five minutes." : "Enter the six-digit code from your email. Codes expire after 10 minutes."}>
    {!authorization && notice && <p className="muted-copy" role="status">{notice}</p>}
    <ErrorNotice error={error} title={error?.errors?.authorization ? "Request a new code" : action === "resend" ? "Couldn't request a reset code" : authorization ? "Couldn't reset your password" : "Couldn't verify your code"} focus
      fields={{ code: { id: "reset-code", label: "Reset code" }, authorization: { label: "Reset session" }, password: { id: "reset-password", label: "New password" }, password_confirmation: { id: "reset-password-confirm", label: "Confirm password" } }} />
    <Panel className="auth-card"><form onSubmit={submit} aria-busy={busy || undefined}>
      {authorization ? <div className="auth-form-stack">
        <Field label="New password" name="reset-password" error={error?.errors?.password} hint="At least 12 characters."><PasswordInput id="reset-password" autoComplete="new-password" minLength="12" maxLength="255" value={values.password} onChange={(event) => setValues({ ...values, password: event.target.value })} autoFocus required /></Field>
        <Field label="Confirm password" name="reset-password-confirm" error={error?.errors?.password_confirmation}><PasswordInput id="reset-password-confirm" autoComplete="new-password" minLength="12" maxLength="255" value={values.password_confirmation} onChange={(event) => setValues({ ...values, password_confirmation: event.target.value })} required /></Field>
      </div> : <ResetCodeInput value={code} onChange={setCode} error={error?.errors?.code} disabled={busy} />}
      <button className="button button-primary auth-submit" type="submit" disabled={busy}>{busy && action !== "resend" ? (authorization ? "Resetting..." : "Verifying...") : (authorization ? "Set new password" : "Verify code")}</button>
    </form>
      {!authorization && <div className="auth-bottom-copy">
        <button className="button button-secondary button-small" type="button" disabled={busy || remaining > 0} onClick={resend}>{busy && action === "resend" ? "Sending..." : "Resend code"}</button>
        {remaining > 0 && <p>You can resend in {remaining} seconds.</p>}
      </div>}
      <p className="auth-bottom-copy"><Link to={authPath("/forgot-password", destination)} state={{ email }}>Use a different email</Link></p>
    </Panel>
  </AuthFrame>;
}

export function VerifyEmailPage() {
  const notify = useSuccessToast();
  const destination = returnPathFrom(useLocation());
  const navigate = useNavigate();
  const { session, refreshIdentity } = useAuth();
  const [error, setError] = useState(null);
  const [message, setMessage] = useState("");
  const [code, setCode] = useState(Array(6).fill(""));
  const [busy, setBusy] = useState(false);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const pending = useRef(false);
  const success = useRef(null);
  const verified = session?.role === "user" && session.identity?.email_verified;
  const remaining = Math.max(0, Math.ceil((resendAt - now) / 1000));
  useEffect(() => {
    if (resendAt <= Date.now()) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [resendAt]);
  useEffect(() => { if (verified) success.current?.focus(); }, [verified]);
  // Clear private form state when the signed-in account changes.
  useEffect(() => { setCode(Array(6).fill("")); setError(null); setMessage(""); setResendAt(0); }, [session?.identity?.user_id]);
  async function resend() {
    if (pending.current || remaining > 0) return;
    pending.current = true; setBusy(true); setError(null); setMessage("");
    try {
      const response = await api("auth/email/verification-notification", { method: "POST" });
      setMessage(response?.message || "The email request was not confirmed. Check your inbox before retrying.");
      setCode(Array(6).fill(""));
      const requestedAt = Date.now(); setNow(requestedAt); setResendAt(requestedAt + 60000);
    } catch (requestError) { setError(requestError); }
    finally { pending.current = false; setBusy(false); }
  }
  async function refresh() {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(null);
    try {
      const current = await refreshIdentity();
      if (current) notify("Account status refreshed.");
      if (current?.identity?.email_verified && destination) navigate(destination, { replace: true });
    } catch (requestError) { setError(requestError); }
    finally { pending.current = false; setBusy(false); }
  }
  async function submit(event) {
    event.preventDefault(); if (pending.current) return;
    pending.current = true; setBusy(true); setError(null); setMessage("");
    try {
      const response = await api("auth/email/verify-code", { method: "POST", body: { code: code.join("") } });
      if (response?.data?.email_verified !== true) throw new ApiError("Email verification was not confirmed. Choose Refresh status before trying again.");
      setCode(Array(6).fill(""));
      const current = await refreshIdentity();
      if (current?.identity?.email_verified) {
        notify("Email verified.");
        if (destination) navigate(destination, { replace: true });
      }
    } catch (requestError) { setError(requestError); }
    finally { pending.current = false; setBusy(false); }
  }
  return <AuthFrame eyebrow="EMAIL VERIFICATION" title={verified ? "Your email is verified" : "Verify your email"} description="Email verification is required before creating reports or submitting a claim.">
    <ErrorNotice error={error} title="Email verification could not be completed" fields={{ code: { id: "verification-code", label: "Verification code" } }} focus /><SuccessNotice>{message}</SuccessNotice>
    <Panel className="auth-card">
      {verified ? <>
        <p ref={success} tabIndex={-1} role="status">You can now use your Reclaim reports and claims.</p>
        <Link className="button button-primary" to={destination || "/my"}>{destination ? "Continue" : "Go to My Reclaim"}</Link>
      </> : session?.role === "user" ? <>
        <p>Enter the six-digit code sent to your account email. Codes expire after 10 minutes. No email link is needed.</p>
        <form onSubmit={submit} aria-busy={busy || undefined}>
          <ResetCodeInput id="verification-code" label="Verification code" value={code} onChange={setCode} error={error?.errors?.code} disabled={busy} />
          <button className="button button-primary auth-submit" type="submit" disabled={busy}>{busy ? "Please wait..." : "Verify email"}</button>
        </form>
        <div className="form-actions">
          <button className="button button-secondary" type="button" onClick={resend} disabled={busy || remaining > 0}>Resend code</button>
          <button className="button button-secondary" type="button" onClick={refresh} disabled={busy}>Refresh status</button>
        </div>
        {remaining > 0 && <p>You can resend in {remaining} seconds.</p>}
        <p className="muted-copy">Check spam if the code has not arrived. Use the newest code. If you already used a verification link, choose Refresh status.</p>
      </> : !session ? <>
        <p>Sign in to the account you registered, then enter the code from your email here.</p>
        <div className="form-actions"><Link className="button button-primary" to={authPath("/login", "/verify-email" + (destination ? "?returnTo=" + encodeURIComponent(destination) : ""))}>Sign in to enter your code</Link><Link className="button button-secondary" to={authPath("/register", destination)}>Create account</Link></div>
      </> : <p>Your staff account does not require this verification form.</p>}
    </Panel>
  </AuthFrame>;
}
