const labels = {
  authorization: "Reset session", code: "Reset code", login: "Username or email", email: "Email address", username: "Username", password: "Password", password_confirmation: "Confirm password", current_password: "Current password",
  full_name: "Full name", name: "Account display name", staff_full_name: "Staff identity name", contact_details: "Contact details",
  item_description: "Item description", evidence_text: "Evidence of ownership", public_description: "Public summary", category_id: "Category", finder_id: "Finder",
  location_id: "Storage location", initial_location_id: "Initial storage location", found_place: "Where did you find it?", found_at: "When did you find it?", lost_at: "When was it last seen?", last_known_location: "Last-known location",
  received_from: "Received from", received_to: "Received through", q: "Search", status: "Status", image: "Image", location_code: "Location code", location_description: "Description", category_name: "Category name", claimant_id: "Claimant", form: "Form",
};
export function knownField(name) { return Object.prototype.hasOwnProperty.call(labels, name); }
export function fieldLabel(name, fields = {}) { return fields[name]?.label || labels[name] || name.replaceAll("_", " ").replace(/^./, letter => letter.toUpperCase()); }
export function readableMessage(message, fields = {}) {
  const keys = [...new Set([...Object.keys(labels).filter(key => key.includes("_") || key === "q"), ...Object.keys(fields)])];
  const alternatives = keys.sort((a, b) => b.length - a.length).map(key => key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  // Replace original identifiers once, so a readable "full name" is never rewritten as an account name.
  return String(message).replace(new RegExp("\\b(?:" + alternatives + ")\\b", "g"), key => fieldLabel(key, fields).toLowerCase());
}
