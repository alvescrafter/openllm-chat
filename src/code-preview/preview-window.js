/**
 * OpenLLM Chat — Code Preview Window
 * Opens code in a popup window with sandboxed iframe.
 */

const PreviewWindow = (() => {
  let previewWindow = null;

  /**
   * Open a code preview window.
   * @param {string} code - The code to preview
   * @param {string} language - The language (html, css, js, etc.)
   */
  function open(code, language) {
    const previewHTML = generatePreviewHTML(code, language);

    // Try to open as popup window
    const width = 800;
    const height = 600;
    const left = (screen.width - width) / 2;
    const top = (screen.height - height) / 2;

    try {
      previewWindow = window.open('', 'code-preview',
        `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`);

      if (previewWindow) {
        previewWindow.document.open();
        previewWindow.document.write(previewHTML);
        previewWindow.document.close();
        previewWindow.focus();
        return;
      }
    } catch (e) {
      console.warn('[PreviewWindow] Popup blocked, falling back to new tab');
    }

    // Fallback: open in new tab via Blob URL
    try {
      const blob = new Blob([previewHTML], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
      console.error('[PreviewWindow] Failed to open preview:', e);
      ChatManager.showToast('Failed to open preview window', 'error');
    }
  }

  /**
   * Generate the preview HTML document.
   */
  function generatePreviewHTML(code, language) {
    const escapedCode = JSON.stringify(code);

    if (language === 'html' || language === 'htm') {
      // For HTML, render directly in iframe
      return `<!DOCTYPE html>
<html>
<head>
  <title>Code Preview</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #1e1e1e; color: #ccc; }
    .toolbar { background: #2d2d2d; padding: 8px 16px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #404040; }
    .toolbar-title { font-size: 13px; color: #aaa; font-family: monospace; }
    .toolbar-actions { display: flex; gap: 8px; }
    .toolbar-btn { background: #3d3d3d; color: #ccc; border: 1px solid #555; padding: 4px 12px; cursor: pointer; border-radius: 4px; font-size: 12px; font-family: inherit; }
    .toolbar-btn:hover { background: #4d4d4d; color: #fff; }
    iframe { width: 100%; height: calc(100vh - 40px); border: none; background: white; }
  </style>
</head>
<body>
  <div class="toolbar">
    <span class="toolbar-title">Preview: HTML</span>
    <div class="toolbar-actions">
      <button class="toolbar-btn" onclick="refresh()">⟳ Refresh</button>
      <button class="toolbar-btn" onclick="openInNewTab()">↗ Open in Tab</button>
    </div>
  </div>
  <iframe id="preview-frame" sandbox="allow-scripts allow-forms allow-popups"></iframe>
  <script>
    const code = ${escapedCode};
    const frame = document.getElementById('preview-frame');
    function render() {
      const doc = frame.contentDocument || frame.contentWindow.document;
      doc.open();
      doc.write(code);
      doc.close();
    }
    function refresh() { render(); }
    function openInNewTab() {
      const blob = new Blob([code], {type: 'text/html'});
      window.open(URL.createObjectURL(blob), '_blank');
    }
    render();
  </script>
</body>
</html>`;
    }

    if (language === 'css') {
      return `<!DOCTYPE html>
<html>
<head>
  <title>CSS Preview</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #1e1e1e; color: #ccc; }
    .toolbar { background: #2d2d2d; padding: 8px 16px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #404040; }
    .toolbar-title { font-size: 13px; color: #aaa; font-family: monospace; }
    .toolbar-actions { display: flex; gap: 8px; }
    .toolbar-btn { background: #3d3d3d; color: #ccc; border: 1px solid #555; padding: 4px 12px; cursor: pointer; border-radius: 4px; font-size: 12px; font-family: inherit; }
    .toolbar-btn:hover { background: #4d4d4d; color: #fff; }
    iframe { width: 100%; height: calc(100vh - 40px); border: none; background: white; }
  </style>
</head>
<body>
  <div class="toolbar">
    <span class="toolbar-title">Preview: CSS</span>
    <div class="toolbar-actions">
      <button class="toolbar-btn" onclick="refresh()">⟳ Refresh</button>
    </div>
  </div>
  <iframe id="preview-frame" sandbox="allow-scripts"></iframe>
  <script>
    const code = ${escapedCode};
    const frame = document.getElementById('preview-frame');
    function render() {
      const doc = frame.contentDocument || frame.contentWindow.document;
      doc.open();
      doc.write('<!DOCTYPE html><html><head><style>' + code + '</style></head><body><div class="preview-content"><h1>CSS Preview</h1><p>This is a preview of your CSS code applied to sample content.</p><button class="sample-button">Sample Button</button><div class="sample-div">Sample Div</div><ul class="sample-list"><li>List item 1</li><li>List item 2</li><li>List item 3</li></ul></div></body></html>');
      doc.close();
    }
    function refresh() { render(); }
    render();
  </script>
</body>
</html>`;
    }

    if (language === 'javascript' || language === 'js') {
      return `<!DOCTYPE html>
<html>
<head>
  <title>JavaScript Preview</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #1e1e1e; color: #ccc; }
    .toolbar { background: #2d2d2d; padding: 8px 16px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #404040; }
    .toolbar-title { font-size: 13px; color: #aaa; font-family: monospace; }
    .toolbar-actions { display: flex; gap: 8px; }
    .toolbar-btn { background: #3d3d3d; color: #ccc; border: 1px solid #555; padding: 4px 12px; cursor: pointer; border-radius: 4px; font-size: 12px; font-family: inherit; }
    .toolbar-btn:hover { background: #4d4d4d; color: #fff; }
    iframe { width: 100%; height: calc(100vh - 40px); border: none; background: white; }
  </style>
</head>
<body>
  <div class="toolbar">
    <span class="toolbar-title">Preview: JavaScript</span>
    <div class="toolbar-actions">
      <button class="toolbar-btn" onclick="refresh()">⟳ Refresh</button>
    </div>
  </div>
  <iframe id="preview-frame" sandbox="allow-scripts"></iframe>
  <script>
    const code = ${escapedCode};
    const frame = document.getElementById('preview-frame');
    function render() {
      const html = '<!DOCTYPE html><html><head><style>body{font-family:Arial,sans-serif;padding:20px;}.output{background:#f5f5f5;padding:10px;margin:10px 0;border-radius:4px;border-left:4px solid #007acc;}.error{background:#ffe6e6;border-left-color:#cc0000;}</style></head><body><h1>JavaScript Preview</h1><div id="output" class="output">JavaScript code will execute here...</div><script>(function(){const output=document.getElementById("output");try{' + code + '}catch(error){output.textContent="Error: "+error.message;output.className="output error";}})();<\\/script></body></html>';
      const doc = frame.contentDocument || frame.contentWindow.document;
      doc.open();
      doc.write(html);
      doc.close();
    }
    function refresh() { render(); }
    render();
  </script>
</body>
</html>`;
    }

    // Default: plain text preview
    return `<!DOCTYPE html>
<html>
<head>
  <title>Code Preview</title>
  <style>
    body { font-family: monospace; padding: 20px; white-space: pre-wrap; background: #1e1e1e; color: #d4d4d4; }
  </style>
</head>
<body>${code.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</body>
</html>`;
  }

  return { open };
})();

window.PreviewWindow = PreviewWindow;