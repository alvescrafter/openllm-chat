/**
 * OpenLLM Chat — DuckDuckGo Image Search
 */

const DuckDuckGoImageSearch = (() => {
  /**
   * Search for images using DuckDuckGo.
   * @param {string} query - Image search query
   * @param {object} options - { pageSize }
   * @returns {Promise<{results: Array, count: number, query: string}>}
   */
  async function imageSearch(query, options = {}) {
    const { pageSize = 5 } = options;

    // DDG image search uses a different endpoint
    const url = new URL('https://duckduckgo.com/');
    url.searchParams.append('q', query);
    url.searchParams.append('iax', 'images');
    url.searchParams.append('ia', 'images');

    try {
      // First, get a vqd token (DDG requires this for image search)
      const tokenResponse = await CorsProxy.fetchWithProxy(url.toString(), {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html',
        },
      });

      const tokenHtml = await tokenResponse.text();
      const vqdMatch = tokenHtml.match(/vqd=([^\s&"']+)/);
      const vqd = vqdMatch ? vqdMatch[1] : '';

      if (!vqd) {
        throw new Error('Failed to obtain DDG image search token');
      }

      // Now search for images
      const imageUrl = new URL('https://duckduckgo.com/i.js');
      imageUrl.searchParams.append('q', query);
      imageUrl.searchParams.append('vqd', vqd);
      imageUrl.searchParams.append('o', 'json');

      const imageResponse = await CorsProxy.fetchWithProxy(imageUrl.toString(), {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json',
        },
      });

      if (!imageResponse.ok) {
        throw new Error(`Image search failed: ${imageResponse.status}`);
      }

      const data = await imageResponse.json();
      const results = (data.results || [])
        .slice(0, pageSize)
        .map(r => ({
          title: r.title || '',
          imageUrl: r.image || r.thumbnail || '',
          thumbnailUrl: r.thumbnail || r.image || '',
          sourceUrl: r.url || '',
        }));

      return {
        results,
        count: results.length,
        query,
      };
    } catch (error) {
      console.error('[DuckDuckGoImageSearch] Error:', error);
      throw new Error(`Image search failed: ${error.message}`);
    }
  }

  return { imageSearch };
})();

window.DuckDuckGoImageSearch = DuckDuckGoImageSearch;