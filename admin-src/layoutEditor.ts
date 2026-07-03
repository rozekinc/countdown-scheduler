// The live layout editor: a WYSIWYG canvas where the operator drags and
// resizes the app's items on a stage-accurate preview. Geometry is authored in
// stage-percent (0-100), the exact same unit the display renders from, so
// what's placed here is what shows there. Every edit mirrors to a same-browser
// display instantly (ctx.onChange -> mirrorToLive) and is committed to
// data/layouts/<appId>.json on Save.
//
// Item types are modular: dynamic types (text, image) can be added freely;
// singleton types (clock, countdown, schedule*, announcement) are toggled
// on/off. Adding a new type is a case in renderItemProps + a palette entry.

import { el } from "./dom";
import { state } from "./state";
import { currentApp } from "./state";
import { getAspectRatio } from "./aspectRatios";
import { applyPreviewTheme } from "./previewTheme";
import { isSignedIn } from "./auth";
import { listDir, commitFiles } from "./githubApi";
import { LABEL_EDITOR_FIELDS } from "./labels";
import {
  ADDABLE_TYPES,
  ITEM_TYPE_LABELS,
  SINGLETON_TYPES,
  defaultLayoutForApp,
  isSingleton,
  type ItemScreen,
  type ItemType,
  type LayoutItem,
} from "./layout";

export interface LayoutEditorCtx {
  /** Mark layout dirty, mirror to the live display, refresh the Save button. */
  onChange(): void;
}

let selectedId: string | null = null;
let previewScreen: "countdown" | "schedule" = "countdown";
// Cache of media/images asset paths, populated on demand when signed in.
let assetCache: string[] | null = null;

function items(): LayoutItem[] {
  return state.layout?.items ?? [];
}

function selected(): LayoutItem | null {
  return items().find((i) => i.id === selectedId) ?? null;
}

function clamp(n: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, n));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function uniqueId(type: ItemType): string {
  let n = 1;
  const existing = new Set(items().map((i) => i.id));
  while (existing.has(`${type}-${n}`)) n++;
  return `${type}-${n}`;
}

/** Whether an item is drawn on the currently-previewed screen. */
function onScreen(item: LayoutItem): boolean {
  return item.screen === "shared" || item.screen === previewScreen;
}

export function renderLayoutEditor(container: HTMLElement, ctx: LayoutEditorCtx): void {
  container.innerHTML = "";
  const app = currentApp();

  if (!app) {
    container.append(el("p", { class: "muted" }, ["Pick an app first."]));
    return;
  }
  if (!state.layout) {
    container.append(el("p", { class: "muted" }, ["Loading layout…"]));
    return;
  }

  const wrap = el("div", { class: "layout-editor" });

  wrap.append(renderPalette(container, ctx));
  wrap.append(renderCanvas(app, container, ctx));
  wrap.append(renderProperties(container, ctx));

  container.append(wrap);
}

// --- palette (left) -------------------------------------------------------

function renderPalette(container: HTMLElement, ctx: LayoutEditorCtx): HTMLElement {
  const panel = el("div", { class: "le-palette" });
  panel.append(el("h3", {}, ["Add item"]));

  for (const type of ADDABLE_TYPES) {
    const btn = el("button", { class: "btn btn-secondary btn-small" }, [`+ ${ITEM_TYPE_LABELS[type]}`]);
    btn.addEventListener("click", () => {
      addItem(type);
      ctx.onChange();
      renderLayoutEditor(container, ctx);
    });
    panel.append(btn);
  }

  panel.append(el("h3", {}, ["Sections"]));
  panel.append(
    el("p", { class: "muted le-hint" }, ["Toggle the built-in event sections on/off."]),
  );
  for (const type of SINGLETON_TYPES) {
    const present = items().find((i) => i.type === type);
    const on = present && !present.hidden;
    const btn = el("button", { class: `btn btn-small ${on ? "btn-primary" : "btn-secondary"}` }, [
      `${on ? "✓ " : ""}${ITEM_TYPE_LABELS[type]}`,
    ]);
    btn.addEventListener("click", () => {
      toggleSingleton(type);
      ctx.onChange();
      renderLayoutEditor(container, ctx);
    });
    panel.append(btn);
  }

  panel.append(el("h3", {}, ["Preview screen"]));
  const screenRow = el("div", { class: "le-screen-tabs" });
  (["countdown", "schedule"] as const).forEach((screen) => {
    const b = el("button", { class: `btn btn-small ${previewScreen === screen ? "btn-primary" : "btn-secondary"}` }, [
      screen === "countdown" ? "Countdown" : "Schedule",
    ]);
    b.addEventListener("click", () => {
      previewScreen = screen;
      renderLayoutEditor(container, ctx);
    });
    screenRow.append(b);
  });
  panel.append(screenRow);

  const resetBtn = el("button", { class: "btn btn-secondary btn-small le-reset" }, ["Reset to base layout"]);
  resetBtn.addEventListener("click", () => {
    if (!state.layout) return;
    if (!window.confirm("Replace this app's layout with the built-in base layout?")) return;
    state.layout = defaultLayoutForApp(state.layout.appId);
    selectedId = null;
    ctx.onChange();
    renderLayoutEditor(container, ctx);
  });
  panel.append(resetBtn);

  return panel;
}

function addItem(type: ItemType): void {
  if (!state.layout) return;
  const id = uniqueId(type);
  const item: LayoutItem = {
    id,
    type,
    screen: "shared",
    x: 35,
    y: 40,
    w: 30,
    h: 15,
    z: 20,
    props:
      type === "text"
        ? { source: "literal", text: "Text", align: "center", fontScale: 1 }
        : { assetPath: "media/images/ロゴ.png", fit: "contain", opacity: 1 },
  };
  state.layout.items.push(item);
  selectedId = id;
}

/** Toggle a singleton section: hide if present+visible, show if hidden, or
 * re-create from the base layout if it was deleted entirely. */
function toggleSingleton(type: ItemType): void {
  if (!state.layout) return;
  const existing = state.layout.items.find((i) => i.type === type);
  if (existing) {
    existing.hidden = !existing.hidden;
    if (!existing.hidden) selectedId = existing.id;
    return;
  }
  const base = defaultLayoutForApp(state.layout.appId).items.find((i) => i.type === type);
  if (base) {
    state.layout.items.push(base);
    selectedId = base.id;
  }
}

// --- canvas (center) ------------------------------------------------------

function renderCanvas(
  app: ReturnType<typeof currentApp>,
  container: HTMLElement,
  ctx: LayoutEditorCtx,
): HTMLElement {
  const ratio = getAspectRatio(state.aspectRatioId);
  const panel = el("div", { class: "le-canvas-panel" });

  const stage = el("div", { class: "le-stage" });
  stage.style.aspectRatio = `${ratio.w} / ${ratio.h}`;
  stage.style.setProperty("--stage-ar", `${ratio.w} / ${ratio.h}`);
  applyPreviewTheme(stage, app, state.displayModeId);
  stage.style.background = "var(--theme-background, #fff)";

  // Clicking empty stage deselects.
  stage.addEventListener("pointerdown", (e) => {
    if (e.target === stage) {
      selectedId = null;
      renderLayoutEditor(container, ctx);
    }
  });

  for (const item of items()) {
    if (!onScreen(item)) continue;
    stage.append(renderItemBox(item, stage, container, ctx));
  }

  panel.append(stage);
  panel.append(
    el("p", { class: "muted le-hint" }, [
      "Drag to move, drag a corner/edge to resize. Positions are % of the stage, so they scale on any screen.",
    ]),
  );
  return panel;
}

function applyBoxStyle(box: HTMLElement, item: LayoutItem): void {
  box.style.left = `${item.x}%`;
  box.style.top = `${item.y}%`;
  box.style.width = `${item.w}%`;
  box.style.height = `${item.h}%`;
  box.style.zIndex = String(item.z ?? 0);
  box.style.opacity = item.hidden ? "0.35" : "1";
}

const RESIZE_HANDLES: Array<{ name: string; cx: number; cy: number }> = [
  { name: "nw", cx: 0, cy: 0 },
  { name: "n", cx: 0.5, cy: 0 },
  { name: "ne", cx: 1, cy: 0 },
  { name: "e", cx: 1, cy: 0.5 },
  { name: "se", cx: 1, cy: 1 },
  { name: "s", cx: 0.5, cy: 1 },
  { name: "sw", cx: 0, cy: 1 },
  { name: "w", cx: 0, cy: 0.5 },
];

function renderItemBox(
  item: LayoutItem,
  stage: HTMLElement,
  container: HTMLElement,
  ctx: LayoutEditorCtx,
): HTMLElement {
  const box = el("div", { class: `le-item${item.id === selectedId ? " selected" : ""}` });
  applyBoxStyle(box, item);
  box.append(
    el("span", { class: "le-item-label" }, [
      `${ITEM_TYPE_LABELS[item.type]}${item.hidden ? " (hidden)" : ""}`,
    ]),
  );

  box.addEventListener("pointerdown", (e) => {
    if ((e.target as HTMLElement).classList.contains("le-handle")) return;
    e.preventDefault();
    const wasSelected = selectedId === item.id;
    selectedId = item.id;
    // If it was already selected (handles present), a full re-render is safe
    // and shows the property panel; otherwise start dragging immediately
    // without tearing down the pointer capture.
    if (!wasSelected) {
      markSelected(container);
      box.classList.add("selected");
    }
    beginDrag(item, box, stage, e, container, ctx);
  });

  if (item.id === selectedId) {
    for (const h of RESIZE_HANDLES) {
      const handle = el("div", { class: `le-handle le-handle-${h.name}` });
      handle.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        beginResize(item, box, stage, h.name, e, container, ctx);
      });
      box.append(handle);
    }
  }

  return box;
}

/** Lightweight selection refresh: toggle .selected on boxes without a full
 * re-render (which would tear down the in-flight pointer capture). The full
 * re-render happens on pointerup. */
function markSelected(container: HTMLElement): void {
  container.querySelectorAll<HTMLElement>(".le-item").forEach((box) => {
    box.classList.remove("selected");
  });
}

function beginDrag(
  item: LayoutItem,
  box: HTMLElement,
  stage: HTMLElement,
  start: PointerEvent,
  container: HTMLElement,
  ctx: LayoutEditorCtx,
): void {
  const rect = stage.getBoundingClientRect();
  const startX = start.clientX;
  const startY = start.clientY;
  const origX = item.x;
  const origY = item.y;
  box.setPointerCapture(start.pointerId);

  const move = (e: PointerEvent): void => {
    const dx = ((e.clientX - startX) / rect.width) * 100;
    const dy = ((e.clientY - startY) / rect.height) * 100;
    item.x = round1(clamp(origX + dx, 0, 100 - item.w));
    item.y = round1(clamp(origY + dy, 0, 100 - item.h));
    applyBoxStyle(box, item);
    ctx.onChange();
  };
  const up = (e: PointerEvent): void => {
    box.releasePointerCapture(e.pointerId);
    box.removeEventListener("pointermove", move);
    box.removeEventListener("pointerup", up);
    renderLayoutEditor(container, ctx);
  };
  box.addEventListener("pointermove", move);
  box.addEventListener("pointerup", up);
}

function beginResize(
  item: LayoutItem,
  box: HTMLElement,
  stage: HTMLElement,
  handle: string,
  start: PointerEvent,
  container: HTMLElement,
  ctx: LayoutEditorCtx,
): void {
  const rect = stage.getBoundingClientRect();
  const startX = start.clientX;
  const startY = start.clientY;
  const o = { x: item.x, y: item.y, w: item.w, h: item.h };
  box.setPointerCapture(start.pointerId);

  const move = (e: PointerEvent): void => {
    const dx = ((e.clientX - startX) / rect.width) * 100;
    const dy = ((e.clientY - startY) / rect.height) * 100;
    const MIN = 3;
    if (handle.includes("e")) item.w = round1(clamp(o.w + dx, MIN, 100 - o.x));
    if (handle.includes("s")) item.h = round1(clamp(o.h + dy, MIN, 100 - o.y));
    if (handle.includes("w")) {
      const nx = clamp(o.x + dx, 0, o.x + o.w - MIN);
      item.x = round1(nx);
      item.w = round1(o.x + o.w - nx);
    }
    if (handle.includes("n")) {
      const ny = clamp(o.y + dy, 0, o.y + o.h - MIN);
      item.y = round1(ny);
      item.h = round1(o.y + o.h - ny);
    }
    applyBoxStyle(box, item);
    ctx.onChange();
  };
  const up = (e: PointerEvent): void => {
    box.releasePointerCapture(e.pointerId);
    box.removeEventListener("pointermove", move);
    box.removeEventListener("pointerup", up);
    renderLayoutEditor(container, ctx);
  };
  box.addEventListener("pointermove", move);
  box.addEventListener("pointerup", up);
}

// --- properties (right) ---------------------------------------------------

function renderProperties(container: HTMLElement, ctx: LayoutEditorCtx): HTMLElement {
  const panel = el("div", { class: "le-props" });
  const item = selected();

  if (!item) {
    panel.append(el("h3", {}, ["Properties"]));
    panel.append(el("p", { class: "muted" }, ["Select an item to edit it."]));
    return panel;
  }

  panel.append(el("h3", {}, [ITEM_TYPE_LABELS[item.type]]));

  const rerender = (): void => {
    ctx.onChange();
    renderLayoutEditor(container, ctx);
  };

  // Geometry.
  panel.append(numberField("X %", item.x, (v) => (item.x = clamp(v)), rerender));
  panel.append(numberField("Y %", item.y, (v) => (item.y = clamp(v)), rerender));
  panel.append(numberField("Width %", item.w, (v) => (item.w = clamp(v, 1)), rerender));
  panel.append(numberField("Height %", item.h, (v) => (item.h = clamp(v, 1)), rerender));
  panel.append(numberField("Layer (z)", item.z, (v) => (item.z = Math.round(v)), rerender, 0, 999));

  // Screen assignment.
  panel.append(
    selectField(
      "Shows on",
      item.screen,
      [
        { value: "shared", label: "Both screens" },
        { value: "countdown", label: "Countdown only" },
        { value: "schedule", label: "Schedule only" },
      ],
      (v) => (item.screen = v as ItemScreen),
      rerender,
    ),
  );

  // Per-type controls.
  renderItemProps(panel, item, rerender);

  // Hide / delete.
  const actions = el("div", { class: "le-props-actions" });
  const hideBtn = el("button", { class: "btn btn-secondary btn-small" }, [item.hidden ? "Show" : "Hide"]);
  hideBtn.addEventListener("click", () => {
    item.hidden = !item.hidden;
    rerender();
  });
  actions.append(hideBtn);

  if (!isSingleton(item.type)) {
    const delBtn = el("button", { class: "btn btn-danger btn-small" }, ["Delete"]);
    delBtn.addEventListener("click", () => {
      if (!state.layout) return;
      state.layout.items = state.layout.items.filter((i) => i.id !== item.id);
      selectedId = null;
      rerender();
    });
    actions.append(delBtn);
  }
  panel.append(actions);

  return panel;
}

function renderItemProps(panel: HTMLElement, item: LayoutItem, rerender: () => void): void {
  const p = item.props;
  switch (item.type) {
    case "text": {
      panel.append(
        selectField(
          "Content",
          p.source ?? "literal",
          [
            { value: "literal", label: "Custom text" },
            { value: "label", label: "Editable label" },
          ],
          (v) => (p.source = v as "literal" | "label"),
          rerender,
        ),
      );
      if (p.source === "label") {
        panel.append(
          selectField(
            "Label",
            p.labelKey ?? "currentTime",
            LABEL_EDITOR_FIELDS.map((f) => ({ value: f.key, label: f.key })),
            (v) => (p.labelKey = v),
            rerender,
          ),
        );
      } else {
        panel.append(textField("Text", p.text ?? "", (v) => (p.text = v), rerender));
      }
      panel.append(alignField(p.align ?? "center", (v) => (p.align = v), rerender));
      panel.append(numberField("Font ×", p.fontScale ?? 1, (v) => (p.fontScale = v), rerender, 0.2, 6, 0.1));
      break;
    }
    case "image": {
      panel.append(assetField(item, rerender));
      panel.append(
        selectField(
          "Fit",
          p.fit ?? "contain",
          [
            { value: "contain", label: "Contain (whole image)" },
            { value: "cover", label: "Cover (fill, may crop)" },
          ],
          (v) => (p.fit = v as "contain" | "cover"),
          rerender,
        ),
      );
      panel.append(numberField("Opacity", p.opacity ?? 1, (v) => (p.opacity = clamp(v, 0, 1)), rerender, 0, 1, 0.05));
      break;
    }
    case "clock": {
      panel.append(alignField(p.align ?? "right", (v) => (p.align = v), rerender));
      panel.append(
        checkboxField("Show label", p.showLabel ?? true, (v) => (p.showLabel = v), rerender),
      );
      panel.append(numberField("Font ×", p.fontScale ?? 1, (v) => (p.fontScale = v), rerender, 0.2, 6, 0.1));
      break;
    }
    default: {
      // countdown / scheduleList / scheduleColumns / announcement: font only.
      panel.append(numberField("Font ×", p.fontScale ?? 1, (v) => (p.fontScale = v), rerender, 0.2, 6, 0.1));
    }
  }
}

// --- asset picker + upload ------------------------------------------------

function assetField(item: LayoutItem, rerender: () => void): HTMLElement {
  const field = el("div", { class: "le-field" });
  field.append(el("label", {}, ["Image"]));

  const select = el("select", { class: "row-input" }) as HTMLSelectElement;
  const paths = assetOptions(item.props.assetPath);
  for (const path of paths) {
    const opt = el("option", { value: path }, [path.replace("media/images/", "")]);
    if (path === item.props.assetPath) opt.setAttribute("selected", "selected");
    select.append(opt);
  }
  select.addEventListener("change", () => {
    item.props.assetPath = select.value;
    rerender();
  });
  field.append(select);

  // Preview thumbnail.
  if (item.props.assetPath) {
    const img = el("img", { class: "le-asset-thumb", src: `../${item.props.assetPath}` });
    field.append(img);
  }

  if (isSignedIn()) {
    const refreshBtn = el("button", { class: "btn btn-secondary btn-small" }, ["Refresh list"]);
    refreshBtn.addEventListener("click", () => {
      assetCache = null;
      void loadAssets().then(rerender);
    });
    const fileInput = el("input", { type: "file", accept: "image/*", class: "le-file" }) as HTMLInputElement;
    const uploadBtn = el("button", { class: "btn btn-primary btn-small" }, ["Upload image"]);
    uploadBtn.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", () => {
      const file = fileInput.files?.[0];
      if (file) void uploadAsset(file, item, rerender);
    });
    field.append(uploadBtn, refreshBtn, fileInput);
  } else {
    field.append(el("p", { class: "muted le-hint" }, ["Sign in to upload new images."]));
  }

  return field;
}

/** Known asset paths: the cached media/images listing (when signed in and
 * loaded) unioned with the current value and the built-in defaults, so the
 * dropdown is never empty even before a listing is fetched. */
function assetOptions(current?: string): string[] {
  const defaults = [
    "media/images/4413.png",
    "media/images/ロゴ.png",
    "media/images/全画面.png",
  ];
  const set = new Set<string>([...(assetCache ?? []), ...defaults]);
  if (current) set.add(current);
  return [...set].sort();
}

async function loadAssets(): Promise<void> {
  if (!isSignedIn()) return;
  try {
    const entries = await listDir("media/images");
    assetCache = entries
      .filter((e) => e.type === "file" && /\.(png|jpe?g|gif|webp|svg)$/i.test(e.name))
      .map((e) => e.path);
  } catch {
    /* leave assetCache as-is; the defaults still populate the dropdown */
  }
}

async function uploadAsset(file: File, item: LayoutItem, rerender: () => void): Promise<void> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  const base64 = dataUrl.split(",")[1] ?? "";
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `media/images/${safeName}`;
  try {
    await commitFiles([{ path, content: base64, encoding: "base64" }], `Upload image ${safeName}`);
    assetCache = [...new Set([...(assetCache ?? []), path])];
    item.props.assetPath = path;
    rerender();
  } catch (err) {
    window.alert(`Upload failed: ${(err as Error).message}`);
  }
}

// --- small field helpers --------------------------------------------------

function numberField(
  label: string,
  value: number,
  set: (v: number) => void,
  after: () => void,
  min = 0,
  max = 100,
  step = 1,
): HTMLElement {
  const field = el("div", { class: "le-field le-field-inline" });
  const input = el("input", {
    type: "number",
    class: "row-input",
    value: String(value),
    min: String(min),
    max: String(max),
    step: String(step),
  }) as HTMLInputElement;
  input.addEventListener("change", () => {
    const v = Number(input.value);
    if (Number.isNaN(v)) return;
    set(v);
    after();
  });
  field.append(el("label", {}, [label]), input);
  return field;
}

function textField(label: string, value: string, set: (v: string) => void, after: () => void): HTMLElement {
  const field = el("div", { class: "le-field" });
  const input = el("input", { type: "text", class: "row-input", value }) as HTMLInputElement;
  input.addEventListener("change", () => {
    set(input.value);
    after();
  });
  field.append(el("label", {}, [label]), input);
  return field;
}

function selectField(
  label: string,
  value: string,
  options: Array<{ value: string; label: string }>,
  set: (v: string) => void,
  after: () => void,
): HTMLElement {
  const field = el("div", { class: "le-field" });
  const select = el("select", { class: "row-input" }) as HTMLSelectElement;
  for (const o of options) {
    const opt = el("option", { value: o.value }, [o.label]);
    if (o.value === value) opt.setAttribute("selected", "selected");
    select.append(opt);
  }
  select.addEventListener("change", () => {
    set(select.value);
    after();
  });
  field.append(el("label", {}, [label]), select);
  return field;
}

function alignField(value: string, set: (v: "left" | "center" | "right") => void, after: () => void): HTMLElement {
  return selectField(
    "Align",
    value,
    [
      { value: "left", label: "Left" },
      { value: "center", label: "Center" },
      { value: "right", label: "Right" },
    ],
    (v) => set(v as "left" | "center" | "right"),
    after,
  );
}

function checkboxField(label: string, value: boolean, set: (v: boolean) => void, after: () => void): HTMLElement {
  const field = el("div", { class: "le-field le-field-inline" });
  const input = el("input", { type: "checkbox" }) as HTMLInputElement;
  input.checked = value;
  input.addEventListener("change", () => {
    set(input.checked);
    after();
  });
  field.append(el("label", {}, [label]), input);
  return field;
}

/** Called by ui.ts when entering the layout view, to warm the asset list. */
export function primeAssets(): void {
  if (isSignedIn() && assetCache === null) {
    void loadAssets();
  }
}
