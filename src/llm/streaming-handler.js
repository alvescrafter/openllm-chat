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
      messages.push({
        role: 'assistant',
        content: textContent || '',
        tool_calls: toolCalls,
      });

      // Execute each tool call
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

        // Add tool result to messages (OpenAI format)
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