import { useEffect, useId, useRef, useState } from "react";
import { useConfirm } from "./Confirmation";
import "./FormDialog.css";
import { trapDialogFocus } from "./dialogFocus";
import { gsap } from "gsap";

export function FormDialog({ open, title, description, onClose, returnFocusRef, returnFocus, children, className = "", discardLabel = "Confirm", closeLabel }) {
  const dialogRef = useRef(null);
  const titleId = useId();
  const triggerRef = useRef(null);
  const dirtyRef = useRef(false);
  const openedRef = useRef(false);
  const focusTimerRef = useRef(null);
  const [pending, setPending] = useState(false);
  const returnFocusRefLatest = useRef(returnFocus);
  useEffect(() => { returnFocusRefLatest.current = returnFocus; }, [returnFocus]);
  const confirm = useConfirm();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (open && dialog && !dialog.open) {
      window.clearTimeout(focusTimerRef.current);
      triggerRef.current = returnFocusRef?.current || document.activeElement;
      dirtyRef.current = false;
      dialog.showModal();
      openedRef.current = true;
      const target = dialog.querySelector("[data-dialog-initial-focus]:not(:disabled)")
        || dialog.querySelector('form input:not([type="hidden"]):not(:disabled), form textarea:not(:disabled), form select:not(:disabled), form button:not(:disabled)')
        || dialog.querySelector("[data-dialog-close]:not(:disabled)") || dialog.querySelector("h2");
      target?.focus({ preventScroll: true });
    } else if (!open && dialog?.open) {
      dialog.close();
      if (openedRef.current) {
        openedRef.current = false;
        focusTimerRef.current = window.setTimeout(() => {
          const fallback = returnFocusRefLatest.current?.();
          const target = triggerRef.current?.isConnected ? triggerRef.current : fallback;
          if (target?.isConnected && !target.disabled) target.focus({ preventScroll: true });
        }, 0);
      }
    }
  }, [open, returnFocusRef]);

  useEffect(() => () => { window.clearTimeout(focusTimerRef.current); if (dialogRef.current?.open) dialogRef.current.close(); }, []);

  useEffect(() => {
    if (!open) return;
    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.fromTo(dialogRef.current, { y: 6 }, { y: 0, duration: .16, ease: "power2.out", clearProps: "transform" });
    });
    return () => media.revert();
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog) { setPending(false); return undefined; }
    const update = () => setPending(Boolean(dialog.querySelector('form[aria-busy="true"]')));
    update();
    const observer = new MutationObserver(update);
    observer.observe(dialog, { subtree: true, childList: true, attributes: true, attributeFilter: ["aria-busy"] });
    return () => observer.disconnect();
  }, [open]);

  useEffect(() => {
    if (pending && !dialogRef.current?.contains(document.activeElement)) dialogRef.current?.querySelector("h2")?.focus();
  }, [pending]);

  async function requestClose() {
    const dialog = dialogRef.current;
    if (!dialog || !open || dialog.querySelector('form[aria-busy="true"]')) return;
    if (dirtyRef.current && !await confirm("Discard your unsaved changes?", { confirmLabel: discardLabel })) return;
    dirtyRef.current = false;
    onClose();
  }

  function markDirty(event) { if (event.target.closest("dialog") === dialogRef.current) dirtyRef.current = true; }

  return <dialog ref={dialogRef} className={`form-dialog ${className}`} aria-labelledby={titleId}
    onKeyDown={event => { if (event.target.closest("dialog") === dialogRef.current) trapDialogFocus(event, dialogRef.current); }}
    onCancel={(event) => { if (event.target === dialogRef.current) { event.preventDefault(); requestClose(); } }}
    onClick={(event) => { if (event.target === dialogRef.current) requestClose(); }}>
    <div className="form-dialog-card">
      <header className="form-dialog-header">
        <div><h2 id={titleId} tabIndex="-1">{title}</h2>{description && <p>{description}</p>}</div>
        <button data-dialog-close className="form-dialog-close" type="button" aria-label={closeLabel || `Close ${title} form`} disabled={pending} onClick={requestClose}>
          <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 6 12 12M18 6 6 18" /></svg>
        </button>
      </header>
      {open && <div className="form-dialog-body" onInput={markDirty} onChange={markDirty}>{children}</div>}
    </div>
  </dialog>;
}
