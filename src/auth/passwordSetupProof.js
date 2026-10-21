// Survives the authentication boundary remount in this tab, never a full reload or browser storage.
let proof = "";
export function readSetupProof(search) {
  const supplied = new URLSearchParams(search).getAll("token");
  if (supplied.length) proof = supplied.length === 1 && /^[A-Za-z0-9]{64}$/.test(supplied[0]) ? supplied[0] : "";
  return proof;
}
export function clearSetupProof() { proof = ""; }
