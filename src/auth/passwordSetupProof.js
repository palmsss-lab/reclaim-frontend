// Survives the authentication boundary remount in this tab, never a full reload or browser storage.
let proof = "";
export function readSetupProof(search) {
  const supplied = new URLSearchParams(search).get("token");
  if (supplied) proof = supplied;
  return proof;
}
export function clearSetupProof() { proof = ""; }
