/**
 * OpenLLM Chat — LLM Configuration Panel
 * Handles provider selection, API key, model selection, etc.
 */

const LLMConfigPanel = (() => {
  const providerDefaults = {
    openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o' },
    anthropic: { baseUrl: 'https://api.anthropic.com', model: 'claude-sonnet-4-20250514' },
    google: { baseUrl: 'https://generativelanguage.googleapis.com', model: 'gemini-2.0-flash' },
    ollama: { baseUrl: 'http://localhost:11434', model: 'llama3.2' },
    lmstudio: { baseUrl: 'http://localhost:1234', model: 'default' },
    groq: { baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile' },
    mistral: { baseUrl: 'https://api.mistral.ai/v1', model: 'mistral-large-latest' },
    custom: { baseUrl: '', model: '' },
  };

  function init() {
    const providerSelect = document.getElementById('providerSelect');
    const baseUrlInput = document.getElementById('baseUrlInput');
    const apiKeyInput = document.getElementById('apiKeyInput');
    const modelSelect = document.getElementById('modelSelect');
    const toolCallFormat = document.getElementById('toolCallFormat');
    const systemPromptInput = document.getElementById('systemPromptInput');
    const temperatureSlider = document.getElementById('temperatureSlider');
    const tempValue = document.getElementById('tempValue');
    const maxTokensInput = document.getElementById('maxTokensInput');
    const testConnectionBtn = document.getElementById('testConnectionBtn');
    const saveConfigBtn = document.getElementById('saveConfigBtn');
    const refreshModelsBtn = document.getElementById('refreshModelsBtn');
    const toggleKeyVis = document.getElementById('toggleKeyVis');
    const connectionStatus = document.getElementById('connectionStatus');

    // Load saved state
    loadState();

    // Provider change
    providerSelect.addEventListener('change', () => {
      const provider = providerSelect.value;
      const defaults = providerDefaults[provider] || providerDefaults.custom;
      baseUrlInput.value = defaults.baseUrl;
      modelSelect.value = defaults.model;
      AppStore.update({ provider, baseUrl: defaults.baseUrl, model: defaults.model });
      loadModels();
    });

    // API key visibility toggle
    toggleKeyVis.addEventListener('click', () => {
      apiKeyInput.type = apiKeyInput.type === 'password' ? 'text' : 'password';
      toggleKeyVis.textContent = apiKeyInput.type === 'password' ? '👁' : '🔒';
    });

    // Temperature slider
    temperatureSlider.addEventListener('input', () => {
      tempValue.textContent = temperatureSlider.value;
      AppStore.update({ temperature: parseFloat(temperatureSlider.value) });
    });

    // Model refresh
    refreshModelsBtn.addEventListener('click', loadModels);

    // Test connection
    testConnectionBtn.addEventListener('click', async () => {
      testConnectionBtn.disabled = true;
      testConnectionBtn.textContent = 'Testing...';
      connectionStatus.className = 'connection-status';
      connectionStatus.textContent = 'Testing connection...';

      try {
        const result = await ProviderRegistry.testConnection(
          providerSelect.value,
          apiKeyInput.value,
          baseUrlInput.value
        );
        connectionStatus.className = `connection-status ${result.ok ? 'success' : 'error'}`;
        connectionStatus.textContent = result.message;
      } catch (error) {
        connectionStatus.className = 'connection-status error';
        connectionStatus.textContent = `Error: ${error.message}`;
      } finally {
        testConnectionBtn.disabled = false;
        testConnectionBtn.textContent = 'Test Connection';
      }
    });

    // Save config
    saveConfigBtn.addEventListener('click', () => {
      AppStore.update({
        provider: providerSelect.value,
        apiKey: apiKeyInput.value,
        baseUrl: baseUrlInput.value,
        model: modelSelect.value,
        toolCallFormat: toolCallFormat.value,
        systemPrompt: systemPromptInput.value,
        temperature: parseFloat(temperatureSlider.value),
        maxTokens: parseInt(maxTokensInput.value) || 4096,
      });
      ChatManager.showToast('Configuration saved', 'success');
    });

    // Auto-save on input changes
    baseUrlInput.addEventListener('change', () => AppStore.update({ baseUrl: baseUrlInput.value }));
    apiKeyInput.addEventListener('change', () => AppStore.update({ apiKey: apiKeyInput.value }));
    modelSelect.addEventListener('change', () => AppStore.update({ model: modelSelect.value }));
    toolCallFormat.addEventListener('change', () => AppStore.update({ toolCallFormat: toolCallFormat.value }));
    systemPromptInput.addEventListener('change', () => AppStore.update({ systemPrompt: systemPromptInput.value }));
    maxTokensInput.addEventListener('change', () => AppStore.update({ maxTokens: parseInt(maxTokensInput.value) || 4096 }));
  }

  async function loadModels() {
    const provider = document.getElementById('providerSelect').value;
    const apiKey = document.getElementById('apiKeyInput').value;
    const baseUrl = document.getElementById('baseUrlInput').value;
    const modelSelect = document.getElementById('modelSelect');

    modelSelect.innerHTML = '<option value="">Loading models...</option>';

    try {
      const models = await ProviderRegistry.getModels(provider, apiKey, baseUrl);
      modelSelect.innerHTML = '';

      if (models.length === 0) {
        modelSelect.innerHTML = '<option value="">No models found (enter manually)</option>';
        // Add a text input option
        const currentModel = AppStore.state.model;
        if (currentModel) {
          const opt = document.createElement('option');
          opt.value = currentModel;
          opt.textContent = currentModel;
          modelSelect.appendChild(opt);
        }
      } else {
        for (const model of models) {
          const opt = document.createElement('option');
          opt.value = model;
          opt.textContent = model;
          modelSelect.appendChild(opt);
        }
        modelSelect.value = AppStore.state.model || models[0];
      }
    } catch (error) {
      modelSelect.innerHTML = '<option value="">Failed to load models</option>';
      console.warn('[LLMConfigPanel] Failed to load models:', error);
    }
  }

  function loadState() {
    const state = AppStore.state;
    document.getElementById('providerSelect').value = state.provider || 'openai';
    document.getElementById('baseUrlInput').value = state.baseUrl || providerDefaults.openai.baseUrl;
    document.getElementById('apiKeyInput').value = state.apiKey || '';
    document.getElementById('toolCallFormat').value = state.toolCallFormat || 'auto';
    document.getElementById('systemPromptInput').value = state.systemPrompt || 'You are a helpful assistant.';
    document.getElementById('temperatureSlider').value = state.temperature || 0.7;
    document.getElementById('tempValue').textContent = state.temperature || 0.7;
    document.getElementById('maxTokensInput').value = state.maxTokens || 4096;

    // Set model — add current model as option if not in list
    const modelSelect = document.getElementById('modelSelect');
    const currentModel = state.model || providerDefaults[state.provider]?.model || '';
    if (currentModel) {
      const existingOption = Array.from(modelSelect.options).find(o => o.value === currentModel);
      if (!existingOption) {
        const opt = document.createElement('option');
        opt.value = currentModel;
        opt.textContent = currentModel;
        modelSelect.appendChild(opt);
      }
      modelSelect.value = currentModel;
    }
  }

  return { init, loadModels, loadState };
})();

window.LLMConfigPanel = LLMConfigPanel;