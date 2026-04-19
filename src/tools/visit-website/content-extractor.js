/**
 * OpenLLM Chat — Content Extractor
 * Standalone content extraction module (re-exports from fetcher.js).
 * The main extraction logic is in fetcher.js's extractContent function.
 * This module provides additional utilities.
 */

const ContentExtractor = (() => {
  /**
   * Extract just the text content from HTML (no links/images).
   * Useful for quick content previews.
   */
  function extractText(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Remove non-content elements
    doc.querySelectorAll('script, style, nav, header, footer, noscript, .ad, .sidebar, .cookie-banner')
      .forEach(el => el.remove());

    let text = doc.body?.textContent || '';
    text = text.replace(/\s+/g, ' ').trim();
    return text;
  }

  /**
   * Extract all links from HTML.
   */
  function extractLinks(html, baseUrl) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    return [...doc.querySelectorAll('a[href]')]
      .map(a => ({
        label: a.textContent.replace(/\s+/g, ' ').trim(),
        url: (() => {
          try { return new URL(a.getAttribute('href'), baseUrl).href; }
          catch { return a.getAttribute('href'); }
        })(),
      }))
      .filter(l => l.url && l.url.startsWith('http') && l.label.length > 0);
  }

  /**
   * Extract all images from HTML.
   */
  function extractImages(html, baseUrl) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    return [...doc.querySelectorAll('img[src]')]
      .map(img => ({
        alt: img.getAttribute('alt') || '',
        src: (() => {
          try { return new URL(img.getAttribute('src'), baseUrl).href; }
          catch { return img.getAttribute('src'); }
        })(),
      }))
      .filter(i => i.src && i.src.startsWith('http'));
  }

  /**
   * Truncate text to a limit, trying to break at sentence boundaries.
   */
  function truncateText(text, limit = 3000) {
    if (text.length <= limit) return text;

    const truncated = text.slice(0, limit);
    // Try to break at the last sentence
    const lastPeriod = truncated.lastIndexOf('.');
    const lastNewline = truncated.lastIndexOf('\n');
    const breakPoint = Math.max(lastPeriod, lastNewline);

    if (breakPoint > limit * 0.8) {
      return truncated.slice(0, breakPoint + 1) + '...';
    }

    return truncated + '...';
  }

  return { extractText, extractLinks, extractImages, truncateText };
})();

window.ContentExtractor = ContentExtractor;