/**
 * OpenLLM Chat — LM Studio Provider
 * Handles LM Studio local API (OpenAI-compatible endpoint).
 */

const LMStudioProvider = (() => {
  const DEFAULT_BASE_URL = 'http://localhost:1234';

  async function chat(params) {
    const openaiParams = {
      ...params,
      providerId: 'lmstudio',
      baseUrl: params.baseUrl || DEFAULT_BASE_URL + '/v1',
      apiKey: params.apiKey || 'lm-studio',
    };
    return OpenAIProvider.chat(openaiParams);
  }

  async function* chatStream(params) {
    const openaiParams = {
      ...params,
      providerId: 'lmstudio',
      baseUrl: params.baseUrl || DEFAULT_BASE_URL + '/v1',
      apiKey: params.apiKey || 'lm-studio',
    };
    yield* OpenAIProvider.chatStream(openaiParams);
  }

  async function testConnection(apiKey, baseUrl) {
    const url = baseUrl || DEFAULT_BASE_URL;
    try {
      const response = await fetch(`${url}/v1/models`);
      if (response.ok) return { ok: true, message: 'LM Studio is running' };
      return { ok: false, message: `LM Studio responded with ${response.status}` };
    } catch (e) {
      return { ok: false, message: `Cannot reach LM Studio at ${url}: ${e.message}` };
    }
  }

  async function getModels(apiKey, baseUrl) {
    const url = baseUrl || DEFAULT_BASE_URL;
    try {
      const response = await fetch(`${url}/v1/models`);
      if (!response.ok) return [];
      const data = await response.json();
      return (data.data || []).map(m => m.id).sort();
    } catch (e) {
      console.warn('[LMStudio] Failed to fetch models:', e);
      return [];
    }
  }

  function getToolCallFormat() {
    return 'openai'; // LM Studio uses OpenAI-compatible format
  }

  return {
    id: 'lmstudio',
    name: 'LM Studio',
    chat,
    chatStream,
    testConnection,
    getModels,
    getToolCallFormat,
  };
})();

window.LMStudioProvider = LMStudioProvider;