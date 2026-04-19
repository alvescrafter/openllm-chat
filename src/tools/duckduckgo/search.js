/**
 * OpenLLM Chat — DuckDuckGo Search
 * Web search via DuckDuckGo HTML endpoint through CORS proxy.
 */

const DuckDuckGoSearch = (() => {
  let lastRequestTime = 0;
  const MIN_REQUEST_INTERVAL = 2000; // 2s rate limit

  const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  ];

  /**
   * Search the web using DuckDuckGo.
   * @param {string} query - Search query
   * @param {object} options - { pageSize, safeSearch }
   * @returns {Promise<{results: Array, count: number, query: string}>}
   */
  async function webSearch(query, options = {}) {
    const { pageSize = 5, safeSearch = 'moderate' } = options;

    // Check if SearXNG is configured
    const proxyConfig = AppStore.state?.corsProxy;
    if (proxyConfig?.mode === 'searxng') {
      return await searchWithSearXNG(query, { pageSize, safeSearch });
    }

    // Use DDG HTML search with CORS proxy
    await rateLimit();

    const url = new URL('https://duckduckgo.com/html/');
    url.searchParams.append('q', query);

    const safeSearchMap = { strict: '-1', moderate: null, off: '1' };
    const ssValue = safeSearchMap[safeSearch] || safeSearchMap.moderate;
    if (ssValue) url.searchParams.append('p', ssValue);

    const targetUrl = url.toString();

    try {
      const response = await CorsProxy.fetchWithProxy(targetUrl, {
        method: 'GET',
        headers: getRandomHeaders(),
      });

      if (!response.ok) {
        throw new Error(`Search failed: ${response.status} ${response.statusText}`);
      }

      const html = await response.text();
      const results = DuckDuckGoHTMLParser.parseSearchResults(html, pageSize);

      return {
        results,
        count: results.length,
        query,
      };
    } catch (error) {
      console.error('[DuckDuckGoSearch] Error:', error);
      throw new Error(`Search failed: ${error.message}. Make sure your CORS proxy is configured in Settings → Tools.`);
    }
  }

  /**
   * Search using SearXNG instance (recommended for best results).
   */
  async function searchWithSearXNG(query, options = {}) {
    const { pageSize = 5, safeSearch = 'moderate' } = options;
    const searxngUrl = AppStore.state?.corsProxy?.searxngUrl || 'http://localhost:8888';

    const url = new URL(`${searxngUrl}/search`);
    url.searchParams.set('q', query);
    url.searchParams.set('format', 'json');
    url.searchParams.set('categories', 'general');
    const ssMap = { strict: '2', moderate: '1', off: '0' };
    url.searchParams.set('safesearch', ssMap[safeSearch] || '1');

    try {
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`SearXNG error: ${response.status}`);
      }

      const data = await response.json();

      return {
        results: (data.results || [])
          .slice(0, pageSize)
          .map(r => ({
            title: r.title || '',
            url: r.url || '',
            snippet: r.content || '',
          })),
        count: Math.min(data.results?.length || 0, pageSize),
        query,
      };
    } catch (error) {
      console.error('[DuckDuckGoSearch] SearXNG error:', error);
      // Fall back to DDG HTML search
      console.warn('[DuckDuckGoSearch] Falling back to DDG HTML search');
      return await webSearchDDGHtml(query, options);
    }
  }

  /**
   * Direct DDG HTML search (used as fallback from SearXNG).
   */
  async function webSearchDDGHtml(query, options = {}) {
    const { pageSize = 5, safeSearch = 'moderate' } = options;
    await rateLimit();

    const url = new URL('https://duckduckgo.com/html/');
    url.searchParams.append('q', query);
    const safeSearchMap = { strict: '-1', moderate: null, off: '1' };
    const ssValue = safeSearchMap[safeSearch] || safeSearchMap.moderate;
    if (ssValue) url.searchParams.append('p', ssValue);

    const response = await CorsProxy.fetchWithProxy(url.toString(), {
      method: 'GET',
      headers: getRandomHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Search failed: ${response.status}`);
    }

    const html = await response.text();
    const results = DuckDuckGoHTMLParser.parseSearchResults(html, pageSize);

    return { results, count: results.length, query };
  }

  /**
   * Rate limiting — ensure minimum interval between requests.
   */
  async function rateLimit() {
    const now = Date.now();
    const elapsed = now - lastRequestTime;
    if (elapsed < MIN_REQUEST_INTERVAL) {
      await new Promise(r => setTimeout(r, MIN_REQUEST_INTERVAL - elapsed));
    }
    lastRequestTime = Date.now();
  }

  /**
   * Get random headers with rotating user agent.
   */
  function getRandomHeaders() {
    return {
      'User-Agent': USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate',
      'Referer': 'https://duckduckgo.com/',
    };
  }

  return {
    webSearch,
    searchWithSearXNG,
  };
})();

window.DuckDuckGoSearch = DuckDuckGoSearch;