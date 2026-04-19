/**
 * OpenLLM Chat — Website Visitor (Fetcher)
 * Fetches and extracts content from web pages via CORS proxy.
 */

const WebsiteVisitor = (() => {
  /**
   * Visit a URL and extract its content.
   * @param {string} url - The URL to visit
   * @param {object} options - { maxLinks, maxImages, contentLimit, findInPage }
   * @returns {Promise<object>} Extracted content
   */
  async function visit(url, options = {}) {
    const {
      maxLinks = 20,
      maxImages = 5,
      contentLimit = 3000,
      findInPage = [],
    } = options;

    if (!url || !url.startsWith('http')) {
      throw new Error('Please provide a valid URL starting with http:// or https://');
    }

    try {
      const response = await CorsProxy.fetchWithProxy(url, {
        method: 'GET',
        headers: getHeaders(url),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
      }

      const html = await response.text();
      return extractContent(html, url, { maxLinks, maxImages, contentLimit, findInPage });
    } catch (error) {
      console.error('[WebsiteVisitor] Error:', error);
      throw new Error(`Failed to visit ${url}: ${error.message}`);
    }
  }

  /**
   * Extract content from HTML.
   */
  function extractContent(html, baseUrl, options) {
    const { maxLinks = 20, maxImages = 5, contentLimit = 3000, findInPage = [] } = options;

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Title
    const title = doc.querySelector('title')?.textContent?.trim() || '';

    // Headings
    const h1 = doc.querySelector('h1')?.textContent?.trim() || '';
    const h2s = [...doc.querySelectorAll('h2')].map(h => h.textContent.trim()).slice(0, 5);
    const h3s = [...doc.querySelectorAll('h3')].map(h => h.textContent.trim()).slice(0, 5);

    // Links — scored and prioritized
    const allLinks = [...doc.querySelectorAll('a[href]')]
      .map(a => ({
        label: a.textContent.replace(/\s+/g, ' ').trim(),
        url: resolveUrl(a.getAttribute('href'), baseUrl),
      }))
      .filter(l => l.url && l.url.startsWith('http') && l.label.length > 0);

    const scoredLinks = scoreLinks(allLinks, findInPage);
    const links = deduplicateLinks(scoredLinks).slice(0, maxLinks);

    // Images
    const allImages = [...doc.querySelectorAll('img[src]')]
      .map(img => ({
        alt: img.getAttribute('alt') || '',
        src: resolveUrl(img.getAttribute('src'), baseUrl),
      }))
      .filter(i => i.src && i.src.startsWith('http'))
      .filter(i => /\.(jpg|png|gif|webp|svg|jpeg)(\?.*)?$/i.test(i.src));

    const images = allImages.slice(0, maxImages).map(i => [i.alt, i.src]);

    // Text content — remove scripts, styles, nav, etc.
    const clone = doc.cloneNode(true);
    clone.querySelectorAll('script, style, nav, header, footer, noscript, .ad, .sidebar, .cookie-banner, iframe')
      .forEach(el => el.remove());

    let textContent = clone.body?.textContent || '';
    textContent = textContent.replace(/\s+/g, ' ').trim();

    // If findInPage terms provided, extract relevant sections
    if (findInPage.length > 0 && textContent.length > contentLimit) {
      textContent = extractRelevantSections(textContent, findInPage, contentLimit);
    } else {
      textContent = textContent.slice(0, contentLimit);
    }

    return {
      url: baseUrl,
      title,
      h1,
      h2: h2s,
      h3: h3s,
      links: links.map(l => [l.label, l.url]),
      images,
      content: textContent,
    };
  }

  /**
   * Score links by relevance.
   */
  function scoreLinks(links, searchTerms = []) {
    return links.map((link, index) => {
      let score = 0;

      // Prefer links with longer labels (likely content links, not nav)
      score += link.label.split(/\s+/).length;

      // Penalize links with lots of digits (likely pagination etc)
      const digitCount = (link.url.match(/\d/g) || []).length;
      score += (1 / Math.max(1, digitCount)) * 10;

      // Boost if search terms found in label or URL
      if (searchTerms.length) {
        searchTerms.forEach(term => {
          if (link.label.toLowerCase().includes(term.toLowerCase())) score += 1000;
          if (link.url.toLowerCase().includes(term.toLowerCase())) score += 500;
        });
      }

      return { ...link, score };
    }).sort((a, b) => b.score - a.score);
  }

  /**
   * Deduplicate links by URL.
   */
  function deduplicateLinks(links) {
    const seen = new Set();
    return links.filter(l => {
      if (seen.has(l.url)) return false;
      seen.add(l.url);
      return true;
    });
  }

  /**
   * Extract relevant sections around search terms.
   */
  function extractRelevantSections(text, terms, limit) {
    const sections = [];
    const padding = Math.floor(limit / (terms.length * 2));

    for (const term of terms) {
      try {
        const regex = new RegExp(`.{0,${padding}}${escapeRegex(term)}.{0,${padding}}`, 'gi');
        let match;
        while ((match = regex.exec(text))) {
          sections.push({
            start: match.index,
            end: match.index + match[0].length,
            text: match[0],
          });
        }
      } catch (e) {
        // Invalid regex, skip
      }
    }

    if (sections.length === 0) {
      return text.slice(0, limit);
    }

    // Sort by position and merge overlapping
    sections.sort((a, b) => a.start - b.start);
    const merged = [sections[0]];
    for (let i = 1; i < sections.length; i++) {
      const last = merged[merged.length - 1];
      if (sections[i].start <= last.end) {
        last.end = Math.max(last.end, sections[i].end);
        last.text = text.slice(last.start, last.end);
      } else {
        merged.push({ ...sections[i] });
      }
    }

    return merged.map(s => s.text).join('\n...\n').slice(0, limit);
  }

  /**
   * Resolve a relative URL against a base URL.
   */
  function resolveUrl(href, baseUrl) {
    if (!href) return '';
    try {
      return new URL(href, baseUrl).href;
    } catch {
      return href;
    }
  }

  /**
   * Escape a string for use in a regex.
   */
  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Get appropriate headers for fetching a URL.
   */
  function getHeaders(url) {
    let referer = '';
    try {
      const domain = new URL(url).hostname;
      referer = `https://${domain}/`;
    } catch { /* ignore */ }

    return {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': referer,
    };
  }

  return { visit, extractContent };
})();

window.WebsiteVisitor = WebsiteVisitor;