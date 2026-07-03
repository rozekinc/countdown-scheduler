// Shrinks a flex container's text to fit its own (fixed) height by setting a
// `--fit-scale` custom property the font-size declarations multiply by. The
// container must have a bounded height (e.g. absolute top+bottom) and
// overflow:hidden; its children's font-sizes must include
// `* var(--fit-scale, 1)`. Used for the countdown title/timer block so a long
// title never overflows into the announcement bar -- it just scales down.

const MIN_SCALE = 0.35;

export function fitToHeight(container: HTMLElement): void {
  // Reset to full size, then measure how much the content overflows.
  container.style.setProperty("--fit-scale", "1");
  const avail = container.clientHeight;
  if (avail <= 0) return;

  // Two passes: the first ratio gets close, the second corrects for the
  // non-linear part (line wrapping / rounding). Font-size scales linearly
  // with --fit-scale, so this converges fast.
  for (let pass = 0; pass < 2; pass++) {
    const needed = container.scrollHeight;
    if (needed <= avail) break;
    const current = Number(container.style.getPropertyValue("--fit-scale")) || 1;
    const next = Math.max(MIN_SCALE, current * (avail / needed));
    container.style.setProperty("--fit-scale", next.toFixed(3));
  }
}
