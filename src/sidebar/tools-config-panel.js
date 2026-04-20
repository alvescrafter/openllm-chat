/**
 * OpenLLM Chat — Tools Configuration Panel
 */

const ToolsConfigPanel = (() => {
  function init() {
    const corsProxyMode = document.getElementById('corsProxyMode');
    const nodeProxyConfig = document.getElementById('nodeProxyConfig');
    const searxngConfig = document.getElementById('searxngConfig');
    const customProxyConfig = document.getElementById('customProxyConfig');
    const startProxyBtn = document.getElementById('startProxyBtn');
    const searxngUrl = document.getElementById('searxngUrl');
    const testSearxngBtn = document.getElementById('testSearxngBtn');
    const customProxyUrl = document.getElementById('customProxyUrl');
    const testCustomProxyBtn = document.getElementById('testCustomProxyBtn');
    const ddgPageSize = document.getElementById('ddgPageSize');
    const ddgSafeSearch = document.getElementById('ddgSafeSearch');
    const visitContentLimit = document.getElementById('visitContentLimit');
    const visitMaxLinks = document.getElementById('visitMaxLinks');
    const visitMaxImages = document.getElementById('visitMaxImages');

    // Load saved state
    loadState();

    // CORS proxy mode change
    corsProxyMode.addEventListener('change', () => {
      const mode = corsProxyMode.value;
      nodeProxyConfig.style.display = mode === 'node' ? 'block' : 'none';
      searxngConfig.style.display = mode === 'searxng' ? 'block' : 'none';
      customProxyConfig.style.display = mode === 'custom' ? 'block' : 'none';

      AppStore.update({
        corsProxy: {
          ...AppStore.state.corsProxy,
          mode,
        },
      });

      updateProxyStatus(mode);
    });

    // Start proxy button (just shows instructions)
    startProxyBtn.addEventListener('click', () => {
      ChatManager.showToast('Run "node proxy.js" in a terminal to start the CORS proxy on port 8321', 'info');
    });

    // SearXNG URL change
    searxngUrl.addEventListener('change', () => {
      AppStore.update({
        corsProxy: {
          ...AppStore.state.corsProxy,
          searxngUrl: searxngUrl.value,
        },
      });
    });

    // Test SearXNG
    testSearxngBtn.addEventListener('click', async () => {
      testSearxngBtn.disabled = true;
      testSearxngBtn.textContent = 'Testing...';
      try {
        const result = await CorsProxy.testProxy();
        ChatManager.showToast(result.ok ? `✅ ${result.message}` : `❌ ${result.message}`, result.ok ? 'success' : 'error');
      } finally {
        testSearxngBtn.disabled = false;
        testSearxngBtn.textContent = 'Test Connection';
      }
    });

    // Custom proxy URL change
    customProxyUrl.addEventListener('change', () => {
      AppStore.update({
        corsProxy: {
          ...AppStore.state.corsProxy,
          customUrl: customProxyUrl.value,
        },
      });
    });

    // Test custom proxy
    testCustomProxyBtn.addEventListener('click', async () => {
      testCustomProxyBtn.disabled = true;
      testCustomProxyBtn.textContent = 'Testing...';
      try {
        const result = await CorsProxy.testProxy();
        ChatManager.showToast(result.ok ? `✅ ${result.message}` : `❌ ${result.message}`, result.ok ? 'success' : 'error');
      } finally {
        testCustomProxyBtn.disabled = false;
        testCustomProxyBtn.textContent = 'Test Connection';
      }
    });

    // DDG settings
    ddgPageSize.addEventListener('change', () => {
      AppStore.update({
        ddgConfig: { ...AppStore.state.ddgConfig, pageSize: parseInt(ddgPageSize.value) || 5 },
      });
    });

    ddgSafeSearch.addEventListener('change', () => {
      AppStore.update({
        ddgConfig: { ...AppStore.state.ddgConfig, safeSearch: ddgSafeSearch.value },
      });
    });

    // Visit settings
    visitContentLimit.addEventListener('change', () => {
      AppStore.update({
        visitConfig: { ...AppStore.state.visitConfig, contentLimit: parseInt(visitContentLimit.value) || 3000 },
      });
    });

    visitMaxLinks.addEventListener('change', () => {
      AppStore.update({
        visitConfig: { ...AppStore.state.visitConfig, maxLinks: parseInt(visitMaxLinks.value) || 20 },
      });
    });

    visitMaxImages.addEventListener('change', () => {
      AppStore.update({
        visitConfig: { ...AppStore.state.visitConfig, maxImages: parseInt(visitMaxImages.value) || 5 },
      });
    });
  }

  function loadState() {
    const state = AppStore.state;
    const corsProxy = state.corsProxy || { mode: 'none', nodePort: 8321, searxngUrl: 'http://localhost:8888', customUrl: '' };

    document.getElementById('corsProxyMode').value = corsProxy.mode || 'none';
    document.getElementById('nodeProxyConfig').style.display = corsProxy.mode === 'node' ? 'block' : 'none';
    document.getElementById('searxngConfig').style.display = corsProxy.mode === 'searxng' ? 'block' : 'none';
    document.getElementById('customProxyConfig').style.display = corsProxy.mode === 'custom' ? 'block' : 'none';
    document.getElementById('searxngUrl').value = corsProxy.searxngUrl || 'http://localhost:8888';
    document.getElementById('customProxyUrl').value = corsProxy.customUrl || '';

    updateProxyStatus(corsProxy.mode || 'none');

    const ddgConfig = state.ddgConfig || {};
    document.getElementById('ddgPageSize').value = ddgConfig.pageSize || 5;
    document.getElementById('ddgSafeSearch').value = ddgConfig.safeSearch || 'moderate';

    const visitConfig = state.visitConfig || {};
    document.getElementById('visitContentLimit').value = visitConfig.contentLimit || 3000;
    document.getElementById('visitMaxLinks').value = visitConfig.maxLinks || 20;
    document.getElementById('visitMaxImages').value = visitConfig.maxImages || 5;
  }

  /**
   * Update the proxy status indicator in the sidebar.
   */
  function updateProxyStatus(mode) {
    const dot = document.getElementById('proxyStatusDot');
    const text = document.getElementById('proxyStatusText');
    if (!dot || !text) return;

    const statusMap = {
      none: { cls: 'status-offline', label: 'Direct (no proxy)' },
      node: { cls: 'status-loading', label: 'Node.js proxy (port 8321)' },
      searxng: { cls: 'status-loading', label: 'SearXNG' },
      custom: { cls: 'status-loading', label: 'Custom proxy' },
    };

    const status = statusMap[mode] || statusMap.none;
    dot.className = `status-dot ${status.cls}`;
    text.textContent = status.label;
  }

  return { init, loadState };
})();

window.ToolsConfigPanel = ToolsConfigPanel;