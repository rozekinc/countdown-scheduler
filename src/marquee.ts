const MARQUEE_SPEED_PX_PER_SEC = 90;

/**
 * Renders an announcement as a fixed label ("お知らせ：") followed by its
 * content, scrolling ONLY the content -- never the label -- and only when
 * the content is too wide to fit. Short content just sits static next to
 * the label, same as before.
 *
 * When it does scroll, it's a seamless, always-populated loop (two copies
 * of the content back to back, translated by exactly one copy's width),
 * not a single pass that leaves the viewport empty between rotations.
 */
export function setAnnouncementText(
  container: HTMLElement,
  labelHtml: string,
  contentHtml: string,
): void {
  container.classList.remove("marquee-active");
  container.innerHTML =
    `<span class="marquee-label">${labelHtml}</span>` +
    `<span class="marquee-viewport"><span class="marquee-inner">` +
    `<span class="marquee-copy">${contentHtml}</span>` +
    `<span class="marquee-copy" aria-hidden="true">${contentHtml}</span>` +
    `</span></span>`;

  const viewport = container.querySelector<HTMLElement>(".marquee-viewport");
  const inner = container.querySelector<HTMLElement>(".marquee-inner");
  const copies = container.querySelectorAll<HTMLElement>(".marquee-copy");
  if (!viewport || !inner || copies.length < 2) return;
  inner.style.animationDuration = "";

  requestAnimationFrame(() => {
    // Each copy (content + its trailing gap, set in CSS) is exactly half of
    // the doubled inner width -- that's the distance one full loop travels.
    const periodWidth = inner.scrollWidth / 2;
    const overflowing = periodWidth > viewport.clientWidth;
    if (!overflowing) {
      copies[1].remove(); // no second copy needed when it isn't scrolling
      return;
    }

    container.classList.add("marquee-active");
    const duration = Math.max(6, periodWidth / MARQUEE_SPEED_PX_PER_SEC);
    inner.style.animationDuration = `${duration}s`;
  });
}
