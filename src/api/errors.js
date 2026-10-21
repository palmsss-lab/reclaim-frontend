// Match actual Laravel validation templates and application-owned messages.
// Never pass arbitrary exception text, attributes, or debug payloads to the UI.
import { knownField } from "../components/validation.js";

export const SESSION_MESSAGE = "Please sign in again to continue.";
const messages = Object.assign(Object.create(null), {
  "The provided credentials are invalid.": "Your sign-in details are incorrect. Please try again.",
  "This account is inactive.": "This account is inactive. Contact Reclaim support for help.",
  "Verify your email address before using this feature.": "Verify your email before continuing. Open the verification link in your email or request a new one.",
  "The verification link is invalid.": "This verification link is invalid. Request a new link and try again.",
  "The password reset link is invalid or expired.": "This password reset link is invalid or has expired. Request a new reset email.",
  "The password setup link is invalid, expired, or already used. Request a new link from Account Settings.": "This setup link is no longer valid. Request another setup email from your account settings.",
  "Google sign-in is not configured. Use your existing sign-in method.": "Google sign-in is unavailable right now. Use your existing sign-in method.",
  "Confirm your current Reclaim password to link Google.": "Enter your current Reclaim password before linking Google.",
  "The Google attempt expired or was already used.": "This Google sign-in attempt has expired. Start sign-in again.",
  "Invalid sign-in attempt.": "Sign-in could not be completed. Start sign-in again.",
  "Sign-in or linking could not be completed. Sign in with your existing method and check Account Settings.": "Sign-in or linking could not be completed. Use your existing sign-in method and check your profile.",
  "This item has already been returned.": "This item has already been returned. Refresh the item record to see its current status.",
  "A returned item cannot be transferred.": "This item has been returned and cannot be moved to another storage location.",
  "A returned item cannot receive new claims.": "This item has been returned and is no longer available to claim.",
  "This person already has a claim for this item.": "A claim for this item already exists. Open the existing claim to check its status.",
  "This item is not currently available for public claims.": "This item is not available to claim right now. Return to the listings and refresh them.",
  "Only a pending claim can be rejected.": "This claim is no longer pending. Refresh the record before reviewing it again.",
  "An item can only be returned against a pending claim.": "This claim is no longer pending. Refresh the record before returning the item.",
  "The claim changed during review.": "This claim changed while you were reviewing it. Refresh the record before continuing.",
  "The selected claim changed during return.": "This claim changed while the return was being recorded. Refresh the item and check its status before trying again.",
  "The other pending claims changed during return.": "The claims changed while the return was being recorded. Refresh the item and check its status before trying again.",
  "The claim was not found for this item.": "This claim could not be found for this item. Return to Claims and refresh the queue.",
  "The item must have exactly one open storage assignment.": "The item's storage record needs checking. Refresh the record; if this continues, ask Reclaim support for help.",
  "The current storage assignment changed during transfer.": "The item's storage location changed during the transfer. Refresh its storage history before trying again.",
  "The current storage assignment changed during return.": "The item's storage location changed during the return. Refresh the item and check its status before trying again.",
  "Only currently stored items can be published.": "This item is not currently stored and cannot be published. Refresh the item record.",
  "No active public listing exists for this item.": "This item has no active public listing. Refresh the item record.",
  "Only pending finder reports can be withdrawn.": "This report is no longer pending and cannot be withdrawn. Refresh your reports to check its status.",
  "This finder report is no longer pending handover.": "This report is no longer pending handover. Refresh the report before continuing.",
  "Only pending finder reports can be closed.": "This report is no longer pending and cannot be closed. Refresh it to check its status.",
  "Only open missing-item reports can be edited.": "This report is no longer open and cannot be edited. Refresh your reports to check its status.",
  "Only open missing-item reports can be resolved or withdrawn.": "This report is no longer open. Refresh your reports to check its status before continuing.",
  "Withdrawn reports cannot be reviewed.": "This report has been withdrawn and cannot be reviewed. Refresh the report queue.",
  "Images can only be changed on an active report.": "This report is no longer active. Refresh it before changing its images.",
  "Images can only be changed on a currently stored item.": "This item is no longer stored. Refresh it before changing its images.",
  "A report or item can have at most five images.": "Five images are already attached. Remove an image before adding another.",
  "A deactivated account cannot become an administrator.": "This staff account is inactive and cannot receive administrator access.",
  "Only an account linked to staff can become an administrator.": "Administrator access can only be assigned to a staff account.",
  "The last active administrator cannot be demoted.": "At least one active account administrator is required. Assign another administrator before removing this access.",
  "The last active administrator cannot be deactivated.": "At least one active account administrator is required. Assign another administrator before deactivating this staff account.",
  "The account is already deactivated.": "This staff account is already inactive. Refresh the directory to see its current status.",
});

const validationMessages = Object.assign(Object.create(null), {
  "Your password-reset session is invalid or has expired. Request another code.": "Your password-reset session is invalid or has expired. Request another code.",
  "Enter the six-digit code from your email.": "Enter the six-digit code from your email.",
  "This reset code is incorrect, expired, or no longer valid. Request another code.": "This reset code is incorrect, expired, or no longer valid. Request another code.",
  "The current password is incorrect.": "The current password is incorrect. Try again.",
  "The password is incorrect.": "The password is incorrect. Try again.",
  "This username is unavailable. Choose another.": "This username is unavailable. Choose another.",
  "Ownership evidence must not be blank.": "Enter evidence of ownership.",
  "Choose a different storage location.": "Choose a different storage location.",
  "The selected storage location no longer exists.": "This storage location is no longer available. Refresh the available locations and choose another.",
  "The selected claimant no longer exists.": "This claimant is no longer available. Refresh the record before continuing.",
  "The found time cannot be later than the receipt time.": "Choose a found date and time before the item was received.",
  "The end date must be on or after the start date.": "Choose an end date on or after the start date.",
  "The received to date must be on or after the received from date.": "Choose an end date on or after the start date.",
  "Use a valid JPEG, PNG or WebP, at most 5 MiB, 4096 pixels per side and 8 million pixels.": "Choose a valid JPEG, PNG or WebP, up to 5 MiB, 4096 pixels per side and 8 million pixels.",
});

function validationText(field, message) {
  if (validationMessages[message]) return validationMessages[message];
  if (messages[message]) return messages[message];
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const prefix = new RegExp("^The (?:selected )?(?:" + escaped + "|" + escaped.replaceAll("_", " ") + ")(?: field)? ");
  const rule = String(message).replace(prefix, "");
  if (rule === message) return "Check this value and try again.";
  if (["is required.", "must have a value."].includes(rule)) return "Complete this field.";
  if (rule === "confirmation does not match.") return "The passwords do not match. Enter the same password in both fields.";
  if (rule === "has already been taken.") return "This value is already in use. Choose another.";
  if (rule === "must be a valid email address.") return "Enter a valid email address.";
  if (rule === "is invalid.") return field === "username" ? "Start with a letter and use only letters, numbers, dots, underscores or hyphens." : "Choose an available option.";
  let match = rule.match(/^must (?:not be greater than|not have more than) (\d{1,6}) characters\.$/);
  if (match) return "Use at most " + match[1] + " characters.";
  match = rule.match(/^must have at least (\d{1,6}) characters\.$/);
  if (match) return "Use at least " + match[1] + " characters.";
  if (rule === "must be a valid date.") return "Enter a valid date and time.";
  if (/^must be a date (?:before|before or equal to) /.test(rule)) return "Choose an earlier date and time.";
  if (/^must be a date (?:after|after or equal to) /.test(rule)) return "Choose a date on or after the start date.";
  if (field === "image" && /^(?:must be an image|must be a file|must be a file of type:|must not be greater than|has invalid image dimensions)/.test(rule)) return "Choose a JPEG, PNG or WebP within the upload limits shown below.";
  return "Check this value and try again.";
}

export function failureDetails(status, payload, { path = "", method = "GET", retryAfter } = {}) {
  const original = typeof payload?.message === "string" ? payload.message : "";
  const errors = Object.create(null);
  if (status === 422 && payload?.errors && typeof payload.errors === "object" && !Array.isArray(payload.errors)) {
    for (const [field, values] of Object.entries(payload.errors).slice(0, 40)) {
      const target = knownField(field) ? field : "form";
      for (const value of (Array.isArray(values) ? values : [values]).slice(0, 5)) {
        const confirmation = field === "password" && typeof value === "string" && /^(?:The password(?: field)? confirmation does not match\.)$/.test(value);
        const key = confirmation ? "password_confirmation" : target;
        (errors[key] ||= []).push(target === "form" ? "Some details were not accepted. Review this form and try again." : validationText(field, value));
      }
    }
  }
  const accountCreated = status === 503 && path === "auth/register" && payload?.code === "account_created_email_failed" && payload?.account_created === true;
  const mailFailure = status === 503 && original === "We couldn't send the account email. Try again shortly. If you just registered, sign in to request a new verification email.";
  const inactive = status === 403 && original === "This account is inactive.";
  const protectedAuth = ["auth/logout", "auth/password", "auth/email/verification-notification"].includes(path);
  const expired = status === 419 || (status === 401 && (protectedAuth || !String(path).startsWith("auth/")));
  let message;
  if (expired) message = SESSION_MESSAGE;
  else if (accountCreated) message = "Your account was created, but the verification email could not be sent. Sign in and request a new verification email. Do not register again.";
  else if (mailFailure) message = original;
  else if (status === 403) message = messages[original] && ["This account is inactive.", "Verify your email address before using this feature.", "The verification link is invalid."].includes(original) ? messages[original] : "You do not have access to this action. Return to your workspace or contact Reclaim support for help.";
  else if (messages[original] && (status < 500 || (status === 503 && original === "Google sign-in is not configured. Use your existing sign-in method."))) message = messages[original];
  else if (status === 422) message = Object.keys(errors).length ? "Check the highlighted fields and try again." : "These details could not be accepted. Review the form and try again.";
  else if (status === 401) message = "Sign-in could not be completed. Check your details and try again.";
  else if (status === 404) message = "We couldn't find this record. Return to the list and refresh it; the record may no longer be available.";
  else if (status === 409) message = "This action could not be completed because the record's current state does not allow it. Refresh the record and check its status before trying again.";
  else if (status === 429) message = "Too many requests. " + (/^\d{1,6}$/.test(retryAfter || "") ? "Try again after " + retryAfter + " seconds." : "Wait a moment before trying again.");
  else if (path === "auth/password/verify-code") message = "We couldn't confirm code verification. Check your connection and try again. If the code was already accepted, request another code.";
  else if (path === "auth/password/reset") message = "We couldn't confirm the password reset. Try signing in with your new password. If it doesn't work, request another code.";
  else if (path === "auth/password/forgot") message = "We couldn't confirm the reset email was sent. Check your inbox before requesting another code.";
  else if (path === "auth/register") message = "We couldn't confirm registration. Try signing in before registering again; your account may already have been created.";
  else if (path === "auth/login") message = "We couldn't sign you in right now. Check your connection and try again.";
  else if (path === "auth/logout") message = "We couldn't confirm sign-out. Check your connection and try again.";
  else message = method.toUpperCase() === "GET" ? "We couldn't load this right now. Check your connection and try again." : "We couldn't confirm this change. Check your connection, then refresh the record before trying again; it may already have been saved.";
  return { message, errors, code: accountCreated ? "account_created_email_failed" : inactive ? "account_inactive" : expired ? "session_expired" : null, recoverable: status === 0 || status >= 500 || status === 429 || status === 409 };
}
