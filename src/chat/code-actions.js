/**
 * OpenLLM Chat — Code Actions
 * Handles copy and preview buttons on code blocks.
 * Most logic is in message-renderer.js; this module provides
 * additional utilities and the preview window integration.
 */

const CodeActions = (() => {
  /**
   * Copy code to clipboard with toast notification.
   */
  async function copyCode(code) {
    try {
      await navigator.clipboard.writeText(code);
      ChatManager.showToast('Code copied to clipboard', 'success');
      return true;
    } catch (e) {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = code;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand('copy');
        ChatManager.showToast('Code copied to clipboard', 'success');
        return true;
      } catch (e2) {
        ChatManager.showToast('Failed to copy code', 'error');
        return false;
      } finally {
        document.body.removeChild(textarea);
      }
    }
  }

  /**
   * Open code in preview window.
   */
  function previewCode(code, language) {
    if (window.PreviewWindow) {
      window.PreviewWindow.open(code, language);
    } else {
      // Fallback: open in new tab
      const blob = new Blob([code], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
  }

  /**
   * Generate preview HTML for a code snippet.
   */
  function generatePreviewHTML(code, language) {
    if (language === 'html' || language === 'htm') {
      return code;
    }

    if (language === 'css') {
      return `<!DOCTYPE html>
<html>
<head><style>${code}</style></head>
<body>
  <div class="preview-content">
    <h1>CSS Preview</h1>
    <p>This is a preview of your CSS code applied to sample content.</p>
    <button class="sample-button">Sample Button</button>
    <div class="sample-div">Sample Div</div>
    <ul class="sample-list"><li>Item 1</li><li>Item 2</li><li>Item 3</li></ul>
  </div>
</body>
</html>`;
    }

    if (language === 'javascript' || language === 'js') {
      return `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; padding: 20px; }
    .output { background: #f5f5f5; padding: 10px; margin: 10px 0; border-radius: 4px; border-left: 4px solid #007acc; }
    .error { background: #ffe6e6; border-left-color: #cc0000; }
  </style>
</head>
<body>
  <h1>JavaScript Preview</h1>
  <div id="output" class="output">JavaScript code will execute here...</div>
  <script>
    (function() {
      const output = document.getElementById('output');
      try {
        ${code}
        if (output.textContent === 'JavaScript code will execute here...') {
          output.textContent = 'JavaScript executed successfully!';
        }
      } catch (error) {
        output.textContent = 'Error: ' + error.message;
        output.className = 'output error';
      }
    })();
  </script>
</body>
</html>`;
    }

    // Default: wrap in pre/code
    return `<!DOCTYPE html>
<html>
<head><style>body{font-family:monospace;padding:20px;white-space:pre-wrap;}</style></head>
<body>${code.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</body>
</html>`;
  }

  return {
    copyCode,
    previewCode,
    generatePreviewHTML,
  };
})();

window.CodeActions = CodeActions;