export function trapDialogFocus(event, root) {
  if (event.key !== "Tab" || !root) return;
  const controls = [...root.querySelectorAll('button:not(:disabled), input:not([type="hidden"]):not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]')].filter(el => el.getClientRects().length);
  const first = controls[0], last = controls.at(-1);
  if (!first) { event.preventDefault(); root.focus(); return; }
  if (event.shiftKey && (document.activeElement === first || !controls.includes(document.activeElement))) {
    event.preventDefault(); last.focus();
  } else if (!event.shiftKey && (document.activeElement === last || !controls.includes(document.activeElement))) {
    event.preventDefault(); first.focus();
  }
}
