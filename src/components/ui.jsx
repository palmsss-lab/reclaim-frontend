import { Children, cloneElement, isValidElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiRows, pageInfo } from "../api/client";
import "./ui.css";
import { fieldLabel, readableMessage } from "./validation";

export function useApiResource(key, load, retainOnReload = false) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState({ loading: true, error: null, payload: null });
  const reload = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    let active = true;
    setState(previous => ({ key, loading: true, error: null, payload: retainOnReload && previous.key === key ? previous.payload : null }));
    load().then(
      (payload) => active && setState({ key, loading: false, error: null, payload }),
      (error) => active && setState({ key, loading: false, error, payload: null }),
    );
    return () => { active = false; };
  }, [key, revision]);
  const error = useMemo(() => state.error ? { ...state.error, message: state.error.message, retry: state.error.recoverable ? reload : undefined } : null, [state.error, reload]);
  return { ...state, error, rows: apiRows(state.payload), page: pageInfo(state.payload), reload };
}

export function PageHeading({ title, description, action }) {
  return <div className="page-heading"><div><h1>{title}</h1>{description && <p className="page-description">{description}</p>}</div>{action && <div className="page-heading-action">{action}</div>}</div>;
}

export function Panel({ title, description, action, children, className = "" }) {
  return <section className={"panel " + className}>{(title || description || action) && <div className="panel-heading"><div>{title && <h2>{title}</h2>}{description && <p>{description}</p>}</div>{action}</div>}{children}</section>;
}

export function LoadingState({ label = "Loading…" }) {
  return <div className="loading-state" role="status"><span className="spinner" aria-hidden="true" />{label}</div>;
}

export function ErrorNotice({ error, title = "We couldn't complete that request", fields = {}, focus = false, className = "", onDismiss, retry = true }) {
  const summary = useRef(null);
  useEffect(() => { if (error && focus) summary.current?.focus(); }, [error, focus]);
  if (!error) return null;
  const entries = Object.entries(error.errors || {});
  const localMessages = ["Allow popups for Reclaim, then try Google sign-in again.", "Google sign-in was cancelled."];
  const message = error.name === "ApiError" || localMessages.includes(error.message) ? error.message : "We couldn't complete this action. Check your connection and try again.";
  return <div ref={summary} tabIndex={focus ? -1 : undefined} className={"notice notice-error " + className} role="alert" aria-label={title}><strong>{title}</strong><span>{readableMessage(message, fields)}</span>{entries.length > 0 && <ul>{entries.flatMap(([field, messages]) => (Array.isArray(messages) ? messages : [messages]).map((message, index) => <li key={field + "-" + index}>{fields[field]?.id ? <a href={"#" + fields[field].id} onClick={event => { event.preventDefault(); document.getElementById(fields[field].id)?.focus(); }}>{fieldLabel(field, fields)}: {readableMessage(message, fields)}</a> : <><strong>{fieldLabel(field, fields)}:</strong> {readableMessage(message, fields)}</>}</li>))}</ul>}{retry && error.retry && <button type="button" className="button button-secondary button-small" onClick={error.retry}>Retry loading</button>}{onDismiss && <button type="button" className="text-button" onClick={onDismiss}>Dismiss error</button>}</div>;
}

export function SuccessNotice({ children }) {
  return children ? <div className="notice notice-success" role="status">{children}</div> : null;
}

export function EmptyState({ title, children, action }) {
  return <div className="empty-state"><span className="empty-mark" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="M4 7h16v13H4zM3 7l3-4h12l3 4M9 11h6" /></svg></span><h3>{title}</h3>{children && <p>{children}</p>}{action}</div>;
}

export function StatusBadge({ value, label }) {
  const valueText = value || "UNKNOWN";
  const tone = valueText === "PENDING" || valueText === "OPEN" ? "warning"
    : ["RETURNED", "RECEIVED", "RESOLVED"].includes(valueText) ? "success"
    : ["REJECTED", "CLOSED", "WITHDRAWN"].includes(valueText) ? "muted" : "neutral";
  return <span className={"status-badge status-" + tone}>{label || valueText}</span>;
}

export function DataTable({ caption, columns, rows, rowKey, rowProps, mobileCards = true, emptyTitle = "No records yet", emptyText = "Records will appear here.", emptyAction }) {
  if (!rows?.length) return <EmptyState title={emptyTitle} action={emptyAction}>{emptyText}</EmptyState>;
  const wrapperClass = mobileCards ? "table-scroll table-scroll-mobile-cards" : "table-scroll";
  return <div className={wrapperClass} role="region" aria-label={caption || "Records table"} tabIndex="0"><table>{caption && <caption className="sr-only">{caption}</caption>}<thead><tr>{columns.map((column) => <th key={column.key} scope="col">{column.label}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={rowKey ? rowKey(row) : row.id || index} {...rowProps?.(row)}>{columns.map((column) => <td key={column.key}>{mobileCards && <span className="table-cell-label" aria-hidden="true">{column.label}</span>}<div className="table-cell-content">{column.render ? column.render(row) : (row[column.key] ?? "—")}</div></td>)}</tr>)}</tbody></table></div>;
}

export function Pager({ page, onPage, label = "Pagination" }) {
  if (!page || page.lastPage <= 1) return null;
  return <nav className="pager" aria-label={label}><button className="button button-secondary button-small" type="button" disabled={page.currentPage <= 1} onClick={() => onPage(page.currentPage - 1)}>Previous</button><span>Page {page.currentPage} of {page.lastPage}{page.total ? " · " + page.total + " records" : ""}</span><button className="button button-secondary button-small" type="button" disabled={page.currentPage >= page.lastPage} onClick={() => onPage(page.currentPage + 1)}>Next</button></nav>;
}

export function formatDate(value, options = {}) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return String(value);
  return new Intl.DateTimeFormat("en-PH", { dateStyle: options.dateStyle || "medium", ...(options.time ? { timeStyle: "short" } : {}), timeZone: "Asia/Manila" }).format(date);
}

export function Field({ label, name, error, hint, children }) {
  const errorId = error ? name + "-error" : undefined;
  const hintId = hint ? name + "-hint" : undefined;
  const accessibility = { "aria-invalid": error ? true : undefined, "aria-describedby": [hintId, errorId].filter(Boolean).join(" ") || undefined };
  const control = isValidElement(children) && children.props.id ? cloneElement(children, accessibility)
    : isValidElement(children) && children.type === "span" ? cloneElement(children, {}, Children.map(children.props.children, child => isValidElement(child) && ["input", "select", "textarea"].includes(child.type) ? cloneElement(child, accessibility) : child)) : children;
  return <div className="field"><div className="field-label"><label htmlFor={name}>{label}</label>{children?.props?.required && <span className="required-marker" aria-hidden="true">*</span>}</div>{control}{hint && <small id={hintId}>{hint}</small>}{error && <small className="field-error" id={errorId}>{readableMessage(Array.isArray(error) ? error[0] : error)}</small>}</div>;
}

export function fieldError(error, name) {
  return error?.errors?.[name] || null;
}

export function useMutation() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState("");
  async function run(action, successMessage = "") {
    if (busy) return null;
    setBusy(true); setError(null); setSuccess("");
    try {
      const result = await action();
      setSuccess(successMessage);
      return result;
    } catch (requestError) {
      setError(requestError);
      return null;
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, success, setError, setSuccess, run };
}
