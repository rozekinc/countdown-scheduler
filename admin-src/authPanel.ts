import { el } from "./dom";
import { startDeviceFlow, isSignedIn, signOut, DeviceFlowError } from "./auth";

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
    "Sign in with GitHub",
  ]);
  signInBtn.addEventListener("click", () => {
    openDeviceFlowModal(() => {
      renderAuthControls(container, onSignedIn);
      onSignedIn();
    });
  });
  container.append(signInBtn);
}

function openDeviceFlowModal(onSuccess: () => void): void {
  const backdrop = el("div", { class: "modal-backdrop" });
  const body = el("div", { class: "modal-body" }, [
    el("p", {}, ["Starting sign-in…"]),
  ]);
  const modal = el("div", { class: "modal" }, [body]);
  backdrop.append(modal);
  document.body.append(backdrop);

  const close = () => backdrop.remove();

  startDeviceFlow((info) => {
    body.innerHTML = "";
    const codeBox = el("div", { class: "device-code" }, [info.user_code]);
    const copyBtn = el("button", { class: "btn btn-secondary" }, [
      "Copy code",
    ]);
    copyBtn.addEventListener("click", () => {
      navigator.clipboard.writeText(info.user_code).catch(() => {});
      copyBtn.textContent = "Copied!";
      setTimeout(() => {
        copyBtn.textContent = "Copy code";
      }, 1500);
    });
    const link = el(
      "a",
      { href: info.verification_uri, target: "_blank", rel: "noopener" },
      [info.verification_uri],
    );
    body.append(
      el("p", {}, ["1. Copy this code:"]),
      codeBox,
      copyBtn,
      el("p", {}, ["2. Open this page and enter the code:"]),
      link,
      el("p", { class: "muted" }, ["Waiting for authorization…"]),
    );
  })
    .then(() => {
      close();
      onSuccess();
    })
    .catch((err: unknown) => {
      const message =
        err instanceof DeviceFlowError ? err.message : "Sign-in failed.";
      body.innerHTML = "";
      body.append(
        el("p", { class: "error" }, [message]),
        (() => {
          const closeBtn = el("button", { class: "btn btn-secondary" }, [
            "Close",
          ]);
          closeBtn.addEventListener("click", close);
          return closeBtn;
        })(),
      );
    });
}
