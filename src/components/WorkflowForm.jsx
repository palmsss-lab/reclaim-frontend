import { ErrorNotice, Field } from "./ui";
import "./WorkflowForm.css";

// Presentation only: callers retain their requests, validation and permissions.
export function WorkflowForm({ error, fields = {}, busy, onSubmit, children, actions, failureTitle = "Check the form", validationTitle }) {
  return <form className="workflow-form" onSubmit={onSubmit} aria-busy={busy || undefined}>
    <ErrorNotice error={error} fields={fields} focus title={error?.status === 422 && Object.keys(error.errors || {}).length ? validationTitle || failureTitle : failureTitle} className="workflow-error-summary" />
    <div className="workflow-fields">{children}</div>
    <div className="form-actions workflow-actions">{actions}</div>
  </form>;
}

export function WorkflowField({ wide = false, children, label, ...props }) {
  return <div className={"workflow-field" + (wide ? " workflow-field-wide" : "") + (children?.props?.required ? " workflow-field-required" : "")}><Field {...props} label={label}>{children}</Field></div>;
}

export function foundItemTargets(prefix, categoryId, categoryLabel = "Category", passive = false) {
  return {
    item_description: { id: prefix + "-description", label: "Item description" },
    category_id: { id: categoryId, label: categoryLabel },
    found_place: { id: prefix + "-place", label: passive ? "Where was it found?" : "Where did you find it?" },
    found_at: { id: prefix + "-at", label: passive ? "When was it found?" : "When did you find it?" },
  };
}

export function FoundItemFields({ prefix, values, onChange, error, maxDateTime, category, passive = false, timeHint }) {
  return <div className="workflow-grid">
    <WorkflowField wide label="Item description" name={prefix + "-description"} error={error?.errors?.item_description} hint="Include useful identifying details."><textarea id={prefix + "-description"} maxLength="16000" value={values.item_description} onChange={(event) => onChange({ ...values, item_description: event.target.value })} required /></WorkflowField>
    <div className="workflow-field-wide">{category}</div>
    <WorkflowField label={passive ? "Where was it found?" : "Where did you find it?"} name={prefix + "-place"} error={error?.errors?.found_place}><input id={prefix + "-place"} maxLength="200" value={values.found_place} onChange={(event) => onChange({ ...values, found_place: event.target.value })} required /></WorkflowField>
    <WorkflowField label={passive ? "When was it found?" : "When did you find it?"} name={prefix + "-at"} error={error?.errors?.found_at} hint={timeHint}><input id={prefix + "-at"} type="datetime-local" max={maxDateTime} value={values.found_at} onChange={(event) => onChange({ ...values, found_at: event.target.value })} required /></WorkflowField>
  </div>;
}
