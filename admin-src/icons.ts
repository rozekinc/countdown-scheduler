// Tiny inline-SVG icon set for the admin's icon-first header and the event
// tree. Each icon is a 24x24 stroke path using currentColor, so it inherits
// the button's text color. Returns a <span class="icon"> wrapping the SVG.

const PATHS: Record<string, string> = {
  // event editor (pencil)
  editor: '<path d="M4 20h4L18 10l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/>',
  // layout (grid)
  layout: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>',
  // save (floppy)
  save: '<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v5h8"/><rect x="8" y="13" width="8" height="6"/>',
  // publish / upload cloud
  publish: '<path d="M12 16V7"/><path d="M8 11l4-4 4 4"/><path d="M5 19h14"/>',
  // pull / download (remote -> local)
  pull: '<path d="M12 4v11"/><path d="M8 11l4 4 4-4"/><path d="M5 20h14"/>',
  // settings (gear)
  settings: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.5 4.5l2.1 2.1M17.4 17.4l2.1 2.1M19.5 4.5l-2.1 2.1M6.6 17.4l-2.1 2.1"/>',
  // sign in (key)
  signIn: '<circle cx="8" cy="12" r="3.5"/><path d="M11.5 12H21l-2 2 2 2"/>',
  // sign out
  signOut: '<path d="M14 7V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-2"/><path d="M10 12h11l-3-3M21 12l-3 3"/>',
  // aspect ratio (frame)
  aspect: '<rect x="3" y="6" width="18" height="12" rx="1"/>',
  // display mode (contrast)
  mode: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18z"/>',
  // chevron (tree expand indicator)
  chevron: '<path d="M9 6l6 6-6 6"/>',
  // plus (add)
  plus: '<path d="M12 5v14M5 12h14"/>',
  // active (star)
  active: '<path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9 6.8 19.2l1-5.8L3.5 9.2l5.9-.9z"/>',
  // close / archive (box)
  archive: '<rect x="3" y="4" width="18" height="4"/><path d="M5 8v12h14V8"/><path d="M9 12h6"/>',
  // day (calendar)
  day: '<rect x="3" y="4" width="18" height="17" rx="1"/><path d="M3 9h18M8 2v4M16 2v4"/>',
  // rename (pencil, small — reuse editor)
  rename: '<path d="M4 20h4L18 10l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/>',
  // drag handle (6-dot grip)
  grip: '<circle cx="9" cy="6" r="1.3"/><circle cx="15" cy="6" r="1.3"/><circle cx="9" cy="12" r="1.3"/><circle cx="15" cy="12" r="1.3"/><circle cx="9" cy="18" r="1.3"/><circle cx="15" cy="18" r="1.3"/>',
  // page toggle (切替 -- two screens swapping)
  swap: '<path d="M4 8h11l-3-3M20 16H9l3 3"/>',
  // red flag (safety stoppage)
  flag: '<path d="M5 21V4"/><path d="M5 4h13l-2.5 4L18 12H5"/>',
  // pause scrolling
  pause: '<rect x="7" y="5" width="3.5" height="14"/><rect x="13.5" y="5" width="3.5" height="14"/>',
  // resume scrolling (play)
  play: '<path d="M7 5l12 7-12 7z"/>',
  // show outline (dashed frame)
  outline: '<rect x="3" y="4" width="18" height="16" rx="1" stroke-dasharray="3 2"/>',
  // refresh display (circular arrows)
  refresh: '<path d="M20 11a8 8 0 0 0-14-5l-2 2"/><path d="M4 5v4h4"/><path d="M4 13a8 8 0 0 0 14 5l2-2"/><path d="M20 19v-4h-4"/>',
};

export function icon(name: keyof typeof PATHS | string): HTMLElement {
  const span = document.createElement("span");
  span.className = "icon";
  span.setAttribute("aria-hidden", "true");
  span.innerHTML =
    `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" ` +
    `stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${PATHS[name] ?? ""}</svg>`;
  return span;
}

/** An icon button: icon + a visually-hidden label + a native tooltip. */
export function iconButton(
  name: string,
  label: string,
  cls = "btn btn-secondary",
): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.className = `${cls} icon-btn`;
  btn.type = "button";
  btn.title = label;
  btn.setAttribute("aria-label", label);
  btn.append(icon(name));
  const sr = document.createElement("span");
  sr.className = "sr-only";
  sr.textContent = label;
  btn.append(sr);
  return btn;
}
