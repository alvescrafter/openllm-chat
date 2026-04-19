/**
 * OpenLLM Chat — Ollama Provider
 * Handles Ollama local API (OpenAI-compatible endpoint).
 */

const OllamaProvider = (() => {
  const DEFAULT_BASE_URL = 'http://localhost:11434';

  async function chat(params) {
    // Use OpenAI-compatible endpoint
    const openaiParams = {
      ...params,
      providerId: 'ollama',
      baseUrl: params.baseUrl || DEFAULT_BASE_URL + '/v1',
      apiKey: params.apiKey || 'ollama',
    };
    return OpenAIProvider.chat(openaiParams);
  }

  async function* chatStream(params) {
    const openaiParams = {
      ...params,
      providerId: 'ollama',
      baseUrl: params.baseUrl || DEFAULT_BASE_URL + '/v1',
      apiKey: params.apiKey || 'ollama',
    };
    yield* OpenAIProvider.chatStream(openaiParams);
  }

  async function testConnection(apiKey, baseUrl) {
    const url = baseUrl || DEFAULT_BASE_URL;
    try {
      const response = await fetch(`${url}/api/tags`);
      if (response.ok) return { ok: true, message: 'Ollama is running' };
      return { ok: false, message: `Ollama responded with ${response.status}` };
    } catch (e) {
      return { ok: false, message: `Cannot reach Ollama at ${url}: ${e.message}` };
    }
  }

  async function getModels(apiKey, baseUrl) {
    const url = baseUrl || DEFAULT_BASE_URL;
    try {
      const response = await fetch(`${url}/api/tags`);
      if (!response.ok) return [];
      const data = await response.json();
      return (data.models || []).map(m => m.name).sort();
    } catch (e) {
      console.warn('[Ollama] Failed to fetch models:', e);
      return [];
    }
  }

  function getToolCallFormat() {
    return 'openai'; // Ollama uses OpenAI-compatible format when model supports tools
  }

  return {
    id: 'ollama',
    name: 'Ollama',
    chat,
    chatStream,
    testConnection,
    getModels,
    getToolCallFormat,
  };
})();

window.OllamaProvider = OllamaProvider;