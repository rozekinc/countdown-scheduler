const SCROLL_SPEED_PX_PER_SEC = 40;

/**
 * Renders `contentHtml` inside `viewport`, auto-scrolling it vertically,
 * seamlessly and continuously, only when it's too tall to fit. Short
 * content just renders once, static, same as before -- nothing here ever
 * hard-truncates a day's rows the way the original fixed row cap did.
 */
export function setScrollingContent(viewport: HTMLElement | null, contentHtml: string): void {
  if (!viewport) return;
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
    // A zero-height viewport isn't laid out yet (e.g. the schedule page before
    // it's first shown); render static and let a later refresh (once visible)
    // set up the scroll with a real measurement.
    if (viewport.clientHeight <= 0) {
      copies[1].remove();
      return;
    }
    // Each copy (rows + its trailing gap, set in CSS) is exactly half of
    // the doubled inner height -- the distance one full loop travels.
    const periodHeight = inner.scrollHeight / 2;
    const overflowing = periodHeight > viewport.clientHeight;
    if (!overflowing) {
      copies[1].remove(); // no second copy needed when it isn't scrolling
      return;
    }

    viewport.classList.add("schedule-rows-active");
    const duration = Math.max(8, periodHeight / SCROLL_SPEED_PX_PER_SEC);
    inner.style.animationDuration = `${duration}s`;
  });
}

/**
 * The same seamless vertical auto-scroll as setScrollingContent above, but
 * for the countdown screen's "next schedule" side list (#list-viewport): the
 * two stacked copies are <ul> elements so the list's <li> styling
 * (#schedule-list ul li) still applies. Only scrolls when the items are
 * taller than the viewport; otherwise renders once, static.
 */
export function setScrollingList(viewport: HTMLElement | null, itemsHtml: string): void {
  if (!viewport) return;
  viewport.classList.remove("list-scroll-active");
  viewport.innerHTML =
    `<div class="list-scroll-inner">` +
    `<ul class="list-scroll-copy">${itemsHtml}</ul>` +
    `<ul class="list-scroll-copy" aria-hidden="true">${itemsHtml}</ul>` +
    `</div>`;

  const inner = viewport.querySelector<HTMLElement>(".list-scroll-inner");
  const copies = viewport.querySelectorAll<HTMLElement>(".list-scroll-copy");
  if (!inner || copies.length < 2) return;
  inner.style.animationDuration = "";

  requestAnimationFrame(() => {
    if (viewport.clientHeight <= 0) {
      copies[1].remove();
      return;
    }
    const periodHeight = inner.scrollHeight / 2;
    const overflowing = periodHeight > viewport.clientHeight;
    if (!overflowing) {
      copies[1].remove(); // no second copy needed when it isn't scrolling
      return;
    }

    viewport.classList.add("list-scroll-active");
    const duration = Math.max(8, periodHeight / SCROLL_SPEED_PX_PER_SEC);
    inner.style.animationDuration = `${duration}s`;
  });
}
