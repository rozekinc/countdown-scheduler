import { el } from "./dom";
import {
  getClientId,
  setClientId,
  getRepoIdentity,
  setRepoIdentityOverride,
} from "./config";

/**
 * A one-time-per-browser "Settings" form: the GitHub Client ID (required,
 * public, never committed to source -- see config.ts) and, only when the
 * repo identity can't be auto-detected from a github.io URL (i.e. local
 * testing), an owner/repo override. Values live in localStorage only.
 */
export function renderSettingsControls(container: HTMLElement, onSaved: () => void): void {
  container.innerHTML = "";

  const btn = el("button", { class: "btn btn-secondary" }, ["Settings"]);
  btn.addEventListener("click", () => openSettingsModal(onSaved));
  container.append(btn);
}

function openSettingsModal(onSaved: () => void): void {
  const backdrop = el("div", { class: "modal-backdrop" });

  const clientIdInput = el("input", {
    type: "text",
    class: "row-input",
    value: getClientId() ?? "",
    placeholder: "GitHub App / OAuth App Client ID",
  }) as HTMLInputElement;

  const detected = getRepoIdentity();
  const detectedNote = detected
    ? el("p", { class: "muted" }, [
        `Repo detected from URL: ${detected.owner}/${detected.repo}`,
      ])
    : el("p", { class: "muted" }, [
        "Not running on a github.io URL -- set owner/repo below for local testing only.",
      ]);

  const ownerInput = el("input", {
    type: "text",
    class: "row-input",
    value: !detected ? (readOverrideOwner() ?? "") : "",
    placeholder: "owner (e.g. your-username)",
  }) as HTMLInputElement;
  const repoInput = el("input", {
    type: "text",
    class: "row-input",
    value: !detected ? (readOverrideRepo() ?? "") : "",
    placeholder: "repo (e.g. countdown-scheduler)",
  }) as HTMLInputElement;

  const overrideFields = el("div", { class: "field" }, [
    "Local testing override (ignored on a real github.io deployment):",
    ownerInput,
    repoInput,
  ]);

  const saveBtn = el("button", { class: "btn btn-primary" }, ["Save"]);
  const closeBtn = el("button", { class: "btn btn-secondary" }, ["Close"]);

  saveBtn.addEventListener("click", () => {
    setClientId(clientIdInput.value);
    if (!detected && ownerInput.value.trim() && repoInput.value.trim()) {
      setRepoIdentityOverride({
        owner: ownerInput.value.trim(),
        repo: repoInput.value.trim(),
      });
    }
    backdrop.remove();
    onSaved();
  });
  closeBtn.addEventListener("click", () => backdrop.remove());

  const body = el("div", { class: "modal-body" }, [
    el("h3", {}, ["Settings"]),
    el("label", { class: "field" }, ["GitHub Client ID:", clientIdInput]),
    detectedNote,
    ...(detected ? [] : [overrideFields]),
    el("div", { class: "actions-row" }, [saveBtn, closeBtn]),
  ]);
  const modal = el("div", { class: "modal" }, [body]);
  backdrop.append(modal);
  document.body.append(backdrop);
}

function readOverrideOwner(): string | null {
  return getRepoIdentity()?.owner ?? null;
}

function readOverrideRepo(): string | null {
  return getRepoIdentity()?.repo ?? null;
}
