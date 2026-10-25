import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import { LoadingState } from "./ui";

export default function FinderReportPhoto({ path, version, index }) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState({ phase: "loading", url: "", message: "" });
  const root = useRef(null), retryFocus = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    let active = true, url;
    setState({ phase: "loading", url: "", message: "" });
    api(path, { responseType: "blob", signal: controller.signal }).then(blob => {
      if (!active) return;
      if (!blob.size || !/^image\/(jpeg|png|webp)$/i.test(blob.type)) throw new Error("image_response");
      url = URL.createObjectURL(blob);
      setState({ phase: "loading", url, message: "" });
    }).catch(error => {
      if (!active || error.name === "AbortError") return;
      const message = error.status === 404 ? "This photo could not be found. Retry loading the photo."
        : error.status === 403 ? "You no longer have permission to view this photo."
        : error.message === "image_response" ? "The server did not return a readable photo. Retry loading the photo."
        : "We couldn't load this photo. Check your connection and retry.";
      setState({ phase: "error", url: "", message });
    });
    return () => { active = false; controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [path, version, revision]);

  return <div className="finder-report-photo" ref={root} tabIndex="-1" aria-label={"Report photo " + index} aria-busy={state.phase === "loading"}>
    {state.url && <img className="item-photograph" src={state.url} alt={"Private item photograph " + index} hidden={state.phase !== "ready"}
      onLoad={() => { setState(previous => ({ ...previous, phase: "ready" })); if (retryFocus.current) { root.current?.focus({ preventScroll: true }); retryFocus.current = false; } }}
      onError={() => setState(previous => ({ ...previous, phase: "error", message: "This photo could not be displayed. Retry loading the photo." }))} />}
    {state.phase === "loading" && <LoadingState label={"Loading photo " + index + "..."} />}
    {state.phase === "error" && <div className="finder-photo-error"><p role="alert">{state.message}</p><button className="button button-secondary button-small" type="button" onClick={() => { retryFocus.current = true; setRevision(value => value + 1); }}>Retry photo {index}</button></div>}
  </div>;
}
