import { useRef } from "react";
import "./ResetCodeInput.css";

export function ResetCodeInput({ value, onChange, error, disabled, id = "reset-code", label = "Reset code" }) {
  const inputs = useRef([]);
  function enter(index, text) {
    const digits = text.replace(/[^0-9]/g, "");
    if (text && !digits) return;
    const next = [...value];
    if (!text) next[index] = "";
    else {
      const start = digits.length >= 6 ? 0 : index;
      [...digits.slice(0, 6 - start)].forEach((digit, offset) => { next[start + offset] = digit; });
      inputs.current[Math.min(start + digits.length, 5)]?.focus();
    }
    onChange(next);
  }
  function keyDown(event, index) {
    if (event.key === "Backspace" && !value[index] && index > 0) {
      event.preventDefault();
      const next = [...value]; next[index - 1] = ""; onChange(next);
      inputs.current[index - 1]?.focus();
    } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      inputs.current[Math.max(0, Math.min(5, index + (event.key === "ArrowLeft" ? -1 : 1)))]?.focus();
    }
  }
  return <fieldset className="reset-code-group" disabled={disabled}>
    <legend>{label} <span className="required-marker" aria-hidden="true">*</span></legend>
    <div className="reset-code-boxes">
      {value.map((digit, index) => <input key={index} ref={node => { inputs.current[index] = node; }}
        id={index === 0 ? id : id + "-" + (index + 1)}
        type="text" inputMode="numeric" autoComplete={index === 0 ? "one-time-code" : "off"}
        aria-label={"Digit " + (index + 1) + " of 6"} aria-invalid={error ? true : undefined}
        aria-describedby={id + "-hint" + (error ? " " + id + "-error" : "")}
        maxLength={index === 0 ? 6 : 1} pattern="[0-9]" value={digit} required
        onFocus={event => event.target.select()} onChange={event => enter(index, event.target.value)}
        onKeyDown={event => keyDown(event, index)}
        onPaste={event => { event.preventDefault(); const text = event.clipboardData.getData("text"); if (/[0-9]/.test(text)) enter(index, text); }} />)}
    </div>
    <small id={id + "-hint"}>You can paste all six digits.</small>
    {error && <small className="field-error" id={id + "-error"}>{Array.isArray(error) ? error[0] : error}</small>}
  </fieldset>;
}
