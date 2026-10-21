import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useReducer, useRef, useState } from "react";
import { toastLift, toastReducer, TOAST_DURATION } from "./toastState";
import "./Toast.css";

const ToastContext = createContext(null);
const ToastResetContext = createContext(null);

function Toast({ toast, dismiss }) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(document.visibilityState === "hidden");
  useEffect(() => {
    const update = () => setHidden(document.visibilityState === "hidden");
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  useEffect(() => {
    if (hovered || focused || hidden) return;
    const timer = setTimeout(() => dismiss(toast.id), TOAST_DURATION);
    return () => clearTimeout(timer);
  }, [toast.id, dismiss, hovered, focused, hidden]);
  return <div className="success-toast" data-toast-id={toast.id} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onFocus={() => setFocused(true)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}>
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m5 12 4 4L19 6" /></svg>
    <span role="status" aria-live="polite" aria-atomic="true">{toast.message}</span>
    <button type="button" className="toast-close" aria-label="Dismiss notification" onClick={() => dismiss(toast.id)}><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 6 12 12M18 6 6 18" /></svg></button>
  </div>;
}

export function ToastProvider({ children }) {
  const [toasts, dispatch] = useReducer(toastReducer, []);
  const region = useRef(null);
  const sequence = useRef(0);
  const notify = useCallback((message, key) => {
    const id = ++sequence.current;
    dispatch({ type: "add", toast: { id, key: key ?? id, message } });
  }, []);
  const dismiss = useCallback(id => dispatch({ type: "dismiss", id }), []);
  const reset = useCallback(message => dispatch({ type: "reset", toast: message ? { id: ++sequence.current, key: "authentication", message } : null }), []);
  useLayoutEffect(() => {
    if (!toasts.length) return undefined;
    const element = region.current;
    function position() {
      const bounds = element.getBoundingClientRect();
      const previousLift = parseFloat(element.style.getPropertyValue("--toast-lift")) || 0;
      const gap = parseFloat(getComputedStyle(element).bottom) - previousLift;
      const controls = [...document.querySelectorAll("a, button, input, select, textarea, summary, [role='button']")]
        .filter(control => !element.contains(control) && control.getClientRects().length)
        .map(control => control.getBoundingClientRect());
      const lift = toastLift({ viewportHeight: innerHeight, height: bounds.height, gap, left: bounds.left, right: bounds.right, controls });
      element.style.setProperty("--toast-lift", lift + "px");
    }
    position();
    const observer = new ResizeObserver(position);
    observer.observe(document.body);
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, { capture: true, passive: true });
    return () => { observer.disconnect(); window.removeEventListener("resize", position); window.removeEventListener("scroll", position, true); };
  }, [toasts]);
  return <ToastResetContext.Provider value={reset}><ToastContext.Provider value={notify}>{children}<aside ref={region} className="toast-region" aria-label="Notifications">{toasts.map(toast => <Toast key={toast.id} toast={toast} dismiss={dismiss} />)}</aside></ToastContext.Provider></ToastResetContext.Provider>;
}

export function useToastReset() {
  const reset = useContext(ToastResetContext);
  if (!reset) throw new Error("useToastReset requires ToastProvider");
  return reset;
}

export function useSuccessToast() {
  const notify = useContext(ToastContext);
  if (!notify) throw new Error("useSuccessToast requires ToastProvider");
  return notify;
}
