/**
 * OpenLLM Chat — Anthropic Provider
 * Handles Anthropic Claude API with direct browser access.
 */

const AnthropicProvider = (() => {
  const BASE_URL = 'https://api.anthropic.com';
  const API_VERSION = '2023-06-01';

  async function chat(params) {
    const { apiKey, baseUrl, model, messages, tools, systemPrompt, temperature, maxTokens, toolChoice } = params;

    const headers = {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': API_VERSION,
      'anthropic-dangerous-direct-browser-access': 'true',
    };

    // Separate system message
    let systemContent = systemPrompt || '';
    const filteredMessages = messages.filter(m => {
      if (m.role === 'system') {
        systemContent += (systemContent ? '\n\n' : '') + m.content;
        return false;
      }
      return true;
    });

    const body = {
      model: model || 'claude-sonnet-4-20250514',
      max_tokens: maxTokens ?? 4096,
      temperature: temperature ?? 0.7,
      messages: filteredMessages,
    };

    if (systemContent) {
      body.system = systemContent;
    }

    if (tools && tools.length > 0) {
      body.tools = tools.map(t => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
      }));
    }

    const url = `${baseUrl || BASE_URL}/v1/messages`;
    const response = await CorsProxy.fetchWithProxy(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: response.statusText } }));
      throw new Error(error.error?.message || `Anthropic API error: ${response.status}`);
    }

    return await response.json();
  }

  async function* chatStream(params) {
    const { apiKey, baseUrl, model, messages, tools, systemPrompt, temperature, maxTokens } = params;

    const headers = {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': API_VERSION,
      'anthropic-dangerous-direct-browser-access': 'true',
    };

    let systemContent = systemPrompt || '';
    const filteredMessages = messages.filter(m => {
      if (m.role === 'system') {
        systemContent += (systemContent ? '\n\n' : '') + m.content;
        return false;
      }
      return true;
    });

    const body = {
      model: model || 'claude-sonnet-4-20250514',
      max_tokens: maxTokens ?? 4096,
      temperature: temperature ?? 0.7,
      messages: filteredMessages,
      stream: true,
    };

    if (systemContent) {
      body.system = systemContent;
    }

    if (tools && tools.length > 0) {
      body.tools = tools.map(t => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
      }));
    }

    const url = `${baseUrl || BASE_URL}/v1/messages`;
    const response = await CorsProxy.fetchWithProxy(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: response.statusText } }));
      throw new Error(error.error?.message || `Anthropic API error: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let currentToolCall = null;
    let toolCalls = [];

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;
          const data = trimmed.slice(6);

          try {
            const event = JSON.parse(data);

            switch (event.type) {
              case 'content_block_start':
                if (event.content_block?.type === 'text') {
                  // Text block starting
                } else if (event.content_block?.type === 'tool_use') {
                  currentToolCall = {
                    id: event.content_block.id,
                    name: event.content_block.name,
                    arguments: '',
                  };
                }
                break;

              case 'content_block_delta':
                if (event.delta?.type === 'text_delta') {
                  yield { type: 'text', content: event.delta.text };
                } else if (event.delta?.type === 'input_json_delta') {
                  if (currentToolCall) {
                    currentToolCall.arguments += event.delta.partial_json;
                  }
                }
                break;

              case 'content_block_stop':
                if (currentToolCall) {
                  toolCalls.push({ ...currentToolCall });
                  currentToolCall = null;
                }
                break;

              case 'message_stop':
                if (toolCalls.length > 0) {
                  yield { type: 'tool_calls', toolCalls };
                  toolCalls = [];
                }
                break;
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

  async function testConnection(apiKey, baseUrl) {
    try {
      const response = await CorsProxy.fetchWithProxy(`${baseUrl || BASE_URL}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': API_VERSION,
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 10,
          messages: [{ role: 'user', content: 'Hi' }],
        }),
      });
      if (response.ok) return { ok: true, message: 'Connection successful' };
      const error = await response.json().catch(() => ({}));
      return { ok: false, message: error.error?.message || `HTTP ${response.status}` };
    } catch (e) {
      return { ok: false, message: e.message };
    }
  }

  async function getModels(apiKey, baseUrl) {
    // Anthropic doesn't have a models list endpoint, return known models
    return [
      'claude-sonnet-4-20250514',
      'claude-opus-4-20250514',
      'claude-3.5-sonnet-20241022',
      'claude-3.5-haiku-20241022',
      'claude-3-opus-20240229',
    ];
  }

  function getToolCallFormat() {
    return 'anthropic';
  }

  return {
    id: 'anthropic',
    name: 'Anthropic',
    chat,
    chatStream,
    testConnection,
    getModels,
    getToolCallFormat,
  };
})();

window.AnthropicProvider = AnthropicProvider;