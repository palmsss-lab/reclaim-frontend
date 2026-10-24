import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { api, ApiError } from "../api/client";
import { notificationTarget } from "../api/notifications";
import { FormDialog } from "./FormDialog";
import { EmptyState, ErrorNotice, LoadingState, Pager, formatDate, useApiResource } from "./ui";
import "./UserNotifications.css";

export default function UserNotifications() {
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [revision, setRevision] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const count = useApiResource("notification-count-" + location.key + "-" + revision, () => api("my/notifications/unread-count"));
  const list = useApiResource("notifications-" + open + "-" + pageNumber + "-" + revision, () => open ? api("my/notifications", { query: { per_page: 20, page: pageNumber } }) : Promise.resolve(null));
  const unread = Number.isInteger(count.payload?.unread_count) ? count.payload.unread_count : null;
  useEffect(() => { setOpen(false); setError(null); }, [location.key]);
  useEffect(() => {
    let timer;
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setRevision(value => value + 1), 150);
    };
    window.addEventListener("focus", refresh);
    window.addEventListener("pageshow", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.clearTimeout(timer); window.removeEventListener("focus", refresh); window.removeEventListener("pageshow", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, []);

  async function read(notification, to) {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      if (!notification.read_at) {
        const result = await api("my/notifications/" + notification.notification_id + "/read", { method: "PATCH" });
        if (result?.data?.notification_id !== notification.notification_id || !result.data.read_at) throw new ApiError("The notification read status could not be confirmed. Please retry.");
      }
      setRevision(value => value + 1); setOpen(false); navigate(to);
    } catch (requestError) { setError(requestError); }
    finally { setBusy(false); }
  }

  async function readAll() {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const result = await api("my/notifications/read-all", { method: "PATCH" });
      if (!Number.isInteger(result?.unread_count)) throw new ApiError("The notification read status could not be confirmed. Please retry.");
      setRevision(value => value + 1);
    } catch (requestError) { setError(requestError); }
    finally { setBusy(false); }
  }

  return <>
    <button className="button button-secondary notification-bell" type="button" aria-label={"Notifications, " + (count.error ? "count unavailable" : unread === null ? "loading unread count" : unread + " unread")} aria-haspopup="dialog" aria-expanded={open} onClick={() => { setPageNumber(1); setError(null); setRevision(value => value + 1); setOpen(true); }}>
      <svg aria-hidden="true" focusable="false" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>
      {unread > 0 && !count.error && <span className="notification-badge" aria-hidden="true">{unread > 99 ? "99+" : unread}</span>}
      {count.error && <span className="notification-badge" aria-hidden="true">!</span>}
    </button>
    <FormDialog open={open} title="Notifications" description="Private updates about your reports and claims. Select a link to mark that notification read." closeLabel="Close notifications" onClose={() => { if (!busy) setOpen(false); }}>
      <form aria-busy={busy || undefined} onSubmit={event => event.preventDefault()}>
        <ErrorNotice error={error} title="Couldn't mark notifications read" focus />
        {count.error && <ErrorNotice error={count.error} title="Unread count could not be loaded" />}
        {list.loading ? <LoadingState label="Loading notifications…" /> : list.error ? <ErrorNotice error={list.error} title="Notifications could not be loaded" /> : list.rows.length ? <>
          <div className="notification-actions"><button className="button button-secondary button-small" type="button" disabled={busy || !list.rows.some(row => !row.read_at) && unread === 0} onClick={readAll}>Mark all read</button></div>
          <ul className="notification-list">{list.rows.map(row => {
            const to = notificationTarget(row);
            const possibleId = Number(row.possible_item_id);
            return <li className={!row.read_at ? "notification-unread" : ""} key={row.notification_id}>
              <p>{row.message}</p>
              <small>{!row.read_at && <strong>Unread · </strong>}<time dateTime={row.created_at}>{formatDate(row.created_at, { time: true })}</time> · Philippine time</small>
              <div className="notification-links">
                {to && <Link to={to} aria-disabled={busy || undefined} onClick={event => { event.preventDefault(); read(row, to); }}>{row.target_type === "claim" ? "Open my claim" : "Open my report"}</Link>}
                {Number.isSafeInteger(possibleId) && possibleId > 0 && <Link to={"/items/" + possibleId} aria-disabled={busy || undefined} onClick={event => { event.preventDefault(); read(row, "/items/" + possibleId); }}>View possible item</Link>}
              </div>
            </li>;
          })}</ul>
          <Pager page={list.page} onPage={setPageNumber} label="Notification pages" />
        </> : <EmptyState title="No notifications yet">Staff updates about your reports and claims will appear here.</EmptyState>}
      </form>
    </FormDialog>
  </>;
}
