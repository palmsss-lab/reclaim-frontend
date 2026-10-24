import { useEffect, useId, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { useAuth } from "../auth/AuthContext";
import Brand from "./Brand";
import AccountMenu from "./AccountMenu";
import UserNotifications from "./UserNotifications";
import { ErrorNotice } from "./ui";
import { FormDialog } from "./FormDialog";
import "./Shell.css";

function MainNavigation({ staff = false, id }) {
  const { session } = useAuth();
  return <nav id={id} className="public-navigation" aria-label="Main navigation">
      {staff ? <NavLink to="/staff" end>Staff dashboard</NavLink> : <>
        <NavLink to="/" end>Browse items</NavLink>
        {session?.role === "user" && <>
          <NavLink to="/my">My Reclaim</NavLink>
          <NavLink to="/my/missing-reports">My missing items</NavLink>
          <NavLink to="/my/finder-reports">My found-item reports</NavLink>
          <NavLink to="/my/claims">My claims</NavLink>
        </>}
        {session?.role === "staff" && <Link to="/staff">Staff dashboard</Link>}
      </>}
    </nav>;
}

function MobileNavigation({ staff }) {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const navigationId = useId();
  const label = staff ? "Staff navigation" : "Main navigation";
  useEffect(() => { setOpen(false); }, [location.pathname, location.search, location.hash]);
  useEffect(() => {
    const mobile = window.matchMedia("(max-width: 760px)");
    const resized = event => { if (!event.matches) setOpen(false); };
    mobile.addEventListener("change", resized);
    return () => mobile.removeEventListener("change", resized);
  }, []);
  return <div className="mobile-navigation">
    <button className="button button-secondary mobile-navigation-toggle" type="button" aria-label={label} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? navigationId : undefined} onClick={() => setOpen(true)}>
      <svg aria-hidden="true" focusable="false" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
    </button>
    <FormDialog open={open} title={label} closeLabel="Close navigation" className="mobile-navigation-dialog" onClose={() => setOpen(false)}>
      <div onClick={event => { if (event.target.closest("a[href]")) setOpen(false); }}>
        {staff ? <StaffNavigation id={navigationId} /> : <MainNavigation id={navigationId} />}
      </div>
    </FormDialog>
  </div>;
}

function SiteHeader({ staff = false, headerRef }) {
  const { session, logout } = useAuth();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);
  const [logoutError, setLogoutError] = useState(null);
  async function signOut() {
    if (signingOut) return;
    setSigningOut(true); setLogoutError(null);
    const error = await logout();
    setSigningOut(false);
    if (error) { setLogoutError(error); return; }
    navigate("/login", { replace: true });
  }
  return <header ref={headerRef} className="public-header"><div className="public-header-inner">
    <Brand to={staff ? "/staff" : "/"} />
    <MainNavigation staff={staff} />
    <MobileNavigation staff={staff} />
    <div className="account-menu">
      {!staff && session?.role === "user" && <UserNotifications />}
      {session ? <AccountMenu onSignOut={signOut} signingOut={signingOut} /> : <Link className="button button-primary" to="/login">Sign in</Link>}
    </div>
  </div>{logoutError && <div className="logout-error"><ErrorNotice error={logoutError} title="Sign out failed. Please try again." focus /></div>}</header>;
}

function Footer() { return <footer className="public-footer">Campus lost and found</footer>; }

export function PublicShell() {
  const location = useLocation();
  const headerRef = useRef(null);
  useEffect(() => {
    const header = headerRef.current;
    const measure = () => header.parentElement.style.setProperty("--public-header-height", header.getBoundingClientRect().height + "px");
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    measure();
    return () => observer.disconnect();
  }, []);
  return <div className="public-app-shell">
    <a className="skip-link" href="#main">Skip to content</a>
    <SiteHeader headerRef={headerRef} />
    <main id="main" className="public-main" key={location.pathname}><Outlet /></main>
    <Footer />
  </div>;
}

const staffNavGroups = [
  { label: "Overview", links: [
    { to: "/staff", label: "Dashboard", end: true },
    { to: "/staff/reports", label: "Reports" },
  ] },
  { label: "Review", links: [
    { to: "/staff/finder-reports", label: "Finder reports" },
    { to: "/staff/missing-reports", label: "Missing reports" },
    { to: "/staff/claims", label: "Claims" },
  ] },
  { label: "Inventory", links: [
    { to: "/staff/items", label: "Found items", end: true },
    { to: "/staff/items/new", label: "Receive item" },
  ] },
];

function StaffNavigation({ id }) {
  const { session } = useAuth();
  const location = useLocation();
  const referenceType = new URLSearchParams(location.search).get("type") || "categories";
  return <nav id={id} className="staff-navigation" aria-label="Staff navigation">
          {staffNavGroups.map(group => <div className="staff-nav-group" key={group.label}>
            <p className="sidebar-label">{group.label}</p>
            {group.links.map(link => <NavLink key={link.to} to={link.to} end={link.end}>{link.label}</NavLink>)}
          </div>)}
          <div className="staff-nav-group staff-nav-secondary">
          <p className="sidebar-label">Categories and storage</p>
          {[["categories", "Categories"], ["locations", "Storage locations"]].map(([type, label]) => {
            const active = location.pathname === "/staff/reference-data" && referenceType === type;
            return <Link key={type} to={"/staff/reference-data?type=" + type} className={active ? "active" : ""} aria-current={active ? "page" : undefined}>{label}</Link>;
          })}
          </div>
          <div className="staff-nav-group staff-nav-secondary">
          <p className="sidebar-label">Account</p>
          <NavLink to="/staff/security">Change password</NavLink>
          {session?.isAccountAdmin === true && <NavLink to="/admin/accounts">Account administration</NavLink>}
          </div>
        </nav>;
}

export function StaffShell() {
  const { session } = useAuth();
  const sidebar = useRef(null);
  useEffect(() => {
    const element = sidebar.current;
    const measure = () => element.style.setProperty("--staff-sidebar-height", element.getBoundingClientRect().height + "px");
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, []);
  function revealNavigationFocus(event) {
    const target = event.target;
    requestAnimationFrame(() => {
      if (target.isConnected && target.matches(":focus-visible")) target.scrollIntoView({ block: "nearest", behavior: "instant" });
    });
  }
  return <div className="staff-app-shell">
    <a className="skip-link" href="#main">Skip to content</a>
    <SiteHeader staff />
    <div className="staff-shell">
      <aside ref={sidebar} className="staff-sidebar" aria-label="Staff workspace" onFocus={revealNavigationFocus}>
        <p className="sidebar-label">Staff workspace</p>
        <StaffNavigation />
        <div className="sidebar-bottom">Signed in as {session?.identity?.full_name}<br /><span>{session?.isAccountAdmin ? "Administrator" : "Staff member"}</span></div>
      </aside>
      <main id="main" className="staff-content"><Outlet /></main>
    </div>
    <Footer />
  </div>;
}
