import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { api, initializeCsrf, setBearerToken } from "../api/client";
import { ErrorNotice, LoadingState } from "../components/ui";
import { useToastReset } from "../components/Toast";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const resetToasts = useToastReset();
  const navigate = useNavigate();
  const sessionRequest = useRef(null);
  const sessionVersion = useRef(0);
  const invalidateSessionRequests = useCallback(() => {
    sessionVersion.current++;
    sessionRequest.current = null;
    setBearerToken(null);
  }, []);
  const [session, setSession] = useState(null);
  const [sessionNotice, setSessionNotice] = useState("");
  const currentSession = useRef(null);
  useEffect(() => { currentSession.current = session; }, [session]);
  const [restoring, setRestoring] = useState(true);
  const [restoreError, setRestoreError] = useState(null);
  const [revision, setRevision] = useState(0);
  const loadSession = useCallback(() => {
    if (sessionRequest.current) return sessionRequest.current;
    const version = sessionVersion.current;
    const request = (async () => {
      const identity = await api("me");
      if (version !== sessionVersion.current) throw new DOMException("Session changed", "AbortError");
      const role = identity?.staff_id ? "staff" : "user";
      const profile = role === "user" ? await api("me/profile") : null;
      if (version !== sessionVersion.current) throw new DOMException("Session changed", "AbortError");
      return { role, identity, profile, isAccountAdmin: identity?.permissions?.manage_accounts === true };
    })().finally(() => { if (sessionRequest.current === request) sessionRequest.current = null; });
    sessionRequest.current = request;
    return request;
  }, []);

  useEffect(() => {
    let active = true;
    setRestoring(true); setRestoreError(null);
    loadSession().then(current => { if (active) setSession(current); }, error => {
      if (!active || error.name === "AbortError") return;
      if (error.status === 401 || error.code === "account_inactive") setSession(null);
      else setRestoreError(error);
    }).finally(() => { if (active) setRestoring(false); });
    // Share the startup request across Strict Mode effect checks instead of sending it twice.
    return () => { active = false; };
  }, [loadSession, revision]);
  const acceptGoogleLogin = useCallback(async (result) => {
    setSessionNotice("");
    resetToasts();
    currentSession.current = null;
    setSession(null);
    if (result?.session_authenticated !== true) throw new Error("The server did not establish a browser session.");
    invalidateSessionRequests();
    try {
      const current = await loadSession();
      setSession(current);
      resetToasts("Signed in.");
      return current;
    } catch (error) {
      invalidateSessionRequests();
      setSession(null);
      throw error;
    }
  }, [loadSession, resetToasts, invalidateSessionRequests]);

  const login = useCallback(async credentials => {
    invalidateSessionRequests();
    await initializeCsrf();
    const result = await api("auth/login", { method: "POST", body: credentials });
    return acceptGoogleLogin(result);
  }, [acceptGoogleLogin, invalidateSessionRequests]);

  const logout = useCallback(async () => {
    invalidateSessionRequests();
    let error = null;
    try { await api("auth/logout", { method: "POST" }); invalidateSessionRequests(); currentSession.current = null; setSessionNotice(""); resetToasts("Signed out."); setSession(null); }
    catch (requestError) { error = requestError; }
    return error;
  }, [resetToasts, invalidateSessionRequests]);

  const clearLocalSession = useCallback(event => {
    const expired = event?.type === "reclaim:session-expired";
    const protectedPage = /^\/(?:staff|admin|my)(?:\/|$)|^\/(?:profile|change-password)$/.test(window.location.pathname);
    if (expired && !currentSession.current && !protectedPage) return;
    if (expired) setSessionNotice(event.detail?.message || "Please sign in again to continue.");
    else setSessionNotice("");
    resetToasts();
    invalidateSessionRequests();
    currentSession.current = null;
    setSession(null);
    if (expired) navigate("/login", { replace: true });
  }, [resetToasts, invalidateSessionRequests, navigate]);

  useEffect(() => {
    window.addEventListener("reclaim:session-expired", clearLocalSession);
    return () => window.removeEventListener("reclaim:session-expired", clearLocalSession);
  }, [clearLocalSession]);

  useEffect(() => {
    let active = true;
    function check() {
      if (document.visibilityState === "hidden" || !currentSession.current) return;
      const version = sessionVersion.current;
      loadSession().then(current => { if (active && version === sessionVersion.current) {
        const previous = currentSession.current;
        if (previous && (previous.role !== current.role || (previous.identity.user_id || previous.identity.staff_id) !== (current.identity.user_id || current.identity.staff_id))) { invalidateSessionRequests(); resetToasts(); }
        setSession(current);
      } }, error => {
        if (active && (error.status === 401 || error.code === "account_inactive")) clearLocalSession({ type: "reclaim:session-expired", detail: { message: error.message } });
      });
    }
    window.addEventListener("focus", check);
    function restored(event) { if (event.persisted) check(); }
    window.addEventListener("pageshow", restored);
    return () => { active = false; window.removeEventListener("focus", check); window.removeEventListener("pageshow", restored); };
  }, [loadSession, clearLocalSession, resetToasts, invalidateSessionRequests]);

  const refreshIdentity = useCallback(async () => {
    if (!session) return null;
    const version = sessionVersion.current;
    const next = await loadSession();
    if (version !== sessionVersion.current) return null;
    setSession(next);
    return next;
  }, [session, loadSession]);

  const setAdminAccess = useCallback((value, message = null) => {
    setSession((current) => current ? { ...current, isAccountAdmin: value, adminCheckError: message } : current);
  }, []);

  const value = useMemo(() => ({ session, sessionNotice, login, acceptGoogleLogin, logout, clearLocalSession, refreshIdentity, setAdminAccess }), [
    session, sessionNotice, login, acceptGoogleLogin, logout, clearLocalSession, refreshIdentity, setAdminAccess,
  ]);
  return <AuthContext.Provider value={value}>{restoring ? <main className="gate-state" aria-label="Loading Reclaim" aria-busy="true"><LoadingState label="" /></main> : restoreError ? <main className="gate-state"><ErrorNotice error={restoreError} title="Your session could not be checked" /><button className="button button-secondary" type="button" onClick={() => setRevision(value => value + 1)}>Try again</button></main> : <SessionBoundary key={session ? session.role + ":" + (session.identity.user_id || session.identity.staff_id) : "guest"}>{children}</SessionBoundary>}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider.");
  return value;
}

function SessionBoundary({ children }) { return children; }
