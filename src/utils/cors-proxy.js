/**
 * OpenLLM Chat — CORS Proxy Resolution
 * Handles routing requests through configured CORS proxy.
 */

const CorsProxy = (() => {
  /**
   * Get the proxy URL for a given target URL based on current config.
   * @param {string} targetUrl - The URL to proxy
   * @returns {string} The proxied URL, or the original if no proxy configured
   */
  function getProxiedUrl(targetUrl) {
    const config = window.AppStore?.state?.corsProxy;
    if (!config || config.mode === 'none') {
      return targetUrl;
    }

    switch (config.mode) {
      case 'node':
        // Node.js proxy: http://localhost:8321/https://example.com
        const nodePort = config.nodePort || 8321;
        return `http://localhost:${nodePort}/${targetUrl}`;

      case 'searxng':
        // SearXNG has its own JSON API, handled separately
        return targetUrl;

      case 'custom':
        // Custom proxy: https://my-proxy.com/proxy?url=https://example.com
        if (!config.customUrl) return targetUrl;
        return `${config.customUrl}/${targetUrl}`;

      default:
        return targetUrl;
    }
  }

  /**
   * Fetch a URL through the configured CORS proxy.
   * @param {string} url - The URL to fetch
   * @param {object} options - Fetch options
   * @returns {Promise<Response>}
   */
  async function fetchWithProxy(url, options = {}) {
    const proxiedUrl = getProxiedUrl(url);
    const defaultHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    };

    // Don't override Referer for proxied requests
    if (!proxiedUrl.includes('localhost') && !proxiedUrl.includes('127.0.0.1')) {
      try {
        const urlObj = new URL(url);
        defaultHeaders['Referer'] = `${urlObj.protocol}//${urlObj.hostname}/`;
      } catch (e) { /* ignore */ }
    }

    const mergedOptions = {
      ...options,
      headers: {
        ...defaultHeaders,
        ...(options.headers || {}),
      },
    };

    try {
      const response = await fetch(proxiedUrl, mergedOptions);
      return response;
    } catch (error) {
      // If proxy fails, try direct fetch as fallback
      if (proxiedUrl !== url) {
        console.warn('[CorsProxy] Proxy failed, trying direct fetch:', error.message);
        try {
          return await fetch(url, mergedOptions);
        } catch (directError) {
          throw new Error(
            `Failed to fetch "${url}". Both proxy and direct requests failed.\n` +
            `Proxy error: ${error.message}\n` +
            `Direct error: ${directError.message}\n\n` +
            `Make sure your CORS proxy is running or configure a different proxy in Settings → Tools.`
          );
        }
      }
      throw error;
    }
  }

  /**
   * Test if the configured proxy is reachable.
   * @returns {Promise<{ok: boolean, message: string}>}
   */
  async function testProxy() {
    const config = window.AppStore?.state?.corsProxy;
    if (!config || config.mode === 'none') {
      return { ok: true, message: 'No proxy configured (direct requests only)' };
    }

    switch (config.mode) {
      case 'node': {
        const port = config.nodePort || 8321;
        try {
          const response = await fetch(`http://localhost:${port}/https://httpbin.org/get`, {
            method: 'GET',
            signal: AbortSignal.timeout(5000),
          });
          if (response.ok) {
            return { ok: true, message: `Node.js proxy running on port ${port}` };
          }
          return { ok: false, message: `Proxy responded with status ${response.status}` };
        } catch (error) {
          return { ok: false, message: `Cannot reach Node.js proxy on port ${port}: ${error.message}` };
        }
      }

      case 'searxng': {
        const url = config.searxngUrl || 'http://localhost:8888';
        try {
          const response = await fetch(`${url}/search?q=test&format=json`, {
            method: 'GET',
            signal: AbortSignal.timeout(5000),
          });
          if (response.ok) {
            return { ok: true, message: `SearXNG instance reachable at ${url}` };
          }
          return { ok: false, message: `SearXNG responded with status ${response.status}` };
        } catch (error) {
          return { ok: false, message: `Cannot reach SearXNG at ${url}: ${error.message}` };
        }
      }

      case 'custom': {
        if (!config.customUrl) {
          return { ok: false, message: 'Custom proxy URL not configured' };
        }
        try {
          const testUrl = `${config.customUrl}/https://httpbin.org/get`;
          const response = await fetch(testUrl, {
            method: 'GET',
            signal: AbortSignal.timeout(5000),
          });
          if (response.ok) {
            return { ok: true, message: `Custom proxy reachable at ${config.customUrl}` };
          }
          return { ok: false, message: `Custom proxy responded with status ${response.status}` };
        } catch (error) {
          return { ok: false, message: `Cannot reach custom proxy: ${error.message}` };
        }
      }

      default:
        return { ok: false, message: `Unknown proxy mode: ${config.mode}` };
    }
  }

  /**
   * Check if a proxy is required for the given URL.
   * @param {string} url
   * @returns {boolean}
   */
  function isProxyNeeded(url) {
    try {
      const parsed = new URL(url);
      // Same-origin requests don't need a proxy
      return parsed.origin !== window.location.origin;
    } catch {
      return true;
    }
  }

  return { getProxiedUrl, fetchWithProxy, testProxy, isProxyNeeded };
})();

window.CorsProxy = CorsProxy;