import { api, initializeCsrf } from "../api/client.js";

export function base64url(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

// Each popup has a separate in-memory verifier. No tokens or OAuth proofs enter browser storage.
export async function googlePopup({ linking = false, currentPassword = "", signal } = {}) {
  const popup = window.open("about:blank", "_blank", "popup,width=520,height=700");
  if (!popup) throw new Error("Allow popups for Reclaim, then try Google sign-in again.");
  let timer, listener, abort;
  try {
    if (!linking) await initializeCsrf();
    const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
    const challenge = base64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
    const prefix = linking ? "me/google" : "auth/google";
    const start = await api(prefix + "/start", { method: "POST", signal,
      body: { challenge, ...(linking ? { current_password: currentPassword } : {}) } });
    const target = new URL(start.url);
    if (target.origin !== "https://accounts.google.com") throw new Error("The server returned an invalid Google sign-in address.");
    const message = await new Promise((resolve, reject) => {
      let closedAt = null;
      const deadline = Date.now() + 5 * 60 * 1000;
      listener = event => {
        if (event.origin !== start.callback_origin || event.source !== popup || event.data?.type !== "reclaim:google") return;
        resolve(event.data);
      };
      abort = () => reject(new Error("Google sign-in was cancelled."));
      window.addEventListener("message", listener);
      signal?.addEventListener("abort", abort, { once: true });
      if (signal?.aborted) { abort(); return; }
      timer = setInterval(() => {
        if (popup.closed) closedAt ??= Date.now();
        if ((closedAt && Date.now() - closedAt > 750) || Date.now() > deadline) abort();
      }, 250);
      popup.location.replace(target.href);
    });
    if (message.error) throw new Error(message.error);
    if (!/^[A-Za-z0-9_-]{43}$/.test(message.code || "")) throw new Error("Google sign-in returned an invalid response.");
    return await api(prefix + "/exchange", { method: "POST", signal, body: { code: message.code, verifier } });
  } finally {
    clearInterval(timer);
    if (listener) window.removeEventListener("message", listener);
    if (abort) signal?.removeEventListener("abort", abort);
    if (!popup.closed) popup.close();
  }
}
