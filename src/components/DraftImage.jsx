import { useEffect, useRef, useState } from "react";
import { Field } from "./ui";
import { IMAGE_RULES, imageFileError, saveRecordImage, validateDraftImage } from "../api/recordImage";
import "./Images.css";

export function useRecordImage() {
  const state = useRef({});
  const [file, setFile] = useState(null);
  return {
    file, setFile, record: state.current.record, uncertain: state.current.uncertain,
    async save(create, imagePath) {
      await validateDraftImage(file);
      return saveRecordImage(state.current, { create, imagePath, file });
    },
    reset() { state.current = {}; setFile(null); },
  };
}

export function DraftImage({ draft, id, error, busy, intake = false, onViewSaved, onChange, label = "Photo" }) {
  const input = useRef(null);
  const [preview, setPreview] = useState(null);
  useEffect(() => {
    if (!draft.file || imageFileError(draft.file)) { setPreview(null); return; }
    const url = URL.createObjectURL(draft.file); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [draft.file]);
  return <section className="draft-image" aria-label={label === "Photo" ? "Item photo" : label}>
    {draft.record && <div className="notice notice-info" role="status">
      <p>{intake ? "The item and storage assignment were saved." : "Your report was saved."} {draft.uncertain ? "We couldn't confirm the image upload. View the saved record and check its images before uploading again." : "The image was not uploaded. Replace or remove it, then finish saving; this will not create another record."}</p>
      <button className="button button-secondary" type="button" disabled={busy} onClick={() => onViewSaved(draft.record)}>View saved {intake ? "item" : "report"}</button>
    </div>}
    <Field label={(draft.file ? "Replace " + label.toLowerCase() : label) + " (optional)"} name={id} error={error?.errors?.image || (imageFileError(draft.file) ? [imageFileError(draft.file)] : undefined)} hint={IMAGE_RULES}>
      <input ref={input} id={id} type="file" accept="image/jpeg,image/png,image/webp" disabled={busy || draft.uncertain} onChange={event => { if (event.target.files?.[0]) { draft.setFile(event.target.files[0]); onChange(); } }} />
    </Field>
    <p className="muted-copy">{intake ? "This photo stays private until staff separately approve it and publish the item." : "Only you and authorized staff can view this photo. It is not copied to a public listing."}</p>
    {preview && <img className="selected-image-preview" src={preview} alt="Selected photo preview, not yet uploaded" />}
    {draft.file && <button className="button button-secondary" type="button" disabled={busy || draft.uncertain} onClick={() => { draft.setFile(null); onChange(); input.current.value = ""; input.current.focus(); }}>Remove selected photo</button>}
  </section>;
}
