import { ErrorNotice, LoadingState } from "./ui";

export function DashboardContent({ resource, label, children }) {
  if (resource.loading) return <LoadingState label={"Loading " + label.toLowerCase() + "…"} />;
  if (resource.error) return <ErrorNotice title={label + " could not be loaded"} error={{ ...resource.error, retry: resource.reload }} />;
  return children;
}

export function DashboardStat({ resource, label, note, value = resource.page.total }) {
  return <div className="stat-card" aria-label={label}>
    <span>{label}</span>
    {resource.loading ? <LoadingState label="Loading count…" /> : resource.error ? <>
      <strong className="stat-unavailable">Unavailable</strong>
      <button className="text-button" type="button" aria-label={"Retry " + label.toLowerCase()} onClick={resource.reload}>Retry count</button>
    </> : <strong>{value}</strong>}
    <small>{note}</small>
  </div>;
}
