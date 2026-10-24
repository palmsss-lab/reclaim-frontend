import { allPages } from "../api/client";
import { ErrorNotice, Field, LoadingState, useApiResource } from "./ui";

export function useReferenceList(path) {
  return useApiResource("reference-" + path, () => allPages(path));
}

export function referenceReady(resource) {
  return !resource.loading && !resource.error && resource.rows.length > 0;
}

export default function ReferenceSelect({ resource, label, id, value, onChange, fieldError, rowKey, optionLabel, placeholder, emptyText, excludeId, disabled = false, disableOption = () => false, required = true }) {
  const rows = resource.rows.filter(row => String(row[rowKey]) !== String(excludeId));
  return <div>
    <Field label={label} name={id} error={fieldError}><select id={id} value={value} onChange={onChange} required={required} disabled={disabled || resource.loading || Boolean(resource.error) || !rows.length}>
      <option value="">{placeholder}</option>{rows.map(row => <option key={row[rowKey]} value={row[rowKey]} disabled={disableOption(row)}>{optionLabel(row)}</option>)}
    </select></Field>
    {resource.loading ? <LoadingState label={"Loading " + label.toLowerCase() + "…"} /> : resource.error ? <ErrorNotice error={resource.error} title={label + " could not be loaded"} /> : !rows.length ? <p role="status" className="muted-copy">{emptyText}</p> : null}
  </div>;
}
