import { el } from "./dom";
import { getRepoIdentity, setRepoIdentityOverride } from "./config";
import { iconButton } from "./icons";
import { t } from "./i18n";

/**
 * Dev-only owner/repo override, needed ONLY when running off a *.github.io URL
 * (local testing). On a real deployment the repo is auto-detected, so no button
 * is shown at all. The former display-settings modal is gone -- display
 * language + text size now live in the header (viewer controls), and the
 * editable display labels live on their layout items / the red-flag dialog.
 */
export function renderSettingsControls(container: HTMLElement): void {
  container.innerHTML = "";
  // Auto-detected on a real deployment -> nothing to configure, no button.
  if (getRepoIdentity()) return;
  const btn = iconButton("settings", t("settings.button"), "btn btn-secondary");
  btn.addEventListener("click", () => openRepoIdentityModal());
  container.append(btn);
}

function openRepoIdentityModal(): void {
  const backdrop = el("div", { class: "modal-backdrop" });
  const ownerInput = el("input", {
    type: "text",
    class: "row-input",
    value: getRepoIdentity()?.owner ?? "",
    placeholder: t("settings.ownerPlaceholder"),
  }) as HTMLInputElement;
  const repoInput = el("input", {
    type: "text",
    class: "row-input",
    value: getRepoIdentity()?.repo ?? "",
    placeholder: t("settings.repoPlaceholder"),
  }) as HTMLInputElement;

  const saveBtn = el("button", { class: "btn btn-primary" }, [t("settings.save")]);
  saveBtn.addEventListener("click", () => {
    if (ownerInput.value.trim() && repoInput.value.trim()) {
      setRepoIdentityOverride({ owner: ownerInput.value.trim(), repo: repoInput.value.trim() });
      backdrop.remove();
    }
  });
  const closeBtn = el("button", { class: "btn btn-secondary" }, [t("settings.close")]);
  closeBtn.addEventListener("click", () => backdrop.remove());

  const body = el("div", { class: "modal-body" }, [
    el("h2", {}, [t("settings.title")]),
    el("p", { class: "muted" }, [t("settings.notOnGithubIo")]),
    el("label", { class: "field" }, [t("settings.owner"), ownerInput]),
    el("label", { class: "field" }, [t("settings.repo"), repoInput]),
    el("div", { class: "actions-row" }, [saveBtn, closeBtn]),
  ]);
  backdrop.append(el("div", { class: "modal" }, [body]));
  document.body.append(backdrop);
}
