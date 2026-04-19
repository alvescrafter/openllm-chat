/**
 * OpenLLM Chat — Tool Orchestrator
 * THE KEY: Agent loop engine with 3-tier tool calling strategy.
 */

const ToolOrchestrator = (() => {
  const MAX_ITERATIONS = 5;

  /**
   * Run the agent loop: send message → check for tool calls → execute → loop.
   *
   * @param {object} params - LLM request parameters
   * @param {Array} enabledTools - Array of tool definition objects
   * @param {string} toolFormat - 'openai' | 'anthropic' | 'google' | 'prompt' | 'none'
   * @param {object} callbacks - { onToken, onToolCallStart, onToolResult, onError }
   * @returns {Promise<{content: string, toolCalls: array}>}
   */
  async function run(params, enabledTools, toolFormat, callbacks = {}) {
    const { onToken, onToolCallStart, onToolResult, onError } = callbacks;

    if (toolFormat === 'none' || !enabledTools || enabledTools.length === 0) {
      // No tools — simple streaming
      return await runSimple(params, onToken);
    }

    if (toolFormat === 'prompt') {
      // Tier 2: Prompt-injected tool calling
      return await runWithPromptInjection(params, enabledTools, callbacks);
    }

    // Tier 1: Native tool calling (OpenAI, Anthropic, Google)
    return await runWithNativeTools(params, enabledTools, toolFormat, callbacks);
  }

  /**
   * Simple streaming without tools.
   */
  async function runSimple(params, onToken) {
    let fullText = '';
    const stream = ProviderRegistry.chatStream(params);

    for await (const chunk of stream) {
      if (chunk.type === 'text') {
        fullText += chunk.content;
        onToken?.(chunk.content);
      }
    }

    return { content: fullText, toolCalls: [] };
  }

  /**
   * Tier 1: Native tool calling with agent loop.
   */
  async function runWithNativeTools(params, enabledTools, toolFormat, callbacks) {
    const { onToken, onToolCallStart, onToolResult, onError } = callbacks;
    const messages = [...params.messages];
    let allToolCalls = [];
    let finalContent = '';

    // Build tool definitions for the API
    const apiTools = ToolCallParser.buildToolDefinitions(enabledTools, toolFormat);

    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      let textContent = '';
      let iterationToolCalls = [];

      const streamParams = {
        ...params,
        messages,
        tools: apiTools,
      };

      // For Anthropic, tools go in the request body differently
      if (toolFormat === 'anthropic') {
        streamParams.tools = enabledTools.map(t => ({
          name: t.name,
          description: t.description,
          input_schema: t.parameters,
        }));
      }

      try {
        const stream = ProviderRegistry.chatStream(streamParams);

        for await (const chunk of stream) {
          if (chunk.type === 'text') {
            textContent += chunk.content;
            onToken?.(chunk.content);
          } else if (chunk.type === 'tool_calls') {
            iterationToolCalls = chunk.toolCalls;
          }
        }
      } catch (error) {
        // If tool calling fails, retry without tools
        if (apiTools && iteration === 0) {
          console.warn('[ToolOrchestrator] Tool-enabled request failed, retrying without tools:', error.message);
          return await runSimple({ ...params, messages }, onToken);
        }
        onError?.(error);
        throw error;
      }

      // No tool calls — final answer
      if (iterationToolCalls.length === 0) {
        finalContent = textContent;
        break;
      }

      // Process tool calls
      allToolCalls.push(...iterationToolCalls);

      // Add assistant message with tool calls
      messages.push({
        role: 'assistant',
        content: textContent || '',
        tool_calls: iterationToolCalls,
      });

      // Execute each tool call
      for (const toolCall of iterationToolCalls) {
        onToolCallStart?.(toolCall);

        try {
          const result = await StreamingHandler.executeToolCall(toolCall);
          toolCall.result = result;
          toolCall.status = 'complete';
        } catch (error) {
          toolCall.result = { error: error.message };
          toolCall.status = 'error';
        }

        onToolResult?.(toolCall);

        // Add tool result to messages
        if (toolFormat === 'anthropic') {
          // Anthropic format: tool_result content blocks
          messages.push({
            role: 'user',
            content: [{
              type: 'tool_result',
              tool_use_id: toolCall.id,
              content: typeof toolCall.result === 'string'
                ? toolCall.result
                : JSON.stringify(toolCall.result),
            }],
          });
        } else {
          // OpenAI format: 'tool' role messages
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            name: toolCall.name,
            content: typeof toolCall.result === 'string'
              ? toolCall.result
              : JSON.stringify(toolCall.result),
          });
        }
      }
    }

    if (finalContent === '' && allToolCalls.length > 0) {
      finalContent = '*[Completed tool calls. Generating final response...]*';
    }

    return { content: finalContent, toolCalls: allToolCalls };
  }

  /**
   * Tier 2: Prompt-injected tool calling for semi-capable models.
   */
  async function runWithPromptInjection(params, enabledTools, callbacks) {
    const { onToken, onToolCallStart, onToolResult, onError } = callbacks;
    const messages = [...params.messages];
    let systemPrompt = params.systemPrompt || '';

    // Inject tool instructions into system prompt
    systemPrompt += ToolCallParser.buildPromptInjection(enabledTools);

    let allToolCalls = [];
    let finalContent = '';

    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      let textContent = '';

      const streamParams = {
        ...params,
        messages,
        systemPrompt,
        tools: undefined, // No native tools
      };

      try {
        const stream = ProviderRegistry.chatStream(streamParams);
        for await (const chunk of stream) {
          if (chunk.type === 'text') {
            textContent += chunk.content;
            onToken?.(chunk.content);
          }
        }
      } catch (error) {
        onError?.(error);
        throw error;
      }

      // Parse tool calls from text
      const toolCalls = ToolCallParser.parseFromText(textContent);

      // No tool calls — final answer
      if (toolCalls.length === 0) {
        // Remove any [TOOL_CALL] artifacts from the text
        finalContent = textContent.replace(/\[TOOL_CALL\][\s\S]*?\[\/TOOL_CALL\]/g, '').trim();
        break;
      }

      // Process tool calls
      allToolCalls.push(...toolCalls);

      // Add assistant message (with tool calls stripped for display)
      const displayContent = textContent.replace(/\[TOOL_CALL\][\s\S]*?\[\/TOOL_CALL\]/g, '').trim();
      messages.push({
        role: 'assistant',
        content: displayContent || '[Using tools...]',
      });

      // Execute each tool call
      for (const toolCall of toolCalls) {
        onToolCallStart?.(toolCall);

        try {
          const result = await StreamingHandler.executeToolCall(toolCall);
          toolCall.result = result;
          toolCall.status = 'complete';
        } catch (error) {
          toolCall.result = { error: error.message };
          toolCall.status = 'error';
        }

        onToolResult?.(toolCall);

        // Add tool result as user message
        messages.push({
          role: 'user',
          content: `[TOOL_RESULT]\n${JSON.stringify({ name: toolCall.name, result: toolCall.result }, null, 2)}\n[/TOOL_RESULT]`,
        });
      }
    }

    return { content: finalContent, toolCalls: allToolCalls };
  }

  /**
   * Tier 3: Manual/auto search mode.
   * Prepend search results to the user's message before sending.
   */
  async function prependSearch(query, messages) {
    try {
      const results = await window.DuckDuckGoSearch.webSearch(query);
      if (!results || !results.results || results.results.length === 0) {
        return messages; // No results, proceed normally
      }

      const searchContext = results.results
        .slice(0, 5)
        .map((r, i) => `${i + 1}. [${r.title}](${r.url})\n   ${r.snippet}`)
        .join('\n\n');

      const searchPrefix = `\n\n---\n🔍 Web search results for "${query}":\n\n${searchContext}\n\n---\n`;

      // Prepend to the last user message
      const lastUserIdx = messages.findLastIndex(m => m.role === 'user');
      if (lastUserIdx >= 0) {
        const updatedMessages = [...messages];
        updatedMessages[lastUserIdx] = {
          ...updatedMessages[lastUserIdx],
          content: updatedMessages[lastUserIdx].content + searchPrefix,
        };
        return updatedMessages;
      }

      return messages;
    } catch (error) {
      console.warn('[ToolOrchestrator] Manual search failed:', error);
      return messages;
    }
  }

  return {
    run,
    runSimple,
    runWithNativeTools,
    runWithPromptInjection,
    prependSearch,
  };
})();

window.ToolOrchestrator = ToolOrchestrator;