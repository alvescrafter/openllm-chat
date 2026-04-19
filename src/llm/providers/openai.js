/**
 * OpenLLM Chat — OpenAI Provider
 * Handles OpenAI and any OpenAI-compatible endpoint (LM Studio, Ollama, Groq, Mistral, custom).
 */

const OpenAIProvider = (() => {
  const PROVIDER_CONFIGS = {
    openai: {
      name: 'OpenAI',
      baseUrl: 'https://api.openai.com/v1',
      defaultModel: 'gpt-4o',
      toolCallFormat: 'openai',
      requiresApiKey: true,
    },
    groq: {
      name: 'Groq',
      baseUrl: 'https://api.groq.com/openai/v1',
      defaultModel: 'llama-3.3-70b-versatile',
      toolCallFormat: 'openai',
      requiresApiKey: true,
    },
    mistral: {
      name: 'Mistral',
      baseUrl: 'https://api.mistral.ai/v1',
      defaultModel: 'mistral-large-latest',
      toolCallFormat: 'openai',
      requiresApiKey: true,
    },
    custom: {
      name: 'Custom OpenAI-compat',
      baseUrl: '',
      defaultModel: '',
      toolCallFormat: 'openai',
      requiresApiKey: false,
    },
  };

  function getConfig(providerId) {
    return PROVIDER_CONFIGS[providerId] || PROVIDER_CONFIGS.custom;
  }

  async function chat(params) {
    const { apiKey, baseUrl, model, messages, tools, systemPrompt, temperature, maxTokens, toolChoice } = params;
    const config = getConfig(params.providerId || 'openai');

    const headers = {
      'Content-Type': 'application/json',
    };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const body = {
      model,
      messages: systemPrompt
        ? [{ role: 'system', content: systemPrompt }, ...messages]
        : messages,
      temperature: temperature ?? 0.7,
      max_tokens: maxTokens ?? 4096,
    };

    if (tools && tools.length > 0) {
      body.tools = tools.map(t => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));
      body.tool_choice = toolChoice || 'auto';
    }

    const url = `${baseUrl || config.baseUrl}/chat/completions`;
    const response = await CorsProxy.fetchWithProxy(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: response.statusText } }));
      throw new Error(error.error?.message || `OpenAI API error: ${response.status}`);
    }

    return await response.json();
  }

  async function* chatStream(params) {
    const { apiKey, baseUrl, model, messages, tools, systemPrompt, temperature, maxTokens, toolChoice } = params;
    const config = getConfig(params.providerId || 'openai');

    const headers = {
      'Content-Type': 'application/json',
    };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const body = {
      model,
      messages: systemPrompt
        ? [{ role: 'system', content: systemPrompt }, ...messages]
        : messages,
      temperature: temperature ?? 0.7,
      max_tokens: maxTokens ?? 4096,
      stream: true,
    };

    if (tools && tools.length > 0) {
      body.tools = tools.map(t => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));
      body.tool_choice = toolChoice || 'auto';
    }

    const url = `${baseUrl || config.baseUrl}/chat/completions`;
    const response = await CorsProxy.fetchWithProxy(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: response.statusText } }));
      throw new Error(error.error?.message || `OpenAI API error: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let toolCallsAccumulator = {};

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          const data = trimmed.slice(6);
          if (data === '[DONE]') return;

          try {
            const parsed = JSON.parse(data);
            const choice = parsed.choices?.[0];
            if (!choice) continue;

            const delta = choice.delta;

            // Text content
            if (delta?.content) {
              yield { type: 'text', content: delta.content };
            }

            // Tool call deltas (OpenAI format)
            if (delta?.tool_calls) {
              for (const tc of delta.tool_calls) {
                const idx = tc.index;
                if (!toolCallsAccumulator[idx]) {
                  toolCallsAccumulator[idx] = {
                    id: tc.id || '',
                    name: tc.function?.name || '',
                    arguments: '',
                  };
                }
                if (tc.id) toolCallsAccumulator[idx].id = tc.id;
                if (tc.function?.name) toolCallsAccumulator[idx].name = tc.function.name;
                if (tc.function?.arguments) toolCallsAccumulator[idx].arguments += tc.function.arguments;
              }
            }

            // Finish reason
            if (choice.finish_reason === 'tool_calls' || choice.finish_reason === 'stop') {
              if (Object.keys(toolCallsAccumulator).length > 0) {
                const toolCalls = Object.values(toolCallsAccumulator).map(tc => ({
                  id: tc.id || `call_${Date.now()}`,
                  name: tc.name,
                  arguments: tc.arguments,
                }));
                yield { type: 'tool_calls', toolCalls };
                toolCallsAccumulator = {};
              }
            }
          } catch (e) {
            // Skip malformed JSON
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async function testConnection(apiKey, baseUrl, model) {
    const config = getConfig('openai');
    try {
      const response = await CorsProxy.fetchWithProxy(`${baseUrl || config.baseUrl}/models`, {
        headers: apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {},
      });
      if (response.ok) return { ok: true, message: 'Connection successful' };
      const error = await response.json().catch(() => ({}));
      return { ok: false, message: error.error?.message || `HTTP ${response.status}` };
    } catch (e) {
      return { ok: false, message: e.message };
    }
  }

  async function getModels(apiKey, baseUrl) {
    const config = getConfig('openai');
    try {
      const response = await CorsProxy.fetchWithProxy(`${baseUrl || config.baseUrl}/models`, {
        headers: apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {},
      });
      if (!response.ok) return [];
      const data = await response.json();
      return (data.data || [])
        .map(m => m.id)
        .sort();
    } catch (e) {
      console.warn('[OpenAI] Failed to fetch models:', e);
      return [];
    }
  }

  function getToolCallFormat() {
    return 'openai';
  }

  return {
    id: 'openai',
    name: 'OpenAI',
    chat,
    chatStream,
    testConnection,
    getModels,
    getToolCallFormat,
    getConfig,
    PROVIDER_CONFIGS,
  };
})();

window.OpenAIProvider = OpenAIProvider;