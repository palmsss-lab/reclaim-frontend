import { useLayoutEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router";

export default function RouteFocus() {
  const location = useLocation();
  const action = useNavigationType();
  const positions = useRef(new Map());
  const previousKey = useRef(null);
  const point = useRef([0, 0]);

  useLayoutEffect(() => {
    const original = history.scrollRestoration;
    history.scrollRestoration = "manual";
    const remember = () => { point.current = [scrollX, scrollY]; };
    window.addEventListener("scroll", remember, { passive: true });
    return () => { history.scrollRestoration = original; window.removeEventListener("scroll", remember); };
  }, []);

  useLayoutEffect(() => {
    if (previousKey.current) positions.current.set(previousKey.current, point.current);
    previousKey.current = location.key;
    const saved = action === "POP" ? positions.current.get(location.key) : null;
    let finished = false;
    const stop = () => { finished = true; changes.disconnect(); sizes.disconnect(); };
    const positionPage = () => {
      if (finished || document.querySelector("dialog[open]")) return;
      const main = document.getElementById("main");
      if (!main) return;
      main.setAttribute("tabindex", "-1");
      if (saved) {
        scrollTo({ left: saved[0], top: saved[1], behavior: "instant" });
        point.current = [scrollX, scrollY];
        if (Math.abs(scrollY - saved[1]) < 2) {
          if (document.activeElement === document.body) main.focus({ preventScroll: true });
          stop();
        }
        return;
      }
      let anchor;
      try { anchor = location.hash ? document.getElementById(decodeURIComponent(location.hash.slice(1))) : null; } catch { /* Invalid hashes have no focus target. */ }
      const target = anchor || main.querySelector("[data-notification-target]") || main;
      if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
      target.focus({ preventScroll: true });
      if (target === main) scrollTo({ top: 0, left: 0, behavior: "instant" });
      else target.scrollIntoView({ block: "start", behavior: "instant" });
      point.current = [scrollX, scrollY];
      stop();
    };
    // Authentication and API responses can change page height after history navigation.
    const changes = new MutationObserver(positionPage);
    const sizes = new ResizeObserver(positionPage);
    const root = document.getElementById("root") || document.body;
    changes.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["open"] });
    sizes.observe(root);
    const cancel = () => stop();
    for (const event of ["wheel", "touchstart", "pointerdown", "keydown"]) window.addEventListener(event, cancel, { passive: true, once: true });
    positionPage();
    return () => { stop(); for (const event of ["wheel", "touchstart", "pointerdown", "keydown"]) window.removeEventListener(event, cancel); };
  }, [location.key, location.pathname, location.search, location.hash, action]);

  return null;
}
