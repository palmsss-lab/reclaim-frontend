import { ToastProvider } from "./components/Toast";
import { Link, Navigate, Outlet, Route, Routes, useLocation } from "react-router";
import { useEffect, useState } from "react";
import { AuthProvider, SessionCheckNotice, useAuth } from "./auth/AuthContext";
import { api } from "./api/client";
import { ErrorNotice, LoadingState } from "./components/ui";
import { PublicShell, StaffShell } from "./components/Shell";
import { LoginPage, RegisterPage, ForgotPasswordPage, ResetPasswordPage, VerifyEmailPage } from "./pages/AuthPages";
import { PublicBrowsePage, PublicItemPage } from "./pages/PublicPages";
import { UserHomePage, FinderReportsPage, MissingReportsPage, ClaimsPage, ProfilePage } from "./pages/UserPages";
import { StaffDashboardPage, FinderQueuePage, FinderReportDetailPage, MissingQueuePage, MissingReportDetailPage, IntakePage } from "./pages/StaffPages";
import { ItemListPage, ItemDetailPage, StaffClaimsPage, StaffReportsPage } from "./pages/StaffInventoryPages";
import ChangePasswordPage from "./pages/ChangePasswordPage";
import StaffProfilePage from "./pages/StaffProfilePage";
import StaffPeoplePage from "./pages/StaffPeoplePage";
import { AccountsPage, AccountDetailPage, ReferenceDataPage } from "./pages/AdminPages";
import "./styles.css";
import { ConfirmationProvider } from "./components/Confirmation";
import SetPasswordPage from "./pages/SetPasswordPage";
import { afterSignIn, authPath } from "./auth/returnPath";

function RouteGate({ roles, admin = false, verified = false }) {
  const GateContainer = roles.includes("user") ? "section" : "main";
  const { session, setAdminAccess, checkingSession, sessionError } = useAuth();
  const location = useLocation();
  const [checking, setChecking] = useState(false);
  const [accessError, setAccessError] = useState(null);
  const [probe, setProbe] = useState(0);
  const [checkedPath, setCheckedPath] = useState(null);

  useEffect(() => {
    if (!admin || session?.role !== "staff") return;
    let active = true;
    setChecking(true);
    setAccessError(null);
    api("me").then(
      (identity) => { if (active) { setAdminAccess(identity?.permissions?.manage_accounts === true); setCheckedPath(location.pathname); } },
      (error) => {
        if (!active) return;
        if (error.status === 403) { setAdminAccess(false); setCheckedPath(location.pathname); }
        else setAccessError(error);
      },
    ).finally(() => active && setChecking(false));
    return () => { active = false; };
  }, [admin, session?.role, location.pathname, probe, setAdminAccess]);

  if (checkingSession || sessionError) return <GateContainer id={roles.includes("user") ? undefined : "main"} className="gate-state"><h1>Confirm your session to continue</h1>{!roles.includes("user") && <SessionCheckNotice />}<Link to="/">Browse found items</Link></GateContainer>;
  if (!session) return <Navigate to="/login" replace />;
  if (!roles.includes(session.role)) return <Navigate to={afterSignIn(session)} replace />;
  if (verified && session.role === "user" && session.identity?.email_verified !== true) return <Navigate to={authPath("/verify-email", location.pathname + location.search)} replace />;
  if (admin && (checking || checkedPath !== location.pathname || accessError)) {
    if (checking) return <LoadingState label="Checking account permissions…" />;
    if (accessError) return <div className="gate-state"><ErrorNotice error={accessError} title="Administrator access could not be checked" /><button className="button button-secondary" type="button" onClick={() => { setProbe((value) => value + 1); }}>Try again</button></div>;
    return <LoadingState label="Checking account permissions…" />;
  }
  if (admin && session.isAccountAdmin !== true) return <AccessDenied />;
  return <Outlet />;
}

function AccessDenied() {
  return <section className="panel gate-state"><div className="access-mark" aria-hidden="true">!</div><h1>Administrator access required</h1><p>Your account does not have permission to view this screen.</p></section>;
}

function ProfileRoute() {
  return useLocation().hash === "#change-password" ? <Navigate to="/change-password" replace /> : <ProfilePage />;
}

function AppRoutes() {
  const location = useLocation();
  useEffect(() => {
    const path = location.pathname;
    const label = path.startsWith("/admin") ? "Administration"
      : path.startsWith("/staff") ? "Staff workspace"
      : path.startsWith("/my") ? "My Reclaim"
      : path.startsWith("/items/") ? "Item details"
      : path === "/login" ? "Sign in"
      : path === "/register" ? "Create account"
      : ({ "/profile": "Profile", "/change-password": "Change password", "/verify-email": "Verify email", "/forgot-password": "Password recovery", "/reset-password": "Reset password" }[path] || "Browse items");
    document.title = label + " · Reclaim";
    const main = document.getElementById("main");
    if (main) { main.setAttribute("tabindex", "-1"); main.focus({ preventScroll: true }); }
  }, [location.pathname]);

  return (
    <Routes>
      <Route element={<PublicShell />}>
        <Route path="/" element={<PublicBrowsePage />} />
        <Route path="/items/:itemId" element={<PublicItemPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/set-password" element={<SetPasswordPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="*" element={<section className="panel"><h1>Page not found</h1><p>This page does not exist.</p><Link to="/">Browse found items</Link></section>} />
        <Route element={<RouteGate roles={["user"]} />}>
          <Route path="/my" element={<UserHomePage />} />
          <Route path="/profile" element={<ProfileRoute />} />
          <Route path="/change-password" element={<ChangePasswordPage />} />
        </Route>
        <Route element={<RouteGate roles={["user"]} verified />}>
          <Route path="/my/finder-reports" element={<FinderReportsPage />} />
          <Route path="/my/missing-reports" element={<MissingReportsPage />} />
          <Route path="/my/claims" element={<ClaimsPage />} />
        </Route>
      </Route>

      <Route element={<RouteGate roles={["staff"]} />}>
        <Route element={<StaffShell />}>
          <Route path="/staff" element={<StaffDashboardPage />} />
          <Route path="/staff/finder-reports" element={<FinderQueuePage />} />
          <Route path="/staff/finder-reports/:reportId" element={<FinderReportDetailPage />} />
          <Route path="/staff/missing-reports" element={<MissingQueuePage />} />
          <Route path="/staff/missing-reports/:reportId" element={<MissingReportDetailPage />} />
          <Route path="/staff/items" element={<ItemListPage />} />
          <Route path="/staff/items/new" element={<IntakePage />} />
          <Route path="/staff/items/:itemId" element={<ItemDetailPage />} />
          <Route path="/staff/claims" element={<StaffClaimsPage />} />
          <Route path="/staff/reports" element={<StaffReportsPage />} />
          <Route path="/staff/security" element={<ChangePasswordPage />} />
          <Route path="/staff/profile" element={<StaffProfilePage />} />
          <Route path="/staff/people" element={<StaffPeoplePage />} />
          <Route path="/staff/reference-data" element={<ReferenceDataPage />} />
          <Route element={<RouteGate roles={["staff"]} admin />}>
            <Route path="/admin/accounts" element={<AccountsPage />} />
            <Route path="/admin/accounts/:accountId" element={<AccountDetailPage />} />
          </Route>
        </Route>
      </Route>

    </Routes>
  );
}

export default function App() {
  return <ToastProvider><AuthProvider><ConfirmationProvider><AppRoutes /></ConfirmationProvider></AuthProvider></ToastProvider>;
}
