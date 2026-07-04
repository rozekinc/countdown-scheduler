// The live layout editor: a WYSIWYG canvas where the operator drags and
// resizes items on a stage-accurate preview. Geometry is authored in
// stage-percent (0-100), the same unit the display renders from.
//
// There are two pages -- countdown and schedule. The preview shows one page at
// a time; dragging edits THAT page's placement for the selected item. An item
// can be placed on either or both pages; when it's on both with different
// geometry, it animates between them on 切替 on the real display.
//
// Every edit mirrors to a same-browser display instantly (ctx.onChange ->
// mirrorToLive) and is committed to data/layout.json on Save.

import { el } from "./dom";
import { state } from "./state";
import { getAspectRatio } from "./aspectRatios";
import { applyPreviewTheme } from "./previewTheme";
import { isSignedIn } from "./auth";
import { listDir, commitFiles } from "./githubApi";
import { LABEL_EDITOR_FIELDS } from "./labels";
import {
  ADDABLE_TYPES,
  ITEM_TYPE_LABELS,
  SINGLETON_TYPES,
  defaultLayout,
  isSingleton,
  onPage,
  placementFor,
  type ItemPage,
  type ItemType,
  type LayoutItem,
  type Placement,
} from "./layout";

export interface LayoutEditorCtx {
  onChange(): void;
}

let selectedId: string | null = null;
let previewPage: ItemPage = "countdown";
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

/** The selected item's placement on the previewed page (or undefined). */
function geomOf(item: LayoutItem): Placement | undefined {
  return placementFor(item, previewPage);
}

export function renderLayoutEditor(container: HTMLElement, ctx: LayoutEditorCtx): void {
  container.innerHTML = "";

  if (!state.layout) {
    container.append(el("p", { class: "muted" }, ["Loading layout…"]));
    return;
  }

  const wrap = el("div", { class: "layout-editor" });
  wrap.append(renderPalette(container, ctx));
  wrap.append(renderCanvas(container, ctx));
  wrap.append(renderProperties(container, ctx));
  container.append(wrap);
}

// --- palette (left) -------------------------------------------------------

function renderPalette(container: HTMLElement, ctx: LayoutEditorCtx): HTMLElement {
  const panel = el("div", { class: "le-palette" });

  panel.append(el("h3", {}, ["Page"]));
  const pageRow = el("div", { class: "le-screen-tabs" });
  (["countdown", "schedule"] as const).forEach((page) => {
    const b = el("button", { class: `btn btn-small ${previewPage === page ? "btn-primary" : "btn-secondary"}` }, [
      page === "countdown" ? "Countdown" : "Schedule",
    ]);
    b.addEventListener("click", () => {
      previewPage = page;
      renderLayoutEditor(container, ctx);
    });
    pageRow.append(b);
  });
  panel.append(pageRow);
  panel.append(el("p", { class: "muted le-hint" }, ["Drag on this page to set where items sit on it. An item placed differently on the two pages animates between them on 切替."]));

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
  panel.append(el("p", { class: "muted le-hint" }, ["Toggle a built-in section on/off for this page."]));
  for (const type of SINGLETON_TYPES) {
    const present = items().find((i) => i.type === type);
    const on = present && onPage(present, previewPage) && !present.hidden;
    const btn = el("button", { class: `btn btn-small ${on ? "btn-primary" : "btn-secondary"}` }, [
      `${on ? "✓ " : ""}${ITEM_TYPE_LABELS[type]}`,
    ]);
    btn.addEventListener("click", () => {
      toggleSingletonOnPage(type);
      ctx.onChange();
      renderLayoutEditor(container, ctx);
    });
    panel.append(btn);
  }

  const resetBtn = el("button", { class: "btn btn-secondary btn-small le-reset" }, ["Reset to base layout"]);
  resetBtn.addEventListener("click", () => {
    if (!state.layout) return;
    if (!window.confirm("Replace the layout with the built-in base layout?")) return;
    state.layout = defaultLayout();
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
  const geom: Placement = { x: 35, y: 40, w: 30, h: 15 };
  const item: LayoutItem = {
    id,
    type,
    z: 20,
    [previewPage]: geom,
    props:
      type === "text"
        ? { source: "literal", text: "Text", align: "center", fontScale: 1 }
        : { assetPath: "media/images/ロゴ.png", fit: "contain", opacity: 1 },
  };
  state.layout.items.push(item);
  selectedId = id;
}

/** Add/remove a singleton section's placement on the previewed page. */
function toggleSingletonOnPage(type: ItemType): void {
  if (!state.layout) return;
  let item = state.layout.items.find((i) => i.type === type);
  if (!item) {
    const base = defaultLayout().items.find((i) => i.type === type);
    if (!base) return;
    item = base;
    state.layout.items.push(item);
  }
  if (onPage(item, previewPage)) {
    delete item[previewPage];
  } else {
    // Seed from the other page's placement, the base layout, or a default.
    const other: ItemPage = previewPage === "countdown" ? "schedule" : "countdown";
    const seed =
      placementFor(item, other) ??
      placementFor(defaultLayout().items.find((i) => i.type === type) as LayoutItem, previewPage) ??
      { x: 30, y: 30, w: 40, h: 20 };
    item[previewPage] = { ...seed };
    selectedId = item.id;
  }
}

// --- canvas (center) ------------------------------------------------------

function renderCanvas(container: HTMLElement, ctx: LayoutEditorCtx): HTMLElement {
  const ratio = getAspectRatio(state.aspectRatioId);
  const panel = el("div", { class: "le-canvas-panel" });

  const stage = el("div", { class: "le-stage" });
  stage.style.aspectRatio = `${ratio.w} / ${ratio.h}`;
  stage.style.setProperty("--stage-ar", `${ratio.w} / ${ratio.h}`);
  applyPreviewTheme(stage, state.displayModeId);
  stage.style.background = "var(--theme-background, #fff)";

  stage.addEventListener("pointerdown", (e) => {
    if (e.target === stage) {
      selectedId = null;
      renderLayoutEditor(container, ctx);
    }
  });

  for (const item of items()) {
    if (item.hidden || !onPage(item, previewPage)) continue;
    stage.append(renderItemBox(item, stage, container, ctx));
  }

  panel.append(stage);
  panel.append(
    el("p", { class: "muted le-hint" }, [
      `Editing the ${previewPage} page. Drag to move, drag a corner/edge to resize.`,
    ]),
  );
  return panel;
}

function applyBoxStyle(box: HTMLElement, geom: Placement, z: number): void {
  box.style.left = `${geom.x}%`;
  box.style.top = `${geom.y}%`;
  box.style.width = `${geom.w}%`;
  box.style.height = `${geom.h}%`;
  box.style.zIndex = String(z ?? 0);
}

const RESIZE_HANDLES = [
  { name: "nw" }, { name: "n" }, { name: "ne" }, { name: "e" },
  { name: "se" }, { name: "s" }, { name: "sw" }, { name: "w" },
];

function renderItemBox(
  item: LayoutItem,
  stage: HTMLElement,
  container: HTMLElement,
  ctx: LayoutEditorCtx,
): HTMLElement {
  const geom = geomOf(item)!;
  const box = el("div", { class: `le-item${item.id === selectedId ? " selected" : ""}` });
  applyBoxStyle(box, geom, item.z);
  const bothPages = onPage(item, "countdown") && onPage(item, "schedule");
  box.append(
    el("span", { class: "le-item-label" }, [`${ITEM_TYPE_LABELS[item.type]}${bothPages ? " ⇄" : ""}`]),
  );

  box.addEventListener("pointerdown", (e) => {
    if ((e.target as HTMLElement).classList.contains("le-handle")) return;
    e.preventDefault();
    const wasSelected = selectedId === item.id;
    selectedId = item.id;
    if (!wasSelected) box.classList.add("selected");
    beginDrag(item, geom, box, stage, e, container, ctx);
  });

  if (item.id === selectedId) {
    for (const h of RESIZE_HANDLES) {
      const handle = el("div", { class: `le-handle le-handle-${h.name}` });
      handle.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        beginResize(item, geom, box, stage, h.name, e, container, ctx);
      });
      box.append(handle);
    }
  }

  return box;
}

function beginDrag(
  item: LayoutItem,
  geom: Placement,
  box: HTMLElement,
  stage: HTMLElement,
  start: PointerEvent,
  container: HTMLElement,
  ctx: LayoutEditorCtx,
): void {
  const rect = stage.getBoundingClientRect();
  const startX = start.clientX;
  const startY = start.clientY;
  const origX = geom.x;
  const origY = geom.y;
  box.setPointerCapture(start.pointerId);

  const move = (e: PointerEvent): void => {
    const dx = ((e.clientX - startX) / rect.width) * 100;
    const dy = ((e.clientY - startY) / rect.height) * 100;
    geom.x = round1(clamp(origX + dx, 0, 100 - geom.w));
    geom.y = round1(clamp(origY + dy, 0, 100 - geom.h));
    applyBoxStyle(box, geom, item.z);
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
  geom: Placement,
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
  const o = { x: geom.x, y: geom.y, w: geom.w, h: geom.h };
  box.setPointerCapture(start.pointerId);

  const move = (e: PointerEvent): void => {
    const dx = ((e.clientX - startX) / rect.width) * 100;
    const dy = ((e.clientY - startY) / rect.height) * 100;
    const MIN = 3;
    if (handle.includes("e")) geom.w = round1(clamp(o.w + dx, MIN, 100 - o.x));
    if (handle.includes("s")) geom.h = round1(clamp(o.h + dy, MIN, 100 - o.y));
    if (handle.includes("w")) {
      const nx = clamp(o.x + dx, 0, o.x + o.w - MIN);
      geom.x = round1(nx);
      geom.w = round1(o.x + o.w - nx);
    }
    if (handle.includes("n")) {
      const ny = clamp(o.y + dy, 0, o.y + o.h - MIN);
      geom.y = round1(ny);
      geom.h = round1(o.y + o.h - ny);
    }
    applyBoxStyle(box, geom, item.z);
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

  // Which pages this item is on.
  panel.append(el("h4", {}, ["Pages"]));
  panel.append(pageToggle(item, "countdown", "Countdown", rerender));
  panel.append(pageToggle(item, "schedule", "Schedule", rerender));

  const geom = geomOf(item);
  if (geom) {
    const copyBtn = el("button", { class: "btn btn-secondary btn-small" }, ["Copy position to other page"]);
    copyBtn.addEventListener("click", () => {
      const other: ItemPage = previewPage === "countdown" ? "schedule" : "countdown";
      item[other] = { ...geom };
      rerender();
    });
    panel.append(copyBtn);

    panel.append(el("h4", {}, [`Position (${previewPage})`]));
    panel.append(numberField("X %", geom.x, (v) => (geom.x = clamp(v)), rerender));
    panel.append(numberField("Y %", geom.y, (v) => (geom.y = clamp(v)), rerender));
    panel.append(numberField("Width %", geom.w, (v) => (geom.w = clamp(v, 1)), rerender));
    panel.append(numberField("Height %", geom.h, (v) => (geom.h = clamp(v, 1)), rerender));
  } else {
    panel.append(el("p", { class: "muted le-hint" }, [`Not on the ${previewPage} page. Toggle it on above to place it here.`]));
  }
  panel.append(numberField("Layer (z)", item.z, (v) => (item.z = Math.round(v)), rerender, 0, 999));

  renderItemProps(panel, item, rerender);

  // Delete (dynamic items only).
  if (!isSingleton(item.type)) {
    const delBtn = el("button", { class: "btn btn-danger btn-small le-delete" }, ["Delete item"]);
    delBtn.addEventListener("click", () => {
      if (!state.layout) return;
      state.layout.items = state.layout.items.filter((i) => i.id !== item.id);
      selectedId = null;
      rerender();
    });
    panel.append(delBtn);
  }

  return panel;
}

/** A checkbox toggling whether the item is placed on a given page. */
function pageToggle(item: LayoutItem, page: ItemPage, label: string, after: () => void): HTMLElement {
  const field = el("div", { class: "le-field le-field-inline" });
  const input = el("input", { type: "checkbox" }) as HTMLInputElement;
  input.checked = onPage(item, page);
  input.addEventListener("change", () => {
    if (input.checked) {
      const other: ItemPage = page === "countdown" ? "schedule" : "countdown";
      item[page] = { ...(placementFor(item, other) ?? { x: 30, y: 30, w: 40, h: 20 }) };
    } else {
      delete item[page];
    }
    after();
  });
  field.append(el("label", {}, [label]), input);
  return field;
}

function renderItemProps(panel: HTMLElement, item: LayoutItem, rerender: () => void): void {
  const p = item.props;
  switch (item.type) {
    case "text": {
      panel.append(el("h4", {}, ["Text"]));
      panel.append(
        selectField("Content", p.source ?? "literal", [
          { value: "literal", label: "Custom text" },
          { value: "label", label: "Editable label" },
        ], (v) => (p.source = v as "literal" | "label"), rerender),
      );
      if (p.source === "label") {
        panel.append(
          selectField("Label", p.labelKey ?? "currentTime", LABEL_EDITOR_FIELDS.map((f) => ({ value: f.key, label: f.key })), (v) => (p.labelKey = v), rerender),
        );
      } else {
        panel.append(textField("Text", p.text ?? "", (v) => (p.text = v), rerender));
      }
      panel.append(alignField(p.align ?? "center", (v) => (p.align = v), rerender));
      panel.append(numberField("Font ×", p.fontScale ?? 1, (v) => (p.fontScale = v), rerender, 0.2, 6, 0.1));
      break;
    }
    case "image": {
      panel.append(el("h4", {}, ["Image"]));
      panel.append(assetField(item, rerender));
      panel.append(
        selectField("Fit", p.fit ?? "contain", [
          { value: "contain", label: "Contain (whole image)" },
          { value: "cover", label: "Cover (fill, may crop)" },
        ], (v) => (p.fit = v as "contain" | "cover"), rerender),
      );
      panel.append(numberField("Opacity", p.opacity ?? 1, (v) => (p.opacity = clamp(v, 0, 1)), rerender, 0, 1, 0.05));
      break;
    }
    case "clock": {
      panel.append(el("h4", {}, ["Clock"]));
      panel.append(alignField(p.align ?? "right", (v) => (p.align = v), rerender));
      panel.append(checkboxField("Show label", p.showLabel ?? true, (v) => (p.showLabel = v), rerender));
      panel.append(numberField("Font ×", p.fontScale ?? 1, (v) => (p.fontScale = v), rerender, 0.2, 6, 0.1));
      break;
    }
    default: {
      panel.append(numberField("Font ×", p.fontScale ?? 1, (v) => (p.fontScale = v), rerender, 0.2, 6, 0.1));
    }
  }
}

// --- asset picker + upload ------------------------------------------------

function assetField(item: LayoutItem, rerender: () => void): HTMLElement {
  const field = el("div", { class: "le-field" });
  field.append(el("label", {}, ["Image"]));

  const select = el("select", { class: "row-input" }) as HTMLSelectElement;
  for (const path of assetOptions(item.props.assetPath)) {
    const opt = el("option", { value: path }, [path.replace("media/images/", "")]);
    if (path === item.props.assetPath) opt.setAttribute("selected", "selected");
    select.append(opt);
  }
  select.addEventListener("change", () => {
    item.props.assetPath = select.value;
    rerender();
  });
  field.append(select);

  if (item.props.assetPath) {
    field.append(el("img", { class: "le-asset-thumb", src: `../${item.props.assetPath}` }));
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

function assetOptions(current?: string): string[] {
  const defaults = ["media/images/4413.png", "media/images/ロゴ.png", "media/images/全画面.png"];
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

function numberField(label: string, value: number, set: (v: number) => void, after: () => void, min = 0, max = 100, step = 1): HTMLElement {
  const field = el("div", { class: "le-field le-field-inline" });
  const input = el("input", { type: "number", class: "row-input", value: String(value), min: String(min), max: String(max), step: String(step) }) as HTMLInputElement;
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

function selectField(label: string, value: string, options: Array<{ value: string; label: string }>, set: (v: string) => void, after: () => void): HTMLElement {
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
  return selectField("Align", value, [
    { value: "left", label: "Left" },
    { value: "center", label: "Center" },
    { value: "right", label: "Right" },
  ], (v) => set(v as "left" | "center" | "right"), after);
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
