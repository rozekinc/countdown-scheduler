import type { App } from "./types";

export function applyTheme(app: App): void {
  const root = document.documentElement;
  root.style.setProperty("--theme-primary", app.theme.primary);
  root.style.setProperty("--theme-accent", app.theme.accent);
  root.style.setProperty("--theme-background", app.theme.background);
}
