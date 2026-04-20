/**
 * OpenLLM Chat — Streaming Handler
 * Abstraction over SSE/stream parsing for different providers.
 * Normalizes all streaming responses into a common format.
 */

const StreamingHandler = (() => {
  /**
   * Stream a chat response and collect the full result.
   * Handles the agent loop for tool calling.
   *
   * @param {object} params
   * @param {function} onToken - Called with each text token: (token: string) => void
   * @param {function} onToolCallStart - Called when a tool call begins: (toolCall) => void
   * @param {function} onToolResult - Called when a tool result is available: (toolCall) => void
   * @param {number} maxIterations - Max tool call iterations (default: 5)
   * @returns {Promise<{content: string, toolCalls: array}>}
   */
  async function streamWithTools(params, { onToken, onToolCallStart, onToolResult, maxIterations = 5 } = {}) {
    const messages = [...params.messages];
    let finalContent = '';
    let allToolCalls = [];
    let iteration = 0;

    while (iteration < maxIterations) {
      iteration++;

      const streamParams = {
        ...params,
        messages,
      };

      let textContent = '';
      let toolCalls = [];

      try {
        const stream = ProviderRegistry.chatStream(streamParams);

        for await (const chunk of stream) {
          if (chunk.type === 'text') {
            textContent += chunk.content;
            onToken?.(chunk.content);
          } else if (chunk.type === 'tool_calls') {
            toolCalls = chunk.toolCalls;
          }
        }
      } catch (error) {
        console.error('[StreamingHandler] Stream error:', error);
        // If tool calling caused the error, retry without tools
        if (params.tools && params.tools.length > 0) {
          console.warn('[StreamingHandler] Retrying without tools...');
          const retryParams = { ...streamParams, tools: undefined };
          const retryStream = ProviderRegistry.chatStream(retryParams);
          for await (const chunk of retryStream) {
            if (chunk.type === 'text') {
              textContent += chunk.content;
              onToken?.(chunk.content);
            }
          }
        } else {
          throw error;
        }
      }

      // No tool calls — this is the final answer
      if (toolCalls.length === 0) {
        finalContent = textContent;
        break;
      }

      // Process tool calls
      allToolCalls.push(...toolCalls);

      // Add assistant message with tool calls to conversation
      const providerId = params.providerId || 'openai';
      const toolFormat = ProviderRegistry.getEffectiveToolFormat(providerId, params.toolCallFormat);

      if (toolFormat === 'anthropic') {
        // Anthropic format: assistant message with tool_use content blocks
        const contentBlocks = [];
        if (textContent) {
          contentBlocks.push({ type: 'text', text: textContent });
        }
        for (const tc of toolCalls) {
          let input = {};
          try {
            input = typeof tc.arguments === 'string' ? JSON.parse(tc.arguments) : (tc.arguments || {});
          } catch (e) { /* ignore */ }
          contentBlocks.push({ type: 'tool_use', id: tc.id, name: tc.name, input });
        }
        messages.push({ role: 'assistant', content: contentBlocks });
      } else if (toolFormat === 'google') {
        // Google format: assistant message with functionCall parts
        const parts = [];
        if (textContent) {
          parts.push({ text: textContent });
        }
        for (const tc of toolCalls) {
          let args = {};
          try {
            args = typeof tc.arguments === 'string' ? JSON.parse(tc.arguments) : (tc.arguments || {});
          } catch (e) { /* ignore */ }
          parts.push({ functionCall: { name: tc.name, args } });
        }
        messages.push({ role: 'assistant', parts });
      } else {
        // OpenAI format (default): assistant message with tool_calls
        messages.push({
          role: 'assistant',
          content: textContent || '',
          tool_calls: toolCalls.map(tc => ({
            id: tc.id,
            type: 'function',
            function: {
              name: tc.name,
              arguments: typeof tc.arguments === 'string' ? tc.arguments : JSON.stringify(tc.arguments || {}),
            },
          })),
        });
      }

      // Execute each tool call and add results
      for (const toolCall of toolCalls) {
        onToolCallStart?.(toolCall);

        try {
          const result = await executeToolCall(toolCall);
          toolCall.result = result;
          toolCall.status = 'complete';
        } catch (error) {
          toolCall.result = { error: error.message };
          toolCall.status = 'error';
        }

        onToolResult?.(toolCall);

        // Add tool result to messages in provider-specific format
        const resultContent = typeof toolCall.result === 'string'
          ? toolCall.result
          : JSON.stringify(toolCall.result);

        if (toolFormat === 'anthropic') {
          // Anthropic format: user message with tool_result content blocks
          messages.push({
            role: 'user',
            content: [{
              type: 'tool_result',
              tool_use_id: toolCall.id,
              content: resultContent,
            }],
          });
        } else if (toolFormat === 'google') {
          // Google format: function response part
          let responseObj;
          try {
            responseObj = typeof toolCall.result === 'string' ? JSON.parse(toolCall.result) : toolCall.result;
          } catch (e) {
            responseObj = { result: resultContent };
          }
          messages.push({
            role: 'function',
            parts: [{ functionResponse: { name: toolCall.name, response: responseObj } }],
          });
        } else {
          // OpenAI format (default)
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            name: toolCall.name,
            content: resultContent,
          });
        }
      }
    }

    if (iteration >= maxIterations) {
      finalContent += '\n\n*[Tool call limit reached. Providing best answer with available information.]*';
    }

    return { content: finalContent, toolCalls: allToolCalls };
  }

  /**
   * Execute a single tool call by name.
   */
  async function executeToolCall(toolCall) {
    const toolName = toolCall.name;
    let args = {};

    try {
      args = typeof toolCall.arguments === 'string'
        ? JSON.parse(toolCall.arguments)
        : (toolCall.arguments || {});
    } catch (e) {
      console.warn('[StreamingHandler] Failed to parse tool arguments:', toolCall.arguments);
      return { error: `Failed to parse arguments: ${e.message}` };
    }

    // Route to appropriate tool executor
    if (toolName === 'web_search' || toolName === 'duckduckgo_web_search') {
      return await window.DuckDuckGoSearch.webSearch(args.query, {
        pageSize: args.pageSize || args.max_results,
        safeSearch: args.safeSearch,
      });
    }

    if (toolName === 'image_search' || toolName === 'duckduckgo_image_search') {
      return await window.DuckDuckGoImageSearch.imageSearch(args.query, {
        pageSize: args.pageSize || args.max_results,
      });
    }

    if (toolName === 'visit_website') {
      return await window.WebsiteVisitor.visit(args.url, {
        maxLinks: args.maxLinks,
        maxImages: args.maxImages,
        contentLimit: args.contentLimit,
        findInPage: args.findInPage,
      });
    }

    return { error: `Unknown tool: ${toolName}` };
  }

  /**
   * Stream a simple (no tools) chat response.
   */
  async function streamSimple(params, { onToken } = {}) {
    let fullText = '';
    const stream = ProviderRegistry.chatStream(params);

    for await (const chunk of stream) {
      if (chunk.type === 'text') {
        fullText += chunk.content;
        onToken?.(chunk.content);
      }
    }

    return fullText;
  }

  return {
    streamWithTools,
    streamSimple,
    executeToolCall,
  };
})();

window.StreamingHandler = StreamingHandler;