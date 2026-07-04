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
import { LABEL_EDITOR_FIELDS, DEFAULT_LABELS, type LabelKey } from "./labels";
import { icon } from "./icons";
import { t, type TranslationKey } from "./i18n";
import {
  ADDABLE_TYPES,
  ITEM_TYPE_LABELS,
  SINGLETON_TYPES,
  BASE_PAGE_IDS,
  defaultLayout,
  isSingleton,
  isBasePage,
  onPage,
  placementFor,
  setPlacement,
  clearPlacement,
  pageIds,
  type ItemPage,
  type ItemType,
  type LayoutItem,
  type Placement,
  type ScheduleEntry,
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

/** All page ids (base two + added), in order. */
function allPageIds(): ItemPage[] {
  return state.layout ? pageIds(state.layout) : [...BASE_PAGE_IDS];
}

/** Localized/edited display name for a page id. */
function pageDisplayName(page: ItemPage): string {
  if (page === "countdown") return t("le.countdown");
  if (page === "schedule") return t("le.schedule");
  return state.layout?.pages?.find((p) => p.id === page)?.name || page;
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

const TYPE_LABEL_KEYS: Record<ItemType, TranslationKey> = {
  clock: "le.type.clock",
  countdown: "le.type.countdown",
  countdownTitle: "le.type.countdownTitle",
  scheduleList: "le.type.scheduleList",
  announcement: "le.type.announcement",
  scheduleColumns: "le.type.scheduleColumns",
  text: "le.type.text",
  schedule: "le.type.schedule",
  image: "le.type.image",
};

/** Localized item-type name (falls back to the shared English constant). */
function typeLabel(type: ItemType): string {
  return t(TYPE_LABEL_KEYS[type]) || ITEM_TYPE_LABELS[type];
}

/** A short, human label for the palette's item list (previews text/heading). */
function itemListLabel(item: LayoutItem): string {
  const p = item.props;
  if (item.type === "text") {
    const text = (p.textI18n?.ja || p.text || "").trim();
    return text ? `${t("le.itemTextPrefix")}: ${text.slice(0, 14)}` : t("le.itemTextPrefix");
  }
  if (item.type === "schedule") {
    const heading = (p.heading?.ja || "").trim();
    return heading ? `${t("le.itemSchedulePrefix")}: ${heading.slice(0, 12)}` : t("le.itemSchedulePrefix");
  }
  return typeLabel(item.type);
}

export function renderLayoutEditor(container: HTMLElement, ctx: LayoutEditorCtx): void {
  // Editing a property re-renders the whole editor; capture the scroll offset
  // of each rail so a field edit (color, text, checkbox, …) doesn't yank the
  // panel back to the top on every keystroke/commit.
  const scroll = {
    palette: container.querySelector<HTMLElement>(".le-palette")?.scrollTop ?? 0,
    props: container.querySelector<HTMLElement>(".le-props")?.scrollTop ?? 0,
    canvas: container.querySelector<HTMLElement>(".le-canvas-panel")?.scrollTop ?? 0,
  };
  container.innerHTML = "";

  if (!state.layout) {
    container.append(el("p", { class: "muted" }, [t("le.loading")]));
    return;
  }

  const wrap = el("div", { class: "layout-editor" });
  wrap.append(renderPalette(container, ctx));
  wrap.append(renderCanvas(container, ctx));
  wrap.append(renderProperties(container, ctx));
  container.append(wrap);

  // Restore the rails' scroll after the rebuild.
  const palette = container.querySelector<HTMLElement>(".le-palette");
  if (palette) palette.scrollTop = scroll.palette;
  const props = container.querySelector<HTMLElement>(".le-props");
  if (props) props.scrollTop = scroll.props;
  const canvas = container.querySelector<HTMLElement>(".le-canvas-panel");
  if (canvas) canvas.scrollTop = scroll.canvas;
}

// --- palette (left) -------------------------------------------------------

function renderPalette(container: HTMLElement, ctx: LayoutEditorCtx): HTMLElement {
  const panel = el("div", { class: "le-palette" });

  panel.append(el("h3", {}, [t("le.page")]));
  const pageRow = el("div", { class: "le-screen-tabs" });
  for (const page of allPageIds()) {
    const tab = el("button", { class: `btn btn-small ${previewPage === page ? "btn-primary" : "btn-secondary"}` }, [
      pageDisplayName(page),
    ]);
    tab.addEventListener("click", () => {
      previewPage = page;
      renderLayoutEditor(container, ctx);
    });
    pageRow.append(tab);
  }
  panel.append(pageRow);

  const addPageBtn = el("button", { class: "btn btn-secondary btn-small" }, [t("le.addPage")]);
  addPageBtn.addEventListener("click", () => {
    addPage();
    ctx.onChange();
    renderLayoutEditor(container, ctx);
  });
  panel.append(addPageBtn);

  // The base pages (countdown / schedule) are fixed; added pages can be
  // renamed and deleted from here while previewed.
  if (!isBasePage(previewPage)) {
    const def = state.layout?.pages?.find((p) => p.id === previewPage);
    if (def) {
      const nameInput = el("input", { type: "text", class: "row-input", value: def.name }) as HTMLInputElement;
      nameInput.addEventListener("input", () => {
        def.name = nameInput.value;
        ctx.onChange();
      });
      nameInput.addEventListener("change", () => renderLayoutEditor(container, ctx));
      panel.append(el("div", { class: "le-field" }, [el("label", {}, [t("le.pageName")]), nameInput]));

      const delPageBtn = el("button", { class: "btn btn-danger btn-small" }, [t("le.deletePage")]);
      delPageBtn.addEventListener("click", () => {
        if (!window.confirm(t("le.deletePageConfirm", { name: def.name }))) return;
        deletePage(previewPage);
        ctx.onChange();
        renderLayoutEditor(container, ctx);
      });
      panel.append(delPageBtn);
    }
  }
  panel.append(el("p", { class: "muted le-hint" }, [t("le.pageHint")]));

  panel.append(el("h3", {}, [t("le.addItem")]));
  for (const type of ADDABLE_TYPES) {
    const btn = el("button", { class: "btn btn-secondary btn-small" }, [`+ ${typeLabel(type)}`]);
    btn.addEventListener("click", () => {
      addItem(type);
      ctx.onChange();
      renderLayoutEditor(container, ctx);
    });
    panel.append(btn);
  }

  // Every item, selectable by name -- so items on the OTHER page (e.g. schedule
  // items, which live on the schedule page) can still be found and edited
  // without hunting for their box on the canvas.
  panel.append(el("h3", {}, [t("le.items")]));
  const all = items();
  if (all.length === 0) {
    panel.append(el("p", { class: "muted le-hint" }, [t("le.noItems")]));
  } else {
    for (const item of all) {
      const pages = [onPage(item, "countdown") ? "C" : "", onPage(item, "schedule") ? "S" : ""].filter(Boolean).join("/");
      const btn = el("button", {
        class: `btn btn-small le-item-select ${item.id === selectedId ? "btn-primary" : "btn-secondary"}`,
      }, [`${itemListLabel(item)}${pages ? `  ·${pages}` : ""}`]);
      btn.addEventListener("click", () => {
        selectedId = item.id;
        // Switch to a page the item is on so its box shows on the canvas.
        if (!onPage(item, previewPage)) {
          if (onPage(item, "countdown")) previewPage = "countdown";
          else if (onPage(item, "schedule")) previewPage = "schedule";
        }
        renderLayoutEditor(container, ctx);
      });
      panel.append(btn);
    }
  }

  panel.append(el("h3", {}, [t("le.sections")]));
  panel.append(el("p", { class: "muted le-hint" }, [t("le.sectionsHint")]));
  for (const type of SINGLETON_TYPES) {
    const present = items().find((i) => i.type === type);
    const on = present && onPage(present, previewPage) && !present.hidden;
    const btn = el("button", { class: `btn btn-small ${on ? "btn-primary" : "btn-secondary"}` }, [
      `${on ? "✓ " : ""}${typeLabel(type)}`,
    ]);
    btn.addEventListener("click", () => {
      toggleSingletonOnPage(type);
      ctx.onChange();
      renderLayoutEditor(container, ctx);
    });
    panel.append(btn);
  }

  const resetBtn = el("button", { class: "btn btn-secondary btn-small le-reset" }, [t("le.reset")]);
  resetBtn.addEventListener("click", () => {
    if (!state.layout) return;
    if (!window.confirm(t("le.resetConfirm"))) return;
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
  // Cascade each new item down-right so multiple items (e.g. several schedule
  // items) don't stack in the exact same spot -- otherwise only the top one is
  // clickable and the rest can't be selected/edited.
  const sameType = items().filter((i) => i.type === type).length;
  const w = type === "schedule" ? 40 : 30;
  const h = type === "schedule" ? 40 : 15;
  const shift = (sameType % 6) * 4;
  const geom: Placement = {
    x: clamp(20 + shift, 0, 100 - w),
    y: clamp(18 + shift, 0, 100 - h),
    w,
    h,
  };
  const item: LayoutItem = {
    id,
    type,
    z: 20,
    props:
      type === "text"
        ? { source: "literal", textI18n: { ja: "テキスト", en: "Text" }, align: "center", fontScale: 1 }
        : type === "schedule"
          ? { fontScale: 1, heading: { ja: "スケジュール", en: "Schedule" }, entries: [] }
          : { assetPath: "media/images/ロゴ.png", fit: "contain", opacity: 1 },
  };
  setPlacement(item, previewPage, geom);
  state.layout.items.push(item);
  selectedId = id;
}

function uniquePageId(): string {
  const existing = new Set((state.layout?.pages ?? []).map((p) => p.id));
  let n = 1;
  while (existing.has(`page-${n}`)) n++;
  return `page-${n}`;
}

/** Add a new (empty) page after the base two and switch the preview to it. */
function addPage(): void {
  if (!state.layout) return;
  const pages = (state.layout.pages ??= []);
  const id = uniquePageId();
  pages.push({ id, name: `${t("le.pageDefaultName")} ${BASE_PAGE_IDS.length + pages.length + 1}` });
  previewPage = id;
}

/** Delete an added page: drop it from the layout, strip its placement from
 * every item, and steer the preview + the display off it. Base pages can't be
 * deleted. */
function deletePage(page: ItemPage): void {
  if (!state.layout || isBasePage(page)) return;
  state.layout.pages = (state.layout.pages ?? []).filter((p) => p.id !== page);
  for (const item of state.layout.items) clearPlacement(item, page);
  if (previewPage === page) previewPage = "countdown";
  // If the display was showing this page, send it back to countdown.
  if (state.currentPage === page) state.currentPage = "countdown";
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
    clearPlacement(item, previewPage);
  } else {
    // Seed from the other base page's placement, the base layout, or a default.
    const other: ItemPage = previewPage === "countdown" ? "schedule" : "countdown";
    const seed =
      placementFor(item, other) ??
      placementFor(defaultLayout().items.find((i) => i.type === type) as LayoutItem, previewPage) ??
      { x: 30, y: 30, w: 40, h: 20 };
    setPlacement(item, previewPage, { ...seed });
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
    el("p", { class: "muted le-hint" }, [t("le.canvasHint", { page: pageDisplayName(previewPage) })]),
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
    el("span", { class: "le-item-label" }, [`${typeLabel(item.type)}${bothPages ? " ⇄" : ""}`]),
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
    panel.append(el("h3", {}, [t("le.properties")]));
    panel.append(el("p", { class: "muted" }, [t("le.selectToEdit")]));
    return panel;
  }

  panel.append(el("h3", {}, [typeLabel(item.type)]));

  const rerender = (): void => {
    ctx.onChange();
    renderLayoutEditor(container, ctx);
  };
  // Mirror-only (no editor rebuild) -- for live slider drags.
  const live = (): void => ctx.onChange();

  // Which pages this item is on (one toggle per page).
  panel.append(el("h4", {}, [t("le.pages")]));
  for (const pg of allPageIds()) {
    panel.append(pageToggle(item, pg, pageDisplayName(pg), rerender));
  }

  const geom = geomOf(item);
  if (geom) {
    const copyBtn = el("button", { class: "btn btn-secondary btn-small" }, [t("le.copyPosAll")]);
    copyBtn.addEventListener("click", () => {
      for (const pg of allPageIds()) {
        if (pg !== previewPage) setPlacement(item, pg, { ...geom });
      }
      rerender();
    });
    panel.append(copyBtn);

    panel.append(el("h4", {}, [t("le.position", { page: pageDisplayName(previewPage) })]));
    panel.append(numberField(t("le.x"), geom.x, (v) => (geom.x = clamp(v)), rerender));
    panel.append(numberField(t("le.y"), geom.y, (v) => (geom.y = clamp(v)), rerender));
    panel.append(numberField(t("le.width"), geom.w, (v) => (geom.w = clamp(v, 1)), rerender));
    panel.append(numberField(t("le.height"), geom.h, (v) => (geom.h = clamp(v, 1)), rerender));
  } else {
    panel.append(el("p", { class: "muted le-hint" }, [t("le.notOnPage", { page: pageDisplayName(previewPage) })]));
  }
  panel.append(numberField(t("le.layer"), item.z, (v) => (item.z = Math.round(v)), rerender, 0, 999));

  renderItemProps(panel, item, rerender, live);

  // Delete (dynamic items only).
  if (!isSingleton(item.type)) {
    const delBtn = el("button", { class: "btn btn-danger btn-small le-delete" }, [t("le.deleteItem")]);
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

/** Seed geometry for placing an item on a new page: reuse any page it's
 * already on, else a sensible default. */
function seedGeom(item: LayoutItem): Placement {
  for (const pg of allPageIds()) {
    const g = placementFor(item, pg);
    if (g) return { ...g };
  }
  return { x: 30, y: 30, w: 40, h: 20 };
}

/** A checkbox toggling whether the item is placed on a given page. */
function pageToggle(item: LayoutItem, page: ItemPage, label: string, after: () => void): HTMLElement {
  const field = el("div", { class: "le-field le-field-inline" });
  const input = el("input", { type: "checkbox" }) as HTMLInputElement;
  input.checked = onPage(item, page);
  input.addEventListener("change", () => {
    if (input.checked) setPlacement(item, page, seedGeom(item));
    else clearPlacement(item, page);
    after();
  });
  field.append(el("label", {}, [label]), input);
  return field;
}

function renderItemProps(panel: HTMLElement, item: LayoutItem, rerender: () => void, live: () => void): void {
  const p = item.props;
  const fontSlider = (): HTMLElement =>
    rangeField(t("le.fontSize"), p.fontScale ?? 1, (v) => (p.fontScale = v), live, rerender, 0.2, 6, 0.05);
  switch (item.type) {
    case "text": {
      panel.append(el("h4", {}, [t("le.text")]));
      panel.append(
        selectField(t("le.content"), p.source ?? "literal", [
          { value: "literal", label: t("le.customText") },
          { value: "label", label: t("le.editableLabel") },
        ], (v) => (p.source = v as "literal" | "label"), rerender),
      );
      if (p.source === "label") {
        panel.append(
          selectField(t("le.label"), p.labelKey ?? "currentTime", LABEL_EDITOR_FIELDS.map((f) => ({ value: f.key, label: f.key })), (v) => (p.labelKey = v), rerender),
        );
      } else {
        // Bilingual literal: the display renders whichever language is active.
        // Seed from a legacy single `text` value if that's all the item has.
        if (!p.textI18n) p.textI18n = { ja: p.text ?? "", en: p.text ?? "" };
        panel.append(textField(t("le.textJa"), p.textI18n.ja, (v) => (p.textI18n!.ja = v), rerender));
        panel.append(textField(t("le.textEn"), p.textI18n.en, (v) => (p.textI18n!.en = v), rerender));
      }
      panel.append(alignField(p.align ?? "center", (v) => (p.align = v), rerender));
      panel.append(fontSlider());
      break;
    }
    case "schedule": {
      panel.append(el("h4", {}, [t("le.heading")]));
      if (!p.heading) p.heading = { ja: "", en: "" };
      panel.append(textField(t("le.headingJa"), p.heading.ja, (v) => (p.heading!.ja = v), rerender));
      panel.append(textField(t("le.headingEn"), p.heading.en, (v) => (p.heading!.en = v), rerender));
      renderScheduleEntries(panel, item, rerender, live);
      panel.append(fontSlider());
      break;
    }
    case "image": {
      panel.append(el("h4", {}, [t("le.image")]));
      panel.append(assetField(item, rerender));
      panel.append(
        selectField(t("le.fit"), p.fit ?? "contain", [
          { value: "contain", label: t("le.fitContain") },
          { value: "cover", label: t("le.fitCover") },
        ], (v) => (p.fit = v as "contain" | "cover"), rerender),
      );
      panel.append(numberField(t("le.opacity"), p.opacity ?? 1, (v) => (p.opacity = clamp(v, 0, 1)), rerender, 0, 1, 0.05));
      break;
    }
    case "clock": {
      panel.append(el("h4", {}, [t("le.clock")]));
      panel.append(alignField(p.align ?? "right", (v) => (p.align = v), rerender));
      panel.append(checkboxField(t("le.showLabel"), p.showLabel ?? true, (v) => (p.showLabel = v), rerender));
      panel.append(fontSlider());
      break;
    }
    case "countdownTitle": {
      panel.append(el("h4", {}, [t("le.titleText")]));
      panel.append(labelField(t("le.untilLabel"), "until", live));
      panel.append(labelField(t("le.finishedLabel"), "finished", live));
      panel.append(fontSlider());
      break;
    }
    case "scheduleList": {
      panel.append(el("h4", {}, [t("le.nextList")]));
      panel.append(checkboxField(t("le.showHeading"), p.showHeading ?? true, (v) => (p.showHeading = v), rerender));
      panel.append(el("h4", {}, [t("le.dayLabels")]));
      panel.append(labelField(t("days.today"), "today", live));
      panel.append(labelField(t("days.tomorrow"), "tomorrow", live));
      panel.append(labelField(t("days.dayAfter"), "dayAfter", live));
      panel.append(fontSlider());
      break;
    }
    case "announcement": {
      panel.append(el("h4", {}, [t("le.announcement")]));
      panel.append(checkboxField(t("le.showPrefix"), p.showPrefix ?? true, (v) => (p.showPrefix = v), rerender));
      panel.append(fontSlider());
      break;
    }
    default: {
      panel.append(fontSlider());
    }
  }

  // Colour wheels: text colour (any text/title-bearing item -- not images) and
  // background colour (any item). Both clear back to the default with "Auto".
  panel.append(el("h4", {}, [t("le.colors")]));
  if (item.type !== "image") {
    panel.append(colorField(t("le.textColor"), p.color, (v) => (p.color = v), () => delete p.color, live));
  }
  panel.append(colorField(t("le.bgColor"), p.bgColor, (v) => (p.bgColor = v), () => delete p.bgColor, live));

  // Scroll toggles for text-bearing items. Horizontal = marquee (announcement /
  // text); Vertical = auto-scroll long content (schedule list/columns / text).
  // Singletons scroll by default (checked); text items default off.
  const showH = item.type === "announcement" || item.type === "text";
  const showV =
    item.type === "scheduleList" ||
    item.type === "scheduleColumns" ||
    item.type === "schedule" ||
    item.type === "text";
  if (showH || showV) {
    panel.append(el("h4", {}, [t("le.scroll")]));
    if (showH) {
      const on = item.type === "text" ? !!p.scrollH : p.scrollH !== false;
      panel.append(checkboxField(t("le.scrollH"), on, (v) => (p.scrollH = v), rerender));
    }
    if (showV) {
      const on = item.type === "text" ? !!p.scrollV : p.scrollV !== false;
      panel.append(checkboxField(t("le.scrollV"), on, (v) => (p.scrollV = v), rerender));
    }
  }
}

// --- schedule item rows ---------------------------------------------------

// Module-level drag state for the schedule-entry reorder, mirroring ui.ts's
// makeReorderable (replicated locally to avoid a circular import).
let entryDragArr: ScheduleEntry[] | null = null;
let entryDragIndex = -1;

/** The add/remove/drag-reorder list of {title, detail} rows for a `schedule`
 * item's own content. Text edits mirror live (no rebuild, so the field keeps
 * focus); structural changes (add/remove/reorder) do a full re-render. */
function renderScheduleEntries(
  panel: HTMLElement,
  item: LayoutItem,
  rerender: () => void,
  live: () => void,
): void {
  const entries = (item.props.entries ??= []);
  panel.append(el("h4", {}, [t("le.rows")]));

  const list = el("div", { class: "le-entry-list" });
  entries.forEach((entry, index) => {
    list.append(renderEntryRow(entry, index, entries, rerender, live));
  });
  panel.append(list);

  const addBtn = el("button", { class: "btn btn-secondary btn-small" }, [t("le.addRow")]);
  addBtn.addEventListener("click", () => {
    entries.push({ title: "", detail: "" });
    rerender();
  });
  panel.append(addBtn);
}

function renderEntryRow(
  entry: ScheduleEntry,
  index: number,
  arr: ScheduleEntry[],
  rerender: () => void,
  live: () => void,
): HTMLElement {
  const row = el("div", { class: "le-entry-row" });

  const handle = icon("grip");
  handle.classList.add("le-entry-grip");
  makeEntryReorderable(row, handle, index, arr, rerender);

  const titleInput = el("input", { type: "text", class: "row-input", placeholder: t("le.rowTitle"), value: entry.title }) as HTMLInputElement;
  titleInput.addEventListener("input", () => {
    entry.title = titleInput.value;
    live();
  });
  const detailInput = el("input", { type: "text", class: "row-input", placeholder: t("le.rowDetail"), value: entry.detail }) as HTMLInputElement;
  detailInput.addEventListener("input", () => {
    entry.detail = detailInput.value;
    live();
  });

  const delBtn = el("button", { class: "btn btn-danger btn-small" }, ["×"]);
  delBtn.addEventListener("click", () => {
    arr.splice(index, 1);
    rerender();
  });

  const fields = el("div", { class: "le-entry-fields" }, [titleInput, detailInput]);
  row.append(handle, fields, delBtn);
  return row;
}

/** Drag-reorder helper for schedule rows (see makeReorderable in ui.ts). */
function makeEntryReorderable(
  row: HTMLElement,
  handle: HTMLElement,
  index: number,
  arr: ScheduleEntry[],
  after: () => void,
): void {
  handle.setAttribute("draggable", "true");
  handle.classList.add("drag-handle");
  handle.title = t("le.dragReorder");

  handle.addEventListener("dragstart", (e) => {
    entryDragArr = arr;
    entryDragIndex = index;
    row.classList.add("dragging");
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", String(index));
      e.dataTransfer.setDragImage(row, 12, 12);
    }
  });
  handle.addEventListener("dragend", () => {
    row.classList.remove("dragging");
    entryDragArr = null;
    entryDragIndex = -1;
  });

  const sameList = (): boolean => entryDragArr === arr;
  row.addEventListener("dragover", (e) => {
    if (!sameList()) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    row.classList.add("drag-over");
  });
  row.addEventListener("dragleave", () => row.classList.remove("drag-over"));
  row.addEventListener("drop", (e) => {
    row.classList.remove("drag-over");
    if (!sameList() || entryDragIndex === index || entryDragIndex < 0) return;
    e.preventDefault();
    const [moved] = arr.splice(entryDragIndex, 1);
    arr.splice(index, 0, moved);
    entryDragArr = null;
    entryDragIndex = -1;
    after();
  });
}

// --- asset picker + upload ------------------------------------------------

function assetField(item: LayoutItem, rerender: () => void): HTMLElement {
  const field = el("div", { class: "le-field" });
  field.append(el("label", {}, [t("le.image")]));

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
    const refreshBtn = el("button", { class: "btn btn-secondary btn-small" }, [t("le.refreshList")]);
    refreshBtn.addEventListener("click", () => {
      assetCache = null;
      void loadAssets().then(rerender);
    });
    const fileInput = el("input", { type: "file", accept: "image/*", class: "le-file" }) as HTMLInputElement;
    const uploadBtn = el("button", { class: "btn btn-primary btn-small" }, [t("le.uploadImage")]);
    uploadBtn.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", () => {
      const file = fileInput.files?.[0];
      if (file) void uploadAsset(file, item, rerender);
    });
    field.append(uploadBtn, refreshBtn, fileInput);
  } else {
    field.append(el("p", { class: "muted le-hint" }, [t("le.signInUpload")]));
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

/** A labelled slider with a live numeric readout -- used for per-item font
 * size. Mirrors to the live display on every drag step (onLive) but only
 * commits a full editor re-render on release (onCommit), so dragging the slider
 * doesn't tear itself down mid-drag. */
function rangeField(
  label: string,
  value: number,
  set: (v: number) => void,
  onLive: () => void,
  onCommit: () => void,
  min = 0.2,
  max = 6,
  step = 0.05,
): HTMLElement {
  const field = el("div", { class: "le-field" });
  const readout = el("span", { class: "le-range-value" }, [`${value.toFixed(2)}×`]);
  field.append(el("label", {}, [label, readout]));
  const input = el("input", {
    type: "range",
    class: "le-range",
    min: String(min),
    max: String(max),
    step: String(step),
    value: String(value),
  }) as HTMLInputElement;
  input.addEventListener("input", () => {
    const v = Number(input.value);
    readout.textContent = `${v.toFixed(2)}×`;
    set(v);
    onLive();
  });
  input.addEventListener("change", () => onCommit());
  field.append(input);
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
  return selectField(t("le.align"), value, [
    { value: "left", label: t("le.alignLeft") },
    { value: "center", label: t("le.alignCenter") },
    { value: "right", label: t("le.alignRight") },
  ], (v) => set(v as "left" | "center" | "right"), after);
}

/** A native color-wheel picker (text or background), plus an "Auto" button that
 * clears the value back to the default.
 *
 * IMPORTANT: this never re-renders the editor on a colour change. On macOS the
 * system colour panel fires `change` on EVERY adjustment (not just on close); a
 * re-render there would detach this very input mid-drag and the panel would
 * stop calling back. Instead we update the swatch in place and mirror live, so
 * the input stays attached the whole time the panel is open. */
function colorField(
  label: string,
  current: string | undefined,
  apply: (v: string) => void,
  clear: () => void,
  onLive: () => void,
): HTMLElement {
  const field = el("div", { class: "le-field" });
  field.append(el("label", {}, [label]));
  const row = el("div", { class: "le-color-row" });
  const input = el("input", { type: "color", class: "le-color", value: current ?? "#333333" }) as HTMLInputElement;
  const swatchLabel = el("span", { class: "le-color-value" }, [current ?? t("le.autoTheme")]);
  const commit = (): void => {
    apply(input.value);
    swatchLabel.textContent = input.value;
    onLive();
  };
  input.addEventListener("input", commit);
  input.addEventListener("change", commit);
  const autoBtn = el("button", { class: "btn btn-secondary btn-small" }, [t("le.auto")]);
  autoBtn.addEventListener("click", () => {
    clear();
    input.value = "#333333";
    swatchLabel.textContent = t("le.autoTheme");
    onLive();
  });
  row.append(input, swatchLabel, autoBtn);
  field.append(row);
  return field;
}

/** JA + EN inputs for one of the shared display labels (stored globally in
 * state.labels, but edited here from the relevant item's panel). Mirrors live
 * on every keystroke (no rebuild, so the field keeps focus). */
function labelField(labelText: string, key: LabelKey, onLive: () => void): HTMLElement {
  const field = el("div", { class: "le-field" });
  field.append(el("label", {}, [labelText]));
  const current = (): { ja: string; en: string } => state.labels[key] ?? DEFAULT_LABELS[key];
  const makeInput = (lang: "ja" | "en", tag: string): HTMLElement => {
    const input = el("input", { type: "text", class: "row-input", value: current()[lang] }) as HTMLInputElement;
    input.addEventListener("input", () => {
      state.labels[key] = { ...current(), [lang]: input.value };
      onLive();
    });
    return el("div", { class: "le-field le-field-inline" }, [el("label", {}, [tag]), input]);
  };
  field.append(makeInput("ja", "日本語"), makeInput("en", "English"));
  return field;
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
