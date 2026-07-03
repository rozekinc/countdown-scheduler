import { el } from "./dom";
import { getRepoIdentity, setRepoIdentityOverride } from "./config";
import { t } from "./i18n";
import { state } from "./state";
import { DEFAULT_LABELS, LABEL_EDITOR_FIELDS } from "./labels";
import type { DisplayLanguage, Label, LabelKey } from "./types";

/**
 * The "Settings" modal covers two unrelated things:
 *  - The DISPLAY settings (display language, text size, and the editable
 *    display labels) -- data that lives in data/apps.json and is published
 *    with the main Save button. These mutate `state` + `state.appsPatch`
 *    directly and call `onDisplaySettingsChanged` so the live preview and
 *    Save button update immediately (see onDisplaySettingsChanged in ui.ts).
 *  - An owner/repo override, only needed for local testing off a
 *    *.github.io URL. On a real deployment there's nothing to configure
 *    there -- sign-in (authPanel.ts) is separate and uses a pasted token.
 */
export function renderSettingsControls(
  container: HTMLElement,
  onSaved: () => void,
  onDisplaySettingsChanged: () => void,
): void {
  container.innerHTML = "";

  const btn = el("button", { class: "btn btn-secondary" }, [t("settings.button")]);
  btn.addEventListener("click", () => openSettingsModal(onSaved, onDisplaySettingsChanged));
  container.append(btn);
}

/** A fresh, complete copy of the working labels record, so the value staged
 * into appsPatch.labels is never the same object we keep mutating in state. */
function cloneLabels(labels: Record<LabelKey, Label>): Record<LabelKey, Label> {
  const out = {} as Record<LabelKey, Label>;
  for (const key of Object.keys(labels) as LabelKey[]) {
    out[key] = { ...labels[key] };
  }
  return out;
}

function renderDisplaySettings(onChange: () => void): HTMLElement {
  const section = el("div", { class: "display-settings" });
  section.append(el("h3", {}, [t("settings.displaySettings")]));
  section.append(el("p", { class: "muted" }, [t("settings.displaySettingsHint")]));

  // --- Display language toggle (ja / en) ---
  const langRow = el("div", { class: "display-settings-row" });
  const makeLangBtn = (lang: DisplayLanguage, label: string) => {
    const active = state.displayLanguage === lang;
    const b = el("button", { class: `btn btn-small ${active ? "btn-primary" : "btn-secondary"}` }, [label]);
    b.addEventListener("click", () => {
      if (state.displayLanguage === lang) return;
      state.displayLanguage = lang;
      state.appsPatch.displayLanguage = lang;
      onChange();
      // Re-render the toggle so the active button flips.
      renderSettingsModalBody(onChange);
    });
    return b;
  };
  langRow.append(
    el("span", { class: "display-settings-label" }, [t("settings.displayLanguage")]),
    makeLangBtn("ja", t("settings.displayLangJa")),
    makeLangBtn("en", t("settings.displayLangEn")),
  );
  section.append(langRow);

  // --- Text-size slider ---
  const scale = typeof state.textScale === "number" ? state.textScale : 1;
  const valueEl = el("span", { class: "display-settings-value" }, [`${scale.toFixed(2)}×`]);
  const slider = el("input", {
    type: "range",
    class: "text-scale-slider",
    min: "0.6",
    max: "1.6",
    step: "0.05",
    value: String(scale),
  }) as HTMLInputElement;
  slider.addEventListener("input", () => {
    const v = Number(slider.value);
    state.textScale = v;
    state.appsPatch.textScale = v;
    valueEl.textContent = `${v.toFixed(2)}×`;
    onChange();
  });
  const scaleRow = el("div", { class: "display-settings-row" }, [
    el("span", { class: "display-settings-label" }, [t("settings.textScale")]),
    slider,
    valueEl,
  ]);
  section.append(scaleRow);
  section.append(el("p", { class: "muted display-settings-hint" }, [t("settings.textScaleHint")]));

  // --- Labels editor (every label, ja + en, with a "where it shows" hint) ---
  section.append(el("h4", {}, [t("settings.labelsTitle")]));
  section.append(el("p", { class: "muted" }, [t("settings.labelsHint")]));

  const stageLabel = (key: LabelKey, side: DisplayLanguage, value: string) => {
    const current = state.labels[key] ?? { ...DEFAULT_LABELS[key] };
    state.labels[key] = { ...current, [side]: value };
    state.appsPatch.labels = cloneLabels(state.labels);
    onChange();
  };

  const makeLabelInput = (key: LabelKey, side: DisplayLanguage, tag: string) => {
    const current = state.labels[key] ?? DEFAULT_LABELS[key];
    const input = el("input", {
      type: "text",
      class: "row-input label-editor-input",
      value: current[side],
    }) as HTMLInputElement;
    input.addEventListener("input", () => stageLabel(key, side, input.value));
    return el("label", { class: "label-editor-field" }, [
      el("span", { class: "label-editor-tag" }, [tag]),
      input,
    ]);
  };

  const labelsTable = el("div", { class: "label-editor" });
  for (const field of LABEL_EDITOR_FIELDS) {
    labelsTable.append(
      el("div", { class: "label-editor-row" }, [
        el("div", { class: "label-editor-where" }, [field.where]),
        el("div", { class: "label-editor-inputs" }, [
          makeLabelInput(field.key, "ja", t("settings.labelJa")),
          makeLabelInput(field.key, "en", t("settings.labelEn")),
        ]),
      ]),
    );
  }
  section.append(labelsTable);

  return section;
}

let modalBodyEl: HTMLElement | null = null;

/** (Re)builds the modal body in place, so toggling the display language can
 * refresh the active-button styling without closing the modal. */
function renderSettingsModalBody(onDisplaySettingsChanged: () => void): void {
  if (!modalBodyEl) return;
  modalBodyEl.innerHTML = "";
  modalBodyEl.append(
    el("h2", {}, [t("settings.title")]),
    renderDisplaySettings(onDisplaySettingsChanged),
    renderRepoIdentitySection(),
  );
}

/** The owner/repo override section (local-testing only), unchanged in
 * behaviour from before -- returns a "detected" note or the editable form. */
function renderRepoIdentitySection(): HTMLElement {
  const section = el("div", { class: "repo-identity-settings" });
  const detected = getRepoIdentity();

  if (detected) {
    section.append(
      el("p", { class: "muted" }, [
        t("settings.detected", { owner: detected.owner, repo: detected.repo }),
      ]),
    );
    return section;
  }

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
      setRepoIdentityOverride({
        owner: ownerInput.value.trim(),
        repo: repoInput.value.trim(),
      });
    }
  });

  section.append(
    el("p", { class: "muted" }, [t("settings.notOnGithubIo")]),
    el("label", { class: "field" }, [t("settings.owner"), ownerInput]),
    el("label", { class: "field" }, [t("settings.repo"), repoInput]),
    el("div", { class: "actions-row" }, [saveBtn]),
  );
  return section;
}

function openSettingsModal(onSaved: () => void, onDisplaySettingsChanged: () => void): void {
  const backdrop = el("div", { class: "modal-backdrop" });
  const closeBtn = el("button", { class: "btn btn-secondary" }, [t("settings.close")]);
  closeBtn.addEventListener("click", () => {
    backdrop.remove();
    modalBodyEl = null;
    onSaved();
  });

  modalBodyEl = el("div", { class: "modal-body settings-modal-body" });
  const modal = el("div", { class: "modal settings-modal" }, [
    modalBodyEl,
    el("div", { class: "actions-row" }, [closeBtn]),
  ]);
  renderSettingsModalBody(onDisplaySettingsChanged);
  backdrop.append(modal);
  document.body.append(backdrop);
}
