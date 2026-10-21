import { api } from "./client.js";
import { validateDraftImage } from "./recordImage.js";

export async function submitOwnershipClaim(itemId, evidence, image, request = api) {
  await validateDraftImage(image);
  const body = new FormData();
  body.append("evidence_text", evidence);
  if (image) body.append("image", image);
  return request("my/items/" + itemId + "/claims", { method: "POST", body });
}
