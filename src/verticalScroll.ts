const SCROLL_SPEED_PX_PER_SEC = 40;

// The schedule-scroll keyframes (styles.css) now spend ~24% of each cycle
// holding still (a settle pause at the start and again at the midpoint)
// rather than sliding, so the duration is padded by this factor -- keeps
// the moving segments at roughly their original glide speed instead of
// quietly speeding up to make room for the holds.
const PAUSE_PADDING_FACTOR = 1.25;

/**
 * Renders `contentHtml` inside `viewport`, auto-scrolling it vertically,
 * seamlessly and continuously, only when it's too tall to fit. Short
 * content just renders once, static, same as before -- nothing here ever
 * hard-truncates a day's rows the way the original fixed row cap did.
 */
export function setScrollingContent(viewport: HTMLElement, contentHtml: string): void {
  viewport.classList.remove("schedule-rows-active");
  viewport.innerHTML =
    `<div class="schedule-rows-inner">` +
    `<div class="schedule-rows-copy">${contentHtml}</div>` +
    `<div class="schedule-rows-copy" aria-hidden="true">${contentHtml}</div>` +
    `</div>`;

  const inner = viewport.querySelector<HTMLElement>(".schedule-rows-inner");
  const copies = viewport.querySelectorAll<HTMLElement>(".schedule-rows-copy");
  if (!inner || copies.length < 2) return;
  inner.style.animationDuration = "";

  requestAnimationFrame(() => {
    // Each copy (rows + its trailing gap, set in CSS) is exactly half of
    // the doubled inner height -- the distance one full loop travels.
    const periodHeight = inner.scrollHeight / 2;
    const overflowing = periodHeight > viewport.clientHeight;
    if (!overflowing) {
      copies[1].remove(); // no second copy needed when it isn't scrolling
      return;
    }

    viewport.classList.add("schedule-rows-active");
    const duration =
      Math.max(8, periodHeight / SCROLL_SPEED_PX_PER_SEC) * PAUSE_PADDING_FACTOR;
    inner.style.animationDuration = `${duration}s`;
  });
}
