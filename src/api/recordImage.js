import { api, ApiError } from "./client.js";

export const IMAGE_RULES = "JPEG, PNG or WebP; up to 5 MiB, 4096 pixels per side and 8 million pixels. Saved as JPEG without metadata.";
export function imageFileError(file) {
  if (!file) return null;
  if (!/\.(jpe?g|png|webp)$/i.test(file.name) || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) return "Choose a JPEG, PNG or WebP image.";
  if (file.size > 5 * 1024 * 1024) return "Choose an image no larger than 5 MiB.";
  return null;
}
export async function validateDraftImage(file) {
  if (!file) return;
  let message = imageFileError(file), bitmap;
  if (!message) {
    try {
      bitmap = await createImageBitmap(file);
      if (Math.max(bitmap.width, bitmap.height) > 4096 || bitmap.width * bitmap.height > 8000000) message = "Choose an image up to 4096 pixels per side and 8 million pixels.";
    } catch { message = "This image could not be read. Choose a valid JPEG, PNG or WebP."; }
    finally { bitmap?.close(); }
  }
  if (message) throw new ApiError("Check the selected image.", 422, { image: [message] });
}

// Creation and attachment are separate existing API operations. Remember the
// confirmed record before uploading, so correcting a rejected image never
// submits the record twice. Ambiguous writes require inspection, not a retry.
export async function saveRecordImage(state, { create, file, imagePath, request = api }) {
  if (state.uncertain) throw new ApiError("Check the saved record's images before uploading again.");
  if (!state.record) state.record = await create();
  if (file) {
    const body = new FormData(); body.append("image", file);
    try { await request(imagePath(state.record), { method: "POST", body }); }
    catch (error) {
      state.uncertain = ![400, 403, 404, 409, 413, 422, 429].includes(error.status);
      throw error;
    }
  }
  return state.record;
}
