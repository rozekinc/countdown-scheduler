import type { AppsData } from "./types";

/** Code-build stamp injected by scripts/cachebust.mjs into
 * <meta name="app-build">. Empty or "dev" means an unstamped local run --
 * we skip the build part rather than show a meaningless label. Static for
 * the page's lifetime (the code can't change without a reload). */
function buildLabel(): string | null {
  const build = document.querySelector('meta[name="app-build"]')?.getAttribute("content");
  if (!build || build === "dev") return null;
  return `build ${build}`;
}

/** Content-version part: "v{n} · {date}", degrading gracefully when the
 * fields are absent (unversioned data) -- see AppsData.contentVersion. */
function contentLabel(data: AppsData): string | null {
  if (data.contentVersion == null) return null;
  const updated = data.contentUpdatedAt ? ` · ${data.contentUpdatedAt}` : "";
  return `v${data.contentVersion}${updated}`;
}

/**
 * Mounts a small, non-interactive corner badge showing which content
 * version and code build this screen is running, and returns an updater
 * to call whenever fresh AppsData arrives. The content part changes live
 * on a publish (contentVersion is polled every ~2s); the build part is
 * fixed. When there's nothing to show (unversioned data and an unstamped
 * build) the badge stays hidden.
 */
export function initVersionBadge(initial: AppsData): (data: AppsData) => void {
  const badge = document.createElement("div");
  badge.id = "version-badge";
  document.body.appendChild(badge);

  const build = buildLabel();

  function render(data: AppsData): void {
    const parts = [contentLabel(data), build].filter((p): p is string => p !== null);
    badge.textContent = parts.join(" · ");
    badge.style.display = parts.length > 0 ? "block" : "none";
  }

  render(initial);
  return render;
}
