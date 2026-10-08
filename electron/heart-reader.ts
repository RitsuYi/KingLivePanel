// Runs in the remote page's isolated world, without a preload or local APIs.
// Keep this function self-contained: its source is sent to WebContents.
export function readHeartRateFromPage(): number | null {
  const visible = (element: Element) => !element.closest('script, style, noscript, template, svg, canvas, input, select, textarea, button, [hidden], [aria-hidden="true"]')
    && element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
  const parse = (element: Element) => {
    const fragments: string[] = [];
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.parentElement && visible(node.parentElement)) fragments.push(node.textContent || '');
    }
    const text = fragments.join(' ').trim();
    if (text.length > 40) return null;
    const match = text.match(/^(?:(?:heart\s*rate|心率|bpm)\s*[:：]?\s*)?(\d{1,3})(?:\s*(?:bpm|次\s*\/\s*分))?$/i);
    const value = match ? Number(match[1]) : 0;
    return value > 0 && value <= 300 ? value : null;
  };
  const uniqueValue = (elements: Element[]) => {
    const values = new Set(elements.map(parse).filter((value): value is number => value !== null));
    return values.size === 1 ? [...values][0] : null;
  };
  // Named outputs cover older widgets; tabular-nums is used by the current app.
  // If a known output is empty/offline, do not fall back to an unrelated number.
  const selectors = [
    '#heartRate, #heart-rate, #heartrate, #heartRateValue, #hr, #bpm, .heart-rate, .heartRate, .heartrate, .hr-value, .bpm, [data-heart-rate]',
    '.tabular-nums',
  ];
  for (const selector of selectors) {
    const elements = Array.from(document.querySelectorAll(selector)).filter(visible);
    if (elements.length) return uniqueValue(elements);
  }
  // Designer overlays can use unlabelled spans. Only accept an unambiguous
  // numeric output, never the first number embedded in arbitrary page text.
  return uniqueValue(Array.from(document.querySelectorAll('div, span, p, strong, b, output, h1, h2')).filter(visible));
}

export const HEART_READER_SCRIPT = `(${readHeartRateFromPage.toString()})()`;
