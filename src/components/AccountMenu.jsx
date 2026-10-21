import { useEffect, useId, useRef, useState } from "react";
import { Link, useLocation } from "react-router";
import { useAuth } from "../auth/AuthContext";
import "./AccountMenu.css";

export default function AccountMenu({ onSignOut, signingOut = false }) {
  const { session } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  const trigger = useRef(null);
  const lastOnOpen = useRef(false);
  const id = useId();
  const staff = session.role === "staff";
  const profilePath = staff ? "/staff/profile" : "/profile";
  useEffect(() => { setOpen(false); }, [location.pathname, location.search, location.hash]);
  useEffect(() => {
    if (!open) return;
    function outside(event) { if (!root.current?.contains(event.target)) setOpen(false); }
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  useEffect(() => {
    if (open) {
      const items = root.current?.querySelectorAll('[role="menuitem"]');
      (lastOnOpen.current ? items?.[items.length - 1] : items?.[0])?.focus();
    }
  }, [open]);
  function close(restore = false) { setOpen(false); if (restore) trigger.current?.focus(); }
  function keyboard(event) {
    if (event.key === "Escape") { event.preventDefault(); close(true); }
    if (event.key === "Tab") { close(true); return; }
    const items = [...root.current.querySelectorAll('[role="menuitem"]')];
    const index = items.indexOf(document.activeElement);
    let next;
    if (event.key === "ArrowDown") next = (index + 1) % items.length;
    if (event.key === "ArrowUp") next = (index - 1 + items.length) % items.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = items.length - 1;
    if (next !== undefined) { event.preventDefault(); items[next]?.focus(); }
  }
  return <div className="account-dropdown" ref={root} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <button ref={trigger} className="button button-secondary account-trigger" type="button" aria-label="Account menu" aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => { lastOnOpen.current = false; setOpen(value => !value); }} onKeyDown={event => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); lastOnOpen.current = event.key === "ArrowUp"; setOpen(true); }
    }}>
      <svg aria-hidden="true" focusable="false" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4" /><path d="M4 22v-2a8 8 0 0 1 16 0v2" /></svg>
    </button>
    {open && <div className="account-dropdown-card">
      <p className="account-dropdown-name">{session.identity?.full_name || "Your account"}</p>
      <div id={id} role="menu" aria-label="Account" onKeyDown={keyboard}>
        <Link role="menuitem" tabIndex={-1} to={profilePath} onClick={() => close()}>Profile</Link>
        <Link role="menuitem" tabIndex={-1} to={staff ? "/staff/security" : "/change-password"} onClick={() => close()}>Change password</Link>
        <button role="menuitem" tabIndex={-1} type="button" disabled={signingOut} onClick={() => { close(); onSignOut(); }}>{signingOut ? "Signing out…" : "Sign out"}</button>
      </div>
    </div>}
  </div>;
}
