import { useRef, useState } from "react";
import { api, ApiError } from "../api/client";
import { useConfirm } from "./Confirmation";
import { useSuccessToast } from "./Toast";
import { formatDate } from "./ui";

export default function FinderHandoverReminder({ report, disabled, onRefresh, onError }) {
  const confirm = useConfirm();
  const notify = useSuccessToast();
  const requestId = useRef(null);
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  async function remind() {
    if (inFlight.current || disabled) return;
    inFlight.current = true; setBusy(true);
    try {
      if (!await confirm("Remind this report's owner to bring the item to the office for physical handover? Staff have not received it yet. This does not record receipt, create an inventory item, assign storage, or change the report status. Use Record physical handover only after actual receipt. A later reminder is allowed after one hour; retries of this request do not send duplicates.", { confirmLabel: "Send reminder" })) return;
      onError(null);
      // Keep the same key after uncertain failures; only a confirmed response starts a new request.
      requestId.current ||= crypto.randomUUID();
      const result = await api("staff/finder-reports/" + report.report_id + "/request-handover", { method: "POST", body: { request_id: requestId.current } });
      if (result?.message !== "Handover reminder recorded." || !result?.data?.sent_at) throw new ApiError("The reminder could not be confirmed. Refresh the report before trying again.");
      requestId.current = null;
      notify("Handover reminder recorded."); onRefresh();
    } catch (error) {
      onError(error);
      if (error.status === 409) onRefresh();
    } finally { inFlight.current = false; setBusy(false); }
  }
  return <div className="finder-handover-reminder">
    <p className="muted-copy">Staff have not received this item yet. Remind the finder before recording the actual physical handover.</p>
    {report.last_handover_reminder_at && <p className="muted-copy">Last reminder sent {formatDate(report.last_handover_reminder_at, { time: true })} · Philippine time. A later reminder is allowed after one hour.</p>}
    <button className="button button-secondary" type="button" disabled={busy || disabled} onClick={remind}>{busy ? "Sending reminder…" : "Remind finder to bring the item to the office"}</button>
  </div>;
}
