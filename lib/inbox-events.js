export const INBOX_UPDATE_EVENT = "pickleflow-inbox-update";
export const TOAST_EVENT = "pickleflow-toast";

export function notifyInboxUpdate() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(INBOX_UPDATE_EVENT));
}

export function showAppToast(message, href = null) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(TOAST_EVENT, { detail: { message, href } })
  );
}
