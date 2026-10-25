import { useLocation, useSearchParams } from "react-router";
import { UserStatus } from "./UserStatus";
import { api } from "../api/client";
import { ErrorNotice, LoadingState, Panel, formatDate, useApiResource } from "./ui";
import "./NotificationTarget.css";

export default function NotificationTarget({ kind }) {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const id = params.get(kind === "claims" ? "item" : "report");
  if (!/^[1-9]\d*$/.test(id || "") || !Number.isSafeInteger(Number(id))) return null;
  return <SelectedRecord key={kind + id + location.key} kind={kind} id={id} onClose={() => { const next = new URLSearchParams(params); next.delete(kind === "claims" ? "item" : "report"); setParams(next); }} />;
}

function SelectedRecord({ kind, id, onClose }) {
  const resource = useApiResource("notification-target-" + kind + id, () => api("my/" + kind + "/" + id));
  const row = resource.payload?.data;
  const title = (kind === "claims" ? "Your claim for item #" : "Your report #") + id;
  return <div className="notification-target" data-notification-target tabIndex="-1" role="region" aria-label={title} aria-busy={resource.loading || undefined}><Panel title={title} action={<button className="text-button" type="button" onClick={onClose}>Close selected record</button>}>
    {resource.loading ? <LoadingState label="Loading selected record…" /> : resource.error ? <ErrorNotice error={resource.error} title="Selected record could not be loaded" /> : row && <>
      <p>{row.item_description || row.public_description || row.category_name || "Your ownership claim"}</p>
      <UserStatus kind={kind === "claims" ? "claim" : kind === "finder-reports" ? "finder" : "missing"} value={row.status || row.outcome} />
      {row.reviewed_at && <p>Reviewed {formatDate(row.reviewed_at, { time: true })} · Philippine time</p>}
      <p className="muted-copy">This is your selected {kind === "claims" ? "claim" : "report"}. The list below may show a different page or status tab.</p>
    </>}
  </Panel></div>;
}
