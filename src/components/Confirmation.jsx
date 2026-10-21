import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from "react";
import "./Confirmation.css";
import { trapDialogFocus } from "./dialogFocus";

const ConfirmationContext = createContext(null);

export function ConfirmationProvider({ children }) {
  const [message, setMessage] = useState(null);
  const pending = useRef(null);
  const dialog = useRef(null);
  const titleId = useId();
  const descriptionId = useId();
  const confirm = useCallback((text, options = {}) => {
    if (pending.current) return Promise.resolve(false);
    return new Promise(resolve => {
      pending.current = { resolve, trigger: document.activeElement };
      setMessage({ text, confirmLabel: options.confirmLabel || "Confirm", danger: options.danger === true });
    });
  }, []);
  const finish = useCallback(accepted => {
    const current = pending.current;
    pending.current = null;
    dialog.current?.close();
    setMessage(null);
    current?.resolve(accepted);
    requestAnimationFrame(() => {
      if (pending.current || !current?.trigger?.isConnected) return;
      const parentDialog = current.trigger.closest("dialog");
      if (parentDialog && !parentDialog.open) return;
      if (!current.trigger.disabled) current.trigger.focus();
      else parentDialog?.querySelector("h2")?.focus();
    });
  }, []);
  useEffect(() => {
    if (message !== null) dialog.current?.showModal();
  }, [message]);
  useEffect(() => () => { pending.current?.resolve(false); pending.current = null; }, []);
  return <ConfirmationContext.Provider value={confirm}>
    {children}
    {message !== null && <dialog ref={dialog} className="confirmation-dialog" aria-labelledby={titleId} aria-describedby={descriptionId} onKeyDown={event => trapDialogFocus(event, dialog.current)} onCancel={event => { event.preventDefault(); finish(false); }}>
      <h2 id={titleId}>Confirm action</h2>
      <p id={descriptionId}>{message.text}</p>
      <div className="dialog-actions">
        <button className="button button-secondary" type="button" autoFocus onClick={() => finish(false)}>Cancel</button>
        <button className={"button " + (message.danger ? "button-danger" : "button-primary")} type="button" onClick={() => finish(true)}>{message.confirmLabel}</button>
      </div>
    </dialog>}
  </ConfirmationContext.Provider>;
}

export function useConfirm() {
  const confirm = useContext(ConfirmationContext);
  if (!confirm) throw new Error("useConfirm requires ConfirmationProvider.");
  return confirm;
}
