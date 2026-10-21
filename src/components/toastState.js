export const TOAST_DURATION = 8000;

// Keep the bottom-right anchor, moving upward only when a control occupies it.
export function toastLift({ viewportHeight, height, gap, left, right, controls }) {
  let bottom = viewportHeight - gap;
  const obstacles = controls.filter(box => box.right > left && box.left < right && box.bottom > 0 && box.top < viewportHeight).sort((a, b) => b.bottom - a.bottom);
  for (const box of obstacles) {
    if (box.top < bottom && box.bottom > bottom - height) bottom = box.top - 8;
  }
  return bottom - height >= 8 ? Math.max(0, viewportHeight - gap - bottom) : 0;
}

export function toastReducer(state, action) {
  if (action.type === "reset") return action.toast ? [action.toast] : [];
  if (action.type === "dismiss") return state.filter(toast => toast.id !== action.id);
  if (action.type === "add") {
    if (state.some(toast => toast.key === action.toast.key)) return state;
    return [action.toast];
  }
  return state;
}
