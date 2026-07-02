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
