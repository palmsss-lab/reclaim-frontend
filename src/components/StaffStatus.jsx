import { StatusBadge } from "./ui";

const labels = { PENDING: "Awaiting review", RECEIVED: "Received by staff", CLOSED: "Closed", WITHDRAWN: "Withdrawn", OPEN: "Still missing", RESOLVED: "Resolved", REJECTED: "Rejected", RETURNED: "Returned" };
export function staffStatusLabel(value) { return labels[value] || value; }
export default function StaffStatus({ value }) { return <StatusBadge value={value} label={staffStatusLabel(value)} />; }
