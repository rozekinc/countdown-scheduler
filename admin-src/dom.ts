export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "class") {
      node.className = value;
    } else if (key.startsWith("data-")) {
      node.setAttribute(key, value);
    } else {
      node.setAttribute(key, value);
    }
  }
  for (const child of children) {
    node.append(child);
  }
  return node;
}

export function clear(node: Element): void {
  node.innerHTML = "";
}

/** Returns true if the given date/time string is strictly before "now". */
export function isPast(isoLike: string): boolean {
  const t = new Date(isoLike).getTime();
  if (Number.isNaN(t)) return false;
  return t < Date.now();
}

/**
 * Splits a stored ISO datetime (e.g. "2026-07-10T13:00:00+09:00") into the
 * "YYYY-MM-DD" / "HH:mm" shapes native <input type="date"> / type="time">
 * expect. Done with a string slice, not `new Date()` -- these are
 * deliberately timezone-less, and this data's offset is meaningful (events
 * are always authored in a specific zone), so we must never let the
 * browser's own local timezone silently shift the displayed wall-clock
 * value. Returns "" for an empty/unparseable value.
 *
 * Rendered as two separate native inputs rather than one
 * <input type="datetime-local"> -- Safari's support for the combined
 * datetime-local widget has long been unreliable (missing/partial time
 * UI), whereas plain date and time inputs are solid everywhere. See
 * datePartsToIso for recombining them back into one ISO string.
 */
export function isoToDatePart(iso: string): string {
  const match = iso.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : "";
}

export function isoToTimePart(iso: string): string {
  const match = iso.match(/^\d{4}-\d{2}-\d{2}T(\d{2}:\d{2})/);
  return match ? match[1] : "";
}

/** The UTC offset suffix (e.g. "+09:00") from a stored ISO datetime, or the
 * project's default of "+09:00" if the string has none yet (new/blank
 * rows) -- see isoToDatePart for why this can't be re-derived from a
 * `Date` object. */
export function isoOffset(iso: string): string {
  const match = iso.match(/(Z|[+-]\d{2}:\d{2})$/);
  if (!match) return "+09:00";
  return match[1] === "Z" ? "+00:00" : match[1];
}

/** Rebuilds a full ISO datetime from a date-input value + time-input
 * value, preserving whatever offset `previousIso` had (or the project
 * default). Returns "" unless both parts are filled in. */
export function datePartsToIso(datePart: string, timePart: string, previousIso: string): string {
  if (!datePart || !timePart) return "";
  return `${datePart}T${timePart}:00${isoOffset(previousIso)}`;
}
