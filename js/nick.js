import { getCoderName, setCoderName } from "./api.js";

export function ensureNickname() {
  return new Promise((resolve) => {
    const saved = getCoderName();
    if (saved) {
      updateUserBadge();
      resolve(saved);
      return;
    }
    openNickModal((name) => resolve(name));
  });
}

export function openNickModal(onSave) {
  const overlay = document.getElementById("nick-modal");
  const input = document.getElementById("nick-input");
  const form = document.getElementById("nick-form");
  if (!overlay || !input || !form) return;

  input.value = getCoderName();
  overlay.hidden = false;
  document.body.classList.add("modal-open");
  setTimeout(() => input.focus(), 50);

  form.onsubmit = (e) => {
    e.preventDefault();
    const name = input.value.trim();
    if (!name) {
      input.focus();
      return;
    }

    setCoderName(name);
    updateUserBadge();
    overlay.hidden = true;
    document.body.classList.remove("modal-open");
    form.onsubmit = null;
    onSave?.(name);
  };
}

export function updateUserBadge() {
  const badge = document.getElementById("user-badge");
  if (!badge) return;

  const name = getCoderName();
  if (name) {
    badge.textContent = name;
    badge.hidden = false;
  } else {
    badge.hidden = true;
  }
}

export function setupUserBadge() {
  updateUserBadge();
  document.getElementById("user-badge")?.addEventListener("click", () => {
    openNickModal();
  });
}
