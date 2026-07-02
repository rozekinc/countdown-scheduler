import { el } from "./dom";
import { getRepoIdentity, setRepoIdentityOverride } from "./config";

/**
 * "Settings" is only ever needed for local testing: an owner/repo
 * override, used when this page isn't served from a *.github.io URL
 * (VS Code Live Server, `npx serve`, etc), where the repo identity can't
 * be auto-detected from the URL. On a real deployment there's nothing to
 * configure here at all -- sign-in (see authPanel.ts) is separate and
 * uses a pasted-in token instead.
 */
export function renderSettingsControls(container: HTMLElement, onSaved: () => void): void {
  container.innerHTML = "";

  const btn = el("button", { class: "btn btn-secondary" }, ["Settings"]);
  btn.addEventListener("click", () => openSettingsModal(onSaved));
  container.append(btn);
}

function openSettingsModal(onSaved: () => void): void {
  const backdrop = el("div", { class: "modal-backdrop" });
  const detected = getRepoIdentity();
  const closeBtn = el("button", { class: "btn btn-secondary" }, ["Close"]);
  closeBtn.addEventListener("click", () => backdrop.remove());

  if (detected) {
    const body = el("div", { class: "modal-body" }, [
      el("h3", {}, ["Settings"]),
      el("p", { class: "muted" }, [
        `Repo detected from URL: ${detected.owner}/${detected.repo}. Nothing to configure here.`,
      ]),
      el("div", { class: "actions-row" }, [closeBtn]),
    ]);
    const modal = el("div", { class: "modal" }, [body]);
    backdrop.append(modal);
    document.body.append(backdrop);
    return;
  }

  const ownerInput = el("input", {
    type: "text",
    class: "row-input",
    value: getRepoIdentity()?.owner ?? "",
    placeholder: "owner (e.g. your-username)",
  }) as HTMLInputElement;
  const repoInput = el("input", {
    type: "text",
    class: "row-input",
    value: getRepoIdentity()?.repo ?? "",
    placeholder: "repo (e.g. countdown-scheduler)",
  }) as HTMLInputElement;

  const saveBtn = el("button", { class: "btn btn-primary" }, ["Save"]);
  saveBtn.addEventListener("click", () => {
    if (ownerInput.value.trim() && repoInput.value.trim()) {
      setRepoIdentityOverride({
        owner: ownerInput.value.trim(),
        repo: repoInput.value.trim(),
      });
    }
    backdrop.remove();
    onSaved();
  });

  const body = el("div", { class: "modal-body" }, [
    el("h3", {}, ["Settings"]),
    el("p", { class: "muted" }, [
      "Not running on a github.io URL -- set owner/repo for local testing only.",
    ]),
    el("label", { class: "field" }, ["Owner:", ownerInput]),
    el("label", { class: "field" }, ["Repo:", repoInput]),
    el("div", { class: "actions-row" }, [saveBtn, closeBtn]),
  ]);
  const modal = el("div", { class: "modal" }, [body]);
  backdrop.append(modal);
  document.body.append(backdrop);
}
