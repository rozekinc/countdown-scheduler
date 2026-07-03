import { el } from "./dom";
import { signInWithToken, isSignedIn, signOut, AuthError } from "./auth";
import { t } from "./i18n";

export function renderAuthControls(
  container: HTMLElement,
  onSignedIn: () => void,
): void {
  container.innerHTML = "";

  if (isSignedIn()) {
    const signOutBtn = el("button", { class: "btn btn-secondary" }, [
      t("auth.signOut"),
    ]);
    signOutBtn.addEventListener("click", () => {
      signOut();
      renderAuthControls(container, onSignedIn);
    });
    container.append(
      el("span", { class: "auth-status" }, [t("auth.signedIn")]),
      signOutBtn,
    );
    return;
  }

  const signInBtn = el("button", { class: "btn btn-primary" }, [
    t("auth.signInWithToken"),
  ]);
  signInBtn.addEventListener("click", () => {
    openTokenModal(() => {
      renderAuthControls(container, onSignedIn);
      onSignedIn();
    });
  });
  container.append(signInBtn);
}

function openTokenModal(onSuccess: () => void): void {
  const backdrop = el("div", { class: "modal-backdrop" });

  const tokenInput = el("input", {
    type: "password",
    class: "row-input",
    placeholder: t("auth.tokenPlaceholder"),
    autocomplete: "off",
  }) as HTMLInputElement;

  const errorEl = el("p", { class: "error" }, []);
  errorEl.style.display = "none";

  const submitBtn = el("button", { class: "btn btn-primary" }, [t("auth.signIn")]);
  const cancelBtn = el("button", { class: "btn btn-secondary" }, [t("auth.cancel")]);

  // Set once the read-only warning has been shown: the token is already
  // stored, so the next click just proceeds ("Continue anyway").
  let acknowledgedWarning = false;

  function submit(): void {
    if (acknowledgedWarning) {
      backdrop.remove();
      onSuccess();
      return;
    }
    submitBtn.setAttribute("disabled", "true");
    submitBtn.textContent = t("auth.checking");
    errorEl.style.display = "none";
    signInWithToken(tokenInput.value)
      .then((result) => {
        if (result.writeWarning) {
          acknowledgedWarning = true;
          submitBtn.removeAttribute("disabled");
          submitBtn.textContent = t("auth.continueAnyway");
          errorEl.textContent = t("auth.readOnlyWarning");
          errorEl.style.display = "";
          return;
        }
        backdrop.remove();
        onSuccess();
      })
      .catch((err: unknown) => {
        submitBtn.removeAttribute("disabled");
        submitBtn.textContent = t("auth.signIn");
        errorEl.textContent = err instanceof AuthError ? err.message : t("auth.signInFailed");
        errorEl.style.display = "";
      });
  }

  submitBtn.addEventListener("click", submit);
  tokenInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submit();
  });
  cancelBtn.addEventListener("click", () => backdrop.remove());

  const body = el("div", { class: "modal-body" }, [
    el("h3", {}, [t("auth.signInTitle")]),
    el("p", { class: "muted" }, [t("auth.tokenHelp")]),
    el("label", { class: "field" }, [t("auth.tokenLabel"), tokenInput]),
    errorEl,
    el("div", { class: "actions-row" }, [submitBtn, cancelBtn]),
  ]);
  const modal = el("div", { class: "modal" }, [body]);
  backdrop.append(modal);
  document.body.append(backdrop);
  tokenInput.focus();
}
