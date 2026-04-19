/**
 * OpenLLM Chat — Google Gemini Provider
 * Handles Google Gemini API from the browser.
 */

const GoogleProvider = (() => {
  const BASE_URL = 'https://generativelanguage.googleapis.com';

  async function chat(params) {
    const { apiKey, baseUrl, model, messages, tools, systemPrompt, temperature, maxTokens } = params;
    const modelName = model || 'gemini-2.0-flash';

    // Convert messages to Gemini format
    const geminiContents = [];
    let systemInstruction = systemPrompt || '';

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemInstruction += (systemInstruction ? '\n\n' : '') + msg.content;
        continue;
      }

      const role = msg.role === 'assistant' ? 'model' : 'user';
      geminiContents.push({
        role,
        parts: [{ text: msg.content }],
      });
    }

    const body = {
      contents: geminiContents,
      generationConfig: {
        temperature: temperature ?? 0.7,
        maxOutputTokens: maxTokens ?? 4096,
      },
    };

    if (systemInstruction) {
      body.systemInstruction = { parts: [{ text: systemInstruction }] };
    }

    if (tools && tools.length > 0) {
      body.tools = [{
        functionDeclarations: tools.map(t => ({
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        })),
      }];
    }

    const url = `${baseUrl || BASE_URL}/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
    const response = await CorsProxy.fetchWithProxy(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: response.statusText } }));
      throw new Error(error.error?.message || `Gemini API error: ${response.status}`);
    }

    return await response.json();
  }

  async function* chatStream(params) {
    const { apiKey, baseUrl, model, messages, tools, systemPrompt, temperature, maxTokens } = params;
    const modelName = model || 'gemini-2.0-flash';

    const geminiContents = [];
    let systemInstruction = systemPrompt || '';

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemInstruction += (systemInstruction ? '\n\n' : '') + msg.content;
        continue;
      }

      const role = msg.role === 'assistant' ? 'model' : 'user';
      geminiContents.push({
        role,
        parts: [{ text: msg.content }],
      });
    }

    const body = {
      contents: geminiContents,
      generationConfig: {
        temperature: temperature ?? 0.7,
        maxOutputTokens: maxTokens ?? 4096,
      },
    };

    if (systemInstruction) {
      body.systemInstruction = { parts: [{ text: systemInstruction }] };
    }

    if (tools && tools.length > 0) {
      body.tools = [{
        functionDeclarations: tools.map(t => ({
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        })),
      }];
    }

    const url = `${baseUrl || BASE_URL}/v1beta/models/${modelName}:streamGenerateContent?alt=sse&key=${apiKey}`;
    const response = await CorsProxy.fetchWithProxy(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: response.statusText } }));
      throw new Error(error.error?.message || `Gemini API error: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

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
          if (data === '[DONE]') return;

          try {
            const parsed = JSON.parse(data);
            const candidate = parsed.candidates?.[0];
            if (!candidate) continue;

            const parts = candidate.content?.parts || [];

            for (const part of parts) {
              if (part.text) {
                yield { type: 'text', content: part.text };
              }

              if (part.functionCall) {
                yield {
                  type: 'tool_calls',
                  toolCalls: [{
                    id: `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                    name: part.functionCall.name,
                    arguments: JSON.stringify(part.functionCall.args || {}),
                  }],
                };
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

  async function testConnection(apiKey, baseUrl) {
    try {
      const response = await CorsProxy.fetchWithProxy(
        `${baseUrl || BASE_URL}/v1beta/models?key=${apiKey}`,
        { headers: { 'Content-Type': 'application/json' } }
      );
      if (response.ok) return { ok: true, message: 'Connection successful' };
      const error = await response.json().catch(() => ({}));
      return { ok: false, message: error.error?.message || `HTTP ${response.status}` };
    } catch (e) {
      return { ok: false, message: e.message };
    }
  }

  async function getModels(apiKey, baseUrl) {
    try {
      const response = await CorsProxy.fetchWithProxy(
        `${baseUrl || BASE_URL}/v1beta/models?key=${apiKey}`,
        { headers: { 'Content-Type': 'application/json' } }
      );
      if (!response.ok) return [];
      const data = await response.json();
      return (data.models || [])
        .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
        .map(m => m.name.replace('models/', ''))
        .sort();
    } catch (e) {
      console.warn('[Google] Failed to fetch models:', e);
      return [
        'gemini-2.0-flash',
        'gemini-2.0-flash-lite',
        'gemini-1.5-pro',
        'gemini-1.5-flash',
      ];
    }
  }

  function getToolCallFormat() {
    return 'google';
  }

  return {
    id: 'google',
    name: 'Google Gemini',
    chat,
    chatStream,
    testConnection,
    getModels,
    getToolCallFormat,
  };
})();

window.GoogleProvider = GoogleProvider;