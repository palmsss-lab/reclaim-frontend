import { useId, useRef } from "react";
import "./StatusTabs.css";

export function StatusTabs({ label, options, value, counts, onChange, children }) {
  const id = useId(), buttons = useRef([]);
  function keyboard(event, index) {
    let next;
    if (event.key === "ArrowRight") next = (index + 1) % options.length;
    if (event.key === "ArrowLeft") next = (index + options.length - 1) % options.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = options.length - 1;
    if (next === undefined) return;
    event.preventDefault(); onChange(options[next].value); buttons.current[next]?.focus();
  }
  return <><div className="status-tabs" role="tablist" aria-label={label}>
    {options.map((option, index) => <button key={option.value} ref={el => { buttons.current[index] = el; }} id={id + "-" + option.value} type="button" role="tab" aria-selected={value === option.value} aria-controls={id + "-panel"} tabIndex={value === option.value ? 0 : -1} onClick={() => onChange(option.value)} onKeyDown={event => keyboard(event, index)}>
      {option.label} <span className="status-tab-count">{counts?.[option.value] ?? "..."}</span>
    </button>)}
  </div><div role="tabpanel" id={id + "-panel"} aria-labelledby={id + "-" + value} tabIndex="0">{children}</div></>;
}
