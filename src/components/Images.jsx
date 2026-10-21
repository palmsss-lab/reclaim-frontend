import { useSuccessToast } from "./Toast";
import { useConfirm } from "./Confirmation";
import { FormDialog } from "./FormDialog";
import { useEffect, useId, useRef, useState } from "react";
import { api } from "../api/client";
import { ErrorNotice, Field, LoadingState, Panel, useApiResource } from "./ui";
import "./Images.css";

export function ImagePreview({ path, version = "", alt = "Item photograph" }) {
  const [state, setState] = useState({ url: "", error: false });
  useEffect(() => {
    let active = true, url;
    const controller = new AbortController();
    setState({ url: "", error: false });
    api(path, { responseType: "blob", signal: controller.signal }).then(blob => {
      if (active) { url = URL.createObjectURL(blob); setState({ url, error: false }); }
    }).catch(error => { if (active && error.name !== "AbortError") setState({ url: "", error: true }); });
    return () => { active = false; controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [path, version]);
  return state.url ? <img className="item-photograph" src={state.url} alt={alt} /> : <span role="status">{state.error ? "Image unavailable" : "Loading image..."}</span>;
}

export function PublicImages({ item, firstOnly = false, fallback }) {
  const images = firstOnly ? item.images?.slice(0, 1) : item.images;
  return images?.length ? <div className="public-photo-grid">{images.map(image => <ImagePreview key={image.image_id} path={"public/items/" + item.item_id + "/images/" + image.image_id} alt={"Staff-approved photograph of " + item.public_description} />)}</div> : fallback;
}

// Native disclosure keeps the two secondary actions in the normal keyboard tab order.
function ImageMoreActions({ index, triggerId, busy, onReplace, onRemove }) {
  const root = useRef(null), trigger = useRef(null);
  useEffect(() => {
    function outside(event) { if (root.current && !root.current.contains(event.target)) root.current.open = false; }
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);
  function choose(action) {
    root.current.open = false;
    trigger.current.focus();
    action(trigger.current);
  }
  return <details className="image-more-actions" ref={root}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false; }}
    onKeyDown={event => { if (event.key === "Escape" && root.current.open) { event.preventDefault(); event.stopPropagation(); root.current.open = false; trigger.current.focus(); } }}>
    <summary ref={trigger} data-upload-trigger={triggerId} aria-label={"More actions for image " + index} aria-disabled={busy || undefined} onClick={event => { if (busy) event.preventDefault(); }}>More actions</summary>
    <div className="image-more-options">
      <button className="text-button" type="button" disabled={busy} onClick={() => choose(onReplace)}>Replace image {index}</button>
      <button className="text-button" type="button" disabled={busy} onClick={() => choose(onRemove)}>Remove image {index}</button>
    </div>
  </details>;
}

export function ImageManager({ path, readOnly = false, publication = false }) {
  const confirm = useConfirm();
  const resource = useApiResource("images-" + path, () => api(path), true);
  const [selected, setSelected] = useState(null);
  const [preview, setPreview] = useState("");
  const [replacing, setReplacing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [privacyNotice, setPrivacyNotice] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const input = useRef(null), heading = useRef(null), uploadTrigger = useRef(null), uploadTriggerId = useRef("add");
  const inputId = useId();
  useEffect(() => {
    if (!selected) { setPreview(""); return; }
    const url = URL.createObjectURL(selected); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [selected]);
  useEffect(() => { if (error && !busy) input.current?.focus(); }, [error, busy]);
  useEffect(() => { if (replacing !== null) input.current?.focus(); }, [replacing]);
  const notify = useSuccessToast();
  async function mutate(action, message) {
    if (busy) return false; setBusy(true); setError(null);
    try {
      const result = await action();
      setPrivacyNotice("");
      notify(message, message + "-" + (result?.data?.image_id ?? path)); setSelected(null); setReplacing(null);
      if (input.current) input.current.value = "";
      resource.reload(); if (!uploadOpen) heading.current?.focus();
      return true;
    } catch (failure) { setError(failure); input.current?.focus(); return false; }
    finally { setBusy(false); }
  }
  async function upload(event) {
    event.preventDefault();
    if (!selected || busy) return;
    const body = new FormData(); body.append("image", selected);
    if (await mutate(() => api(path + (replacing ? "/" + replacing : ""), { method: "POST", body }), replacing ? "Image replaced." : "Private image uploaded.")) {
      if (replacing && publication) setPrivacyNotice("The replacement image is private. Review it before approving it for public display.");
      setUploadOpen(false);
    }
  }
  function closeUpload() { setUploadOpen(false); setSelected(null); setReplacing(null); setError(null); if (input.current) input.current.value = ""; }
  function openUpload(trigger, imageId = null) { uploadTrigger.current = trigger; uploadTriggerId.current = inputId + (imageId === null ? "-add" : "-" + imageId); setReplacing(imageId); setSelected(null); setError(null); if (input.current) input.current.value = ""; setUploadOpen(true); }
  function findUploadTrigger() { return document.querySelector('[data-upload-trigger="' + uploadTriggerId.current + '"]'); }
  async function removeImage(imageId) {
    if (busy) return;
    if (await confirm("Permanently remove this image?", { confirmLabel: publication || path.startsWith("my/") ? "Remove photo" : "Confirm", danger: publication })) mutate(() => api(path + "/" + imageId, { method: "DELETE" }), "Image removed.");
  }
  const attachButton = !readOnly && <button className="button button-primary" type="button" data-upload-trigger={inputId + "-add"} aria-disabled={busy || resource.rows.length >= 5 || resource.loading || Boolean(resource.error) || undefined} onClick={(event) => { if (!busy && resource.rows.length < 5 && !resource.loading && !resource.error) openUpload(event.currentTarget); }}>Attach image</button>;
  return <Panel className={"images-panel" + (publication ? " staff-item-images" : "")} title="Images" action={publication ? attachButton : undefined}>
    <div ref={heading} tabIndex="-1" className="image-focus-target" aria-label="Image management">
      <p>{publication ? "Images remain private until you approve each one and publish the item. Check the photo for faces, contacts, labels and private identifying details before approval." : "Report images are private to the report owner and authorized staff. They are not automatically published or copied at handover."}</p>
    </div>
    <ErrorNotice error={resource.error || (!uploadOpen ? error : null)} retry={false} />
    {privacyNotice && <div className="notice notice-info" role="status">{privacyNotice}</div>}
    {resource.error && <button className="text-button" type="button" onClick={resource.reload}>Retry images</button>}
    {resource.loading && !resource.rows.length ? <LoadingState label="Loading images..." /> : <div className="image-manager-grid">{resource.rows.map((image, index) => <figure key={image.image_id}>
      <ImagePreview path={path + "/" + image.image_id + "/content"} version={image.updated_at} alt={(publication ? "Item photograph " : "Private item photograph ") + (index + 1)} />
      <figcaption><span>Image {index + 1}</span>{publication && <span className="image-privacy-status">{image.approved ? "Approved for public display" : "Private"}</span>}</figcaption>
      {!readOnly && <div className="image-controls">
        {publication && <button className="button button-secondary button-small" type="button" disabled={busy} onClick={async () => { if (!image.approved && !await confirm("Approve this photo for public display? Confirm it contains no private evidence or contact details.", { confirmLabel: "Approve photo" })) return; mutate(() => api(path + "/" + image.image_id + "/publication", { method: "PUT", body: { approved: !image.approved } }), image.approved ? "Public approval removed." : "Image approved. It is public only while the item listing is available."); }}>{image.approved ? "Make image " + (index + 1) + " private" : "Approve image " + (index + 1) + " for public display"}</button>}
        {publication ? <ImageMoreActions index={index + 1} triggerId={inputId + "-" + image.image_id} busy={busy} onReplace={trigger => openUpload(trigger, image.image_id)} onRemove={() => removeImage(image.image_id)} /> : <>
          <button className="button button-secondary button-small" type="button" data-upload-trigger={inputId + "-" + image.image_id} aria-disabled={busy || undefined} onClick={event => { if (!busy) openUpload(event.currentTarget, image.image_id); }}>Replace image {index + 1}</button>
          <button className="text-button" type="button" disabled={busy} onClick={() => removeImage(image.image_id)}>Remove image {index + 1}</button>
        </>}
      </div>}
    </figure>)}</div>}
    {!resource.loading && !resource.error && !resource.rows.length && <p className="muted-copy">No images attached.</p>}
    {!readOnly && <>{!publication && attachButton}
    <FormDialog discardLabel={publication || path.startsWith("my/") ? "Discard changes" : "Confirm"} open={uploadOpen} title={replacing ? "Replace image" : "Attach image"} returnFocusRef={uploadTrigger} returnFocus={findUploadTrigger} onClose={closeUpload}><form onSubmit={upload} aria-busy={busy}>
      <ErrorNotice error={error} fields={{ image: { id: inputId, label: "Image" } }} />
      <Field label={replacing ? "Replacement image" : "Attach image"} name={inputId} error={error?.errors?.image} hint="JPEG, PNG or WebP. Up to 5 MiB, 4096 pixels per side, 8 million pixels; maximum 5 images. Images are saved as JPEG without metadata.">
        <input ref={input} id={inputId} type="file" accept="image/jpeg,image/png,image/webp" disabled={busy || (!replacing && resource.rows.length >= 5) || resource.loading || Boolean(resource.error)} onChange={event => { setSelected(event.target.files?.[0] || null); setError(null); }} />
      </Field>
      {preview && <img className="selected-image-preview" src={preview} alt="Selected image preview, not yet uploaded" />}
      <div className="form-actions"><button className="button button-primary" type="submit" disabled={busy || !selected}>{busy ? "Uploading image..." : replacing ? "Save replacement" : "Upload image"}</button>
        {selected && <button className="button button-secondary" type="button" disabled={busy} onClick={() => { setSelected(null); input.current.value = ""; input.current.focus(); }}>Clear selected file</button>}
      </div>
    </form></FormDialog></>}
  </Panel>;
}

export function ReportImages({ report, kind }) {
  const readOnly = report.status !== (kind === "finder" ? "PENDING" : "OPEN");
  const [open, setOpen] = useState(false);
  const button = useRef(null);
  return <div><button ref={button} type="button" className="button button-secondary button-small" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "Close photos" : readOnly ? "View photos" : "Manage photos"} for report #{report.report_id}</button>
    {open && <ImageManager path={"my/" + kind + "-reports/" + report.report_id + "/images"} readOnly={readOnly} />}
  </div>;
}
