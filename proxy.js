/**
 * OpenLLM Chat — CORS Proxy Server
 * Minimal Node.js proxy to handle CORS restrictions for LLM APIs and search.
 * Run: node proxy.js
 * Default port: 8321
 */

const http = require('http');
const https = require('https');
const url = require('url');

const PORT = process.env.PROXY_PORT || 8321;

const server = http.createServer((req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Max-Age', '86400');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Parse target URL from query parameter or path
  const parsedUrl = url.parse(req.url, true);
  let targetUrl = parsedUrl.query.url;

  // Support path-based format: /https://example.com/path
  if (!targetUrl && req.url.length > 1) {
    const pathPart = req.url.substring(1); // Remove leading /
    if (pathPart.startsWith('http://') || pathPart.startsWith('https://')) {
      targetUrl = pathPart;
    }
  }

  if (!targetUrl) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Missing "url" query parameter' }));
    return;
  }

  let targetParsed;
  try {
    targetParsed = new URL(targetUrl);
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid target URL' }));
    return;
  }

  // Only allow http/https
  if (!['http:', 'https:'].includes(targetParsed.protocol)) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Only http/https URLs are supported' }));
    return;
  }

  // Collect request body
  const bodyChunks = [];
  req.on('data', chunk => bodyChunks.push(chunk));
  req.on('end', () => {
    const body = bodyChunks.length > 0 ? Buffer.concat(bodyChunks) : null;

    // Build proxy request options
    const options = {
      hostname: targetParsed.hostname,
      port: targetParsed.port || (targetParsed.protocol === 'https:' ? 443 : 80),
      path: targetParsed.pathname + targetParsed.search,
      method: req.method,
      headers: {
        ...req.headers,
        host: targetParsed.host,
      },
    };

    // Remove proxy-specific headers
    delete options.headers['origin'];
    delete options.headers['referer'];

    // Remove content-length if we modified the body
    if (body) {
      options.headers['content-length'] = body.length;
    }

    const proxyModule = targetParsed.protocol === 'https:' ? https : http;
    const proxyReq = proxyModule.request(options, (proxyRes) => {
      // Forward status code
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
      console.error('[Proxy] Error:', err.message);
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Proxy error: ${err.message}` }));
    });

    if (body) {
      proxyReq.write(body);
    }
    proxyReq.end();
  });
});

server.listen(PORT, () => {
  console.log(`[OpenLLM Chat Proxy] Running on http://localhost:${PORT}`);
  console.log(`[OpenLLM Chat Proxy] Usage: http://localhost:${PORT}/?url=<encoded_target_url>`);
});