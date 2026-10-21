import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { useAuth } from "../auth/AuthContext";
import Brand from "./Brand";
import AccountMenu from "./AccountMenu";
import { ErrorNotice } from "./ui";
import "./Shell.css";

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
    <nav className="public-navigation" aria-label="Main navigation">
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
    </nav>
    <div className="account-menu">
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

export function StaffShell() {
  const { session } = useAuth();
  const location = useLocation();
  const [navigationOpen, setNavigationOpen] = useState(false);
  const navigationButton = useRef(null);
  const sidebar = useRef(null);
  useEffect(() => {
    const element = sidebar.current;
    const measure = () => element.style.setProperty("--staff-sidebar-height", element.getBoundingClientRect().height + "px");
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, []);
  useEffect(() => { setNavigationOpen(false); }, [location.pathname, location.search]);
  function dismissNavigation(event) {
    if (event.key === "Escape" && navigationOpen) {
      setNavigationOpen(false);
      navigationButton.current?.focus();
    }
  }
  function revealNavigationFocus(event) {
    const target = event.target;
    requestAnimationFrame(() => {
      if (target.isConnected && target.matches(":focus-visible")) target.scrollIntoView({ block: "nearest", behavior: "instant" });
    });
  }
  const referenceType = new URLSearchParams(location.search).get("type") || "categories";
  return <div className="staff-app-shell">
    <a className="skip-link" href="#main">Skip to content</a>
    <SiteHeader staff />
    <div className="staff-shell">
      <aside ref={sidebar} className="staff-sidebar" aria-label="Staff workspace" onKeyDown={dismissNavigation} onFocus={revealNavigationFocus}>
        <button ref={navigationButton} className="staff-navigation-toggle" type="button" aria-expanded={navigationOpen} aria-controls="staff-navigation" onClick={() => setNavigationOpen(open => !open)}>
          <span>Staff navigation</span><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d={navigationOpen ? "m6 15 6-6 6 6" : "m6 9 6 6 6-6"} /></svg>
        </button>
        <p className="sidebar-label">Staff workspace</p>
        <nav id="staff-navigation" className={"staff-navigation" + (navigationOpen ? " is-open" : "")} aria-label="Staff navigation">
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
        </nav>
        <div className="sidebar-bottom">Signed in as {session?.identity?.full_name}<br /><span>{session?.isAccountAdmin ? "Administrator" : "Staff member"}</span></div>
      </aside>
      <main id="main" className="staff-content"><Outlet /></main>
    </div>
    <Footer />
  </div>;
}
