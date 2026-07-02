/** Highlights two recurring keywords. Colors come from CSS vars (set per
 * display mode in theme.ts) rather than being hardcoded, so they stay
 * legible against a dark background too, not just the original white one. */
export function colorizeKeywords(text: string): string {
  return text
    .replace(/JSB1000/g, '<span class="keyword keyword-a">JSB1000</span>')
    .replace(/ST1000/g, '<span class="keyword keyword-b">ST1000</span>');
}
