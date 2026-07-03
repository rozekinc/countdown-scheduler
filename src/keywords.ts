/** Highlights per-event keywords. Colors come from CSS vars (set per
 * display mode in theme.ts) rather than being hardcoded, so they stay
 * legible against a dark background too, not just the original white one.
 * There are two CSS color slots (keyword-a / keyword-b); the keyword list
 * cycles across them by index parity, so any number of terms map onto the
 * two available colors. An empty/omitted list falls back to the original
 * defaults so out-of-the-box behavior is unchanged. */
const DEFAULT_KEYWORDS = ["JSB1000", "ST1000"];

function escapeRegExp(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function colorizeKeywords(text: string, keywords?: string[]): string {
  const list = keywords && keywords.length > 0 ? keywords : DEFAULT_KEYWORDS;
  let result = text;
  list.forEach((term, index) => {
    if (!term) return;
    const slot = index % 2 === 0 ? "keyword-a" : "keyword-b";
    const re = new RegExp(escapeRegExp(term), "g");
    result = result.replace(re, `<span class="keyword ${slot}">${term}</span>`);
  });
  return result;
}
