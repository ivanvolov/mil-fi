// inline SVG glyphs ported from mockup/screen-1.html lines 237-252
const SQUARE = `<svg width="WIDTH" height="WIDTH" viewBox="0 0 20 20"><rect x="2" y="2" width="16" height="16" fill="#0d1117" stroke="#e7e9ea" stroke-width="1.4"/><circle cx="10" cy="10" r="2.5" fill="#e7e9ea"/></svg>`;
const TRIANGLE = `<svg width="WIDTH" height="WIDTH" viewBox="0 0 20 20"><path d="M 1 18 L 10 2 L 19 18 Z" fill="#0d1117" stroke="#e7e9ea" stroke-width="1.4"/><circle cx="10" cy="13" r="1.8" fill="#e7e9ea"/></svg>`;
const DIAMOND = `<svg width="WIDTH" height="WIDTH" viewBox="0 0 20 20"><path d="M 10 1 L 19 11 L 10 7 L 1 11 Z" fill="#0d1117" stroke="#e7e9ea" stroke-width="1.4"/><circle cx="10" cy="7" r="1.8" fill="#e7e9ea"/></svg>`;

export function glyphHtml(category: 'interceptor' | 'mfg' | 'manpads', size = 12): string {
  const tpl = category === 'interceptor' ? SQUARE : category === 'mfg' ? TRIANGLE : DIAMOND;
  return tpl.replaceAll('WIDTH', String(size));
}

export function threatGlyphHtml(size = 14): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 14 14"><path d="M7 1 L13 13 L1 13 Z" fill="#ef4444" stroke="#ef4444" stroke-width="1"/></svg>`;
}
