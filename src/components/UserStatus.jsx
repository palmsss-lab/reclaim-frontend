import { StatusBadge } from "./ui";

// Presentation only: API values and transition rules remain unchanged.
const descriptions = {
  finder: {
    PENDING: ["Awaiting handover", "Staff have not yet received the item. Arrange handover with staff."],
    RECEIVED: ["Received by staff", "Staff have received the item."],
    CLOSED: ["Closed", "Staff closed this report without recording item handover."],
    WITHDRAWN: ["Withdrawn", "This report was withdrawn. It is no longer awaiting handover."],
  },
  missing: {
    OPEN: ["Still missing", "You are still looking for this item. Mark the report resolved when you find it."],
    RESOLVED: ["Resolved", "This report was marked as resolved. This does not change an ownership claim."],
    WITHDRAWN: ["Withdrawn", "This report was withdrawn. It is no longer active."],
  },
  claim: {
    PENDING: ["Awaiting review", "Staff still need to review your claim."],
    REJECTED: ["Not accepted", "Your claim was not accepted."],
    RETURNED: ["Item returned", "Staff recorded the item as returned to you."],
  },
};

export function UserStatus({ kind, value }) {
  const [label, explanation] = descriptions[kind]?.[value] || ["Status unavailable", "Refresh this page to check the latest status."];
  return <span className="user-status"><StatusBadge value={value} label={label} /><small className="table-subline">{explanation}</small></span>;
}
