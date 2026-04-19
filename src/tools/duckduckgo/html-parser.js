/**
 * OpenLLM Chat — DuckDuckGo HTML Parser
 * Parses DDG search results from HTML (regex-based, like LM Studio implementation).
 */

const DuckDuckGoHTMLParser = (() => {
  /**
   * Parse search results from DDG HTML response.
   * @param {string} html - The HTML response from DDG
   * @param {number} maxResults - Maximum number of results to return
   * @returns {Array} Array of {title, url, snippet}
   */
  function parseSearchResults(html, maxResults = 5) {
    const results = [];
    const seenUrls = new Set();

    // Strategy 1: Parse result__a links (DDG's result link class)
    const linkRegex = /class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
    let match;

    while (results.length < maxResults && (match = linkRegex.exec(html)) !== null) {
      const url = cleanUrl(match[1]);
      const title = cleanText(match[2]);

      if (url && title && !seenUrls.has(url) && !isBlacklistedUrl(url)) {
        seenUrls.add(url);
        results.push({ title, url, snippet: '' });
      }
    }

    // Strategy 2: Parse result__snippet for descriptions
    const snippetRegex = /class="result__snippet"[^>]*>([\s\S]*?)<\/[a-z]+>/gi;
    const snippets = [];
    while ((match = snippetRegex.exec(html)) !== null) {
      snippets.push(cleanText(match[1]));
    }

    // Match snippets to results by index
    results.forEach((result, i) => {
      if (snippets[i]) {
        result.snippet = snippets[i];
      }
    });

    // Strategy 3: Fallback — generic link parsing if Strategy 1 didn't find enough
    if (results.length < maxResults) {
      const genericLinkRegex = /\shref="(https?:\/\/[^"]*)"[^>]*>([^<]{3,})<\/a>/gi;
      while (results.length < maxResults && (match = genericLinkRegex.exec(html)) !== null) {
        const url = cleanUrl(match[1]);
        const title = cleanText(match[2]);

        if (url && title && !seenUrls.has(url) && !isBlacklistedUrl(url) && title.length > 5) {
          seenUrls.add(url);
          results.push({ title, url, snippet: '' });
        }
      }
    }

    return results;
  }

  /**
   * Parse image search results from DDG HTML response.
   * @param {string} html - The HTML response from DDG image search
   * @param {number} maxResults - Maximum number of results
   * @returns {Array} Array of {title, imageUrl, thumbnailUrl, sourceUrl}
   */
  function parseImageResults(html, maxResults = 5) {
    const results = [];
    const seenUrls = new Set();

    // DDG image results are in JSON embedded in the HTML
    // Try to find the image data
    const jsonRegex = /"images":\s*\[([\s\S]*?)\]/;
    const jsonMatch = html.match(jsonRegex);

    if (jsonMatch) {
      try {
        const images = JSON.parse(`[${jsonMatch[1]}]`);
        for (const img of images) {
          if (results.length >= maxResults) break;
          const url = img.image || img.thumbnail || '';
          const sourceUrl = img.url || '';
          const title = img.title || img.alt || '';
          const thumbnail = img.thumbnail || img.image || '';

          if (url && !seenUrls.has(url)) {
            seenUrls.add(url);
            results.push({ title, imageUrl: url, thumbnailUrl: thumbnail, sourceUrl });
          }
        }
      } catch (e) {
        // JSON parse failed, fall through to regex
      }
    }

    // Fallback: regex for img tags
    if (results.length < maxResults) {
      const imgRegex = /<img[^>]+src="(https?:\/\/[^"]*)"[^>]*(?:alt="([^"]*)")?/gi;
      let match;
      while (results.length < maxResults && (match = imgRegex.exec(html)) !== null) {
        const url = match[1];
        const title = match[2] || '';
        if (url && !seenUrls.has(url) && !isBlacklistedUrl(url)) {
          seenUrls.add(url);
          results.push({ title, imageUrl: url, thumbnailUrl: url, sourceUrl: '' });
        }
      }
    }

    return results;
  }

  /**
   * Clean a URL by removing DDG redirect prefixes.
   */
  function cleanUrl(url) {
    if (!url) return '';

    // Remove DDG redirect
    const redirectMatch = url.match(/uddg=([^&]+)/);
    if (redirectMatch) {
      try {
        return decodeURIComponent(redirectMatch[1]);
      } catch {
        return url;
      }
    }

    // Remove DDG tracking parameters
    try {
      const parsed = new URL(url);
      parsed.searchParams.delete('t');
      parsed.searchParams.delete('ia');
      parsed.searchParams.delete('iai');
      return parsed.toString();
    } catch {
      return url;
    }
  }

  /**
   * Clean text by removing HTML tags and normalizing whitespace.
   */
  function cleanText(html) {
    if (!html) return '';
    return html
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Check if a URL should be blacklisted (DDG internal, ads, etc.)
   */
  function isBlacklistedUrl(url) {
    if (!url) return true;
    const blacklisted = [
      'duckduckgo.com',
      'duck.com',
      'r.duckduckgo.com',
      'ad.doubleclick.net',
      'pagead2.googlesyndication.com',
    ];
    try {
      const hostname = new URL(url).hostname;
      return blacklisted.some(b => hostname.includes(b));
    } catch {
      return true;
    }
  }

  return {
    parseSearchResults,
    parseImageResults,
    cleanUrl,
    cleanText,
  };
})();

window.DuckDuckGoHTMLParser = DuckDuckGoHTMLParser;