import { el } from "./dom";
import { signInWithToken, isSignedIn, signOut, AuthError } from "./auth";

export function renderAuthControls(
  container: HTMLElement,
  onSignedIn: () => void,
): void {
  container.innerHTML = "";

  if (isSignedIn()) {
    const signOutBtn = el("button", { class: "btn btn-secondary" }, [
      "Sign out",
    ]);
    signOutBtn.addEventListener("click", () => {
      signOut();
      renderAuthControls(container, onSignedIn);
    });
    container.append(
      el("span", { class: "auth-status" }, ["Signed in"]),
      signOutBtn,
    );
    return;
  }

  const signInBtn = el("button", { class: "btn btn-primary" }, [
    "Sign in with token",
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
    placeholder: "github_pat_...",
    autocomplete: "off",
  }) as HTMLInputElement;

  const errorEl = el("p", { class: "error" }, []);
  errorEl.style.display = "none";

  const submitBtn = el("button", { class: "btn btn-primary" }, ["Sign in"]);
  const cancelBtn = el("button", { class: "btn btn-secondary" }, ["Cancel"]);

  function submit(): void {
    submitBtn.setAttribute("disabled", "true");
    submitBtn.textContent = "Checking…";
    errorEl.style.display = "none";
    signInWithToken(tokenInput.value)
      .then(() => {
        backdrop.remove();
        onSuccess();
      })
      .catch((err: unknown) => {
        submitBtn.removeAttribute("disabled");
        submitBtn.textContent = "Sign in";
        errorEl.textContent = err instanceof AuthError ? err.message : "Sign-in failed.";
        errorEl.style.display = "";
      });
  }

  submitBtn.addEventListener("click", submit);
  tokenInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submit();
  });
  cancelBtn.addEventListener("click", () => backdrop.remove());

  const body = el("div", { class: "modal-body" }, [
    el("h3", {}, ["Sign in"]),
    el("p", { class: "muted" }, [
      "Paste a fine-grained Personal Access Token scoped to just this repo " +
        "(Contents: read and write, nothing else). See SETUP.md for exactly how " +
        "to generate one. It's kept in this browser tab only, never saved to disk.",
    ]),
    el("label", { class: "field" }, ["Token:", tokenInput]),
    errorEl,
    el("div", { class: "actions-row" }, [submitBtn, cancelBtn]),
  ]);
  const modal = el("div", { class: "modal" }, [body]);
  backdrop.append(modal);
  document.body.append(backdrop);
  tokenInput.focus();
}
