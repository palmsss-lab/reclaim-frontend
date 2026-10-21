import { useState } from "react";
import "./PasswordInput.css";

export function PasswordInput({ id, ...props }) {
  const [visible, setVisible] = useState(false);
  return <span className="password-input">
    <input {...props} id={id} type={visible ? "text" : "password"} />
    <button className="password-toggle" type="button" aria-controls={id} aria-label={visible ? "Hide password" : "Show password"} onClick={() => setVisible(current => !current)}>
      <svg aria-hidden="true" focusable="false" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {visible ? <><path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A10.5 10.5 0 0 1 12 5c7 0 10 7 10 7a16 16 0 0 1-3.2 4.2M6.5 6.5A17 17 0 0 0 2 12s3 7 10 7a11 11 0 0 0 5.5-1.5" /></> : <><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>}
      </svg>
    </button>
  </span>;
}
