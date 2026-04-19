/**
 * OpenLLM Chat — Provider Registry
 * Registers all LLM providers and provides a unified interface.
 */

const ProviderRegistry = (() => {
  const providers = {};

  function register(provider) {
    if (!provider || !provider.id) {
      console.error('[ProviderRegistry] Invalid provider:', provider);
      return;
    }
    providers[provider.id] = provider;
    console.log(`[ProviderRegistry] Registered provider: ${provider.id} (${provider.name})`);
  }

  function get(providerId) {
    return providers[providerId] || null;
  }

  function getAll() {
    return Object.values(providers);
  }

  function getAllIds() {
    return Object.keys(providers);
  }

  /**
   * Get the effective tool call format for a provider.
   * Respects user override or auto-detects from provider.
   * @param {string} providerId
   * @param {string} userFormat - 'auto' | 'openai' | 'anthropic' | 'google' | 'prompt' | 'off'
   * @returns {string} 'openai' | 'anthropic' | 'google' | 'prompt' | 'none'
   */
  function getEffectiveToolFormat(providerId, userFormat = 'auto') {
    if (userFormat === 'off') return 'none';

    if (userFormat !== 'auto') return userFormat;

    // Auto-detect from provider
    const provider = get(providerId);
    if (!provider) return 'none';

    return provider.getToolCallFormat();
  }

  /**
   * Get default configuration for a provider.
   */
  function getDefaultConfig(providerId) {
    const configs = {
      openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o', requiresApiKey: true },
      anthropic: { baseUrl: 'https://api.anthropic.com', model: 'claude-sonnet-4-20250514', requiresApiKey: true },
      google: { baseUrl: 'https://generativelanguage.googleapis.com', model: 'gemini-2.0-flash', requiresApiKey: true },
      ollama: { baseUrl: 'http://localhost:11434', model: 'llama3.2', requiresApiKey: false },
      lmstudio: { baseUrl: 'http://localhost:1234', model: 'default', requiresApiKey: false },
      groq: { baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile', requiresApiKey: true },
      mistral: { baseUrl: 'https://api.mistral.ai/v1', model: 'mistral-large-latest', requiresApiKey: true },
      custom: { baseUrl: '', model: '', requiresApiKey: false },
    };
    return configs[providerId] || configs.custom;
  }

  /**
   * Send a chat message using the configured provider.
   * @param {object} params - { providerId, apiKey, baseUrl, model, messages, tools, systemPrompt, temperature, maxTokens }
   * @returns {Promise<object>} Provider response
   */
  async function chat(params) {
    const provider = get(params.providerId);
    if (!provider) throw new Error(`Unknown provider: ${params.providerId}`);
    return provider.chat(params);
  }

  /**
   * Stream a chat response using the configured provider.
   * @param {object} params - Same as chat()
   * @returns {AsyncGenerator} Yields {type, content} or {type, toolCalls}
   */
  async function* chatStream(params) {
    const provider = get(params.providerId);
    if (!provider) throw new Error(`Unknown provider: ${params.providerId}`);
    yield* provider.chatStream(params);
  }

  /**
   * Test connection to a provider.
   */
  async function testConnection(providerId, apiKey, baseUrl) {
    const provider = get(providerId);
    if (!provider) return { ok: false, message: `Unknown provider: ${providerId}` };
    return provider.testConnection(apiKey, baseUrl);
  }

  /**
   * Get available models for a provider.
   */
  async function getModels(providerId, apiKey, baseUrl) {
    const provider = get(providerId);
    if (!provider) return [];
    return provider.getModels(apiKey, baseUrl);
  }

  // ─── Register built-in providers ───
  register(OpenAIProvider);
  register(AnthropicProvider);
  register(GoogleProvider);
  register(OllamaProvider);
  register(LMStudioProvider);

  // Groq and Mistral use OpenAI-compatible API
  // They're handled by OpenAIProvider with different base URLs
  register({
    id: 'groq',
    name: 'Groq',
    chat: (params) => OpenAIProvider.chat({ ...params, providerId: 'groq', baseUrl: params.baseUrl || 'https://api.groq.com/openai/v1' }),
    chatStream: (params) => OpenAIProvider.chatStream({ ...params, providerId: 'groq', baseUrl: params.baseUrl || 'https://api.groq.com/openai/v1' }),
    testConnection: (apiKey, baseUrl) => OpenAIProvider.testConnection(apiKey, baseUrl || 'https://api.groq.com/openai/v1'),
    getModels: (apiKey, baseUrl) => OpenAIProvider.getModels(apiKey, baseUrl || 'https://api.groq.com/openai/v1'),
    getToolCallFormat: () => 'openai',
  });

  register({
    id: 'mistral',
    name: 'Mistral',
    chat: (params) => OpenAIProvider.chat({ ...params, providerId: 'mistral', baseUrl: params.baseUrl || 'https://api.mistral.ai/v1' }),
    chatStream: (params) => OpenAIProvider.chatStream({ ...params, providerId: 'mistral', baseUrl: params.baseUrl || 'https://api.mistral.ai/v1' }),
    testConnection: (apiKey, baseUrl) => OpenAIProvider.testConnection(apiKey, baseUrl || 'https://api.mistral.ai/v1'),
    getModels: (apiKey, baseUrl) => OpenAIProvider.getModels(apiKey, baseUrl || 'https://api.mistral.ai/v1'),
    getToolCallFormat: () => 'openai',
  });

  register({
    id: 'custom',
    name: 'Custom OpenAI-compat',
    chat: (params) => OpenAIProvider.chat({ ...params, providerId: 'custom' }),
    chatStream: (params) => OpenAIProvider.chatStream({ ...params, providerId: 'custom' }),
    testConnection: (apiKey, baseUrl) => {
      if (!baseUrl) return Promise.resolve({ ok: false, message: 'Base URL is required for custom provider' });
      return OpenAIProvider.testConnection(apiKey, baseUrl);
    },
    getModels: (apiKey, baseUrl) => {
      if (!baseUrl) return Promise.resolve([]);
      return OpenAIProvider.getModels(apiKey, baseUrl);
    },
    getToolCallFormat: () => 'openai',
  });

  return {
    register,
    get,
    getAll,
    getAllIds,
    getEffectiveToolFormat,
    getDefaultConfig,
    chat,
    chatStream,
    testConnection,
    getModels,
  };
})();

window.ProviderRegistry = ProviderRegistry;