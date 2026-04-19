/**
 * OpenLLM Chat — Chat Manager
 * Manages conversations, message sending, and the chat loop.
 */

const ChatManager = (() => {
  let isGenerating = false;
  let abortController = null;

  /**
   * Send a user message and get an AI response.
   * @param {string} content - The user's message
   * @param {Array} files - Optional attached files
   */
  async function sendMessage(content, files = []) {
    if (isGenerating) return;

    const state = AppStore.state;
    let conv = AppStore.getActiveConversation();

    // Create conversation if none exists
    if (!conv) {
      conv = AppStore.createConversation(content.slice(0, 50));
      conv = AppStore.getActiveConversation();
    }

    // Auto-rename if first message
    if (conv.messages.length === 0 && conv.title === 'New Chat') {
      const title = content.slice(0, 50) + (content.length > 50 ? '...' : '');
      AppStore.renameConversation(conv.id, title);
    }

    // Add user message
    AppStore.addMessage(conv.id, {
      role: 'user',
      content,
    });

    // Add empty assistant message (will be filled during streaming)
    AppStore.addMessage(conv.id, {
      role: 'assistant',
      content: '',
    });

    // Start generating
    isGenerating = true;
    AppStore.update({ isGenerating: true });
    abortController = new AbortController();

    try {
      // Build messages array for the API
      const messages = buildMessages(conv.id);

      // Determine which tools are enabled
      const enabledTools = [];
      if (conv.ddgEnabled !== false && state.ddgEnabled) {
        enabledTools.push('web_search');
      }
      if (conv.visitWebsiteEnabled !== false && state.visitWebsiteEnabled) {
        enabledTools.push('visit_website');
      }

      // Get tool definitions
      const tools = enabledTools.map(name => TOOL_DEFINITIONS[name]).filter(Boolean);

      // Determine tool call format
      const toolFormat = ProviderRegistry.getEffectiveToolFormat(
        state.provider,
        state.toolCallFormat
      );

      // Build tool definitions for the API
      let apiTools = undefined;
      let systemPrompt = state.systemPrompt || '';

      if (tools.length > 0 && toolFormat !== 'none') {
        if (toolFormat === 'prompt') {
          // Tier 2: Inject tool instructions into system prompt
          systemPrompt += ToolCallParser.buildPromptInjection(tools);
          apiTools = undefined;
        } else {
          // Tier 1: Use native tool calling
          apiTools = ToolCallParser.buildToolDefinitions(tools, toolFormat);
        }
      }

      // Stream the response
      const params = {
        providerId: state.provider,
        apiKey: state.apiKey,
        baseUrl: state.baseUrl,
        model: state.model,
        messages,
        tools: apiTools,
        systemPrompt,
        temperature: state.temperature,
        maxTokens: state.maxTokens,
      };

      let fullText = '';
      const onToken = (token) => {
        fullText += token;
        AppStore.updateLastAssistantMessage(conv.id, fullText);
        // Trigger UI update
        renderMessages();
      };

      const onToolCallStart = (toolCall) => {
        // Add tool call indicator to the message
        addToolCallIndicator(conv.id, toolCall);
        renderMessages();
      };

      const onToolResult = (toolCall) => {
        // Update tool call indicator with result
        updateToolCallResult(conv.id, toolCall);
        renderMessages();
      };

      if (tools.length > 0 && toolFormat !== 'none') {
        // Use the full agent loop with tool calling
        const result = await StreamingHandler.streamWithTools(params, {
          onToken,
          onToolCallStart,
          onToolResult,
          maxIterations: 5,
        });
        fullText = result.content;
      } else {
        // Simple streaming without tools
        fullText = await StreamingHandler.streamSimple(params, { onToken });
      }

      // Final update
      AppStore.updateLastAssistantMessage(conv.id, fullText);
      renderMessages();

      // Auto-TTS if enabled
      if (state.ttsAutoRead && state.ttsEnabled) {
        speakText(fullText);
      }

    } catch (error) {
      console.error('[ChatManager] Error:', error);
      const conv = AppStore.getActiveConversation();
      if (conv) {
        AppStore.updateLastAssistantMessage(conv.id, `❌ Error: ${error.message}`);
        renderMessages();
      }
      showToast(`Error: ${error.message}`, 'error');
    } finally {
      isGenerating = false;
      abortController = null;
      AppStore.update({ isGenerating: false });
    }
  }

  /**
   * Build the messages array for the API from conversation history.
   */
  function buildMessages(conversationId) {
    const conv = AppStore.state.conversations.find(c => c.id === conversationId);
    if (!conv) return [];

    return conv.messages
      .filter(m => m.role === 'user' || m.role === 'assistant' || m.role === 'system')
      .map(m => ({
        role: m.role,
        content: m.content,
      }));
  }

  /**
   * Stop the current generation.
   */
  function stopGeneration() {
    if (abortController) {
      abortController.abort();
      abortController = null;
    }
    isGenerating = false;
    AppStore.update({ isGenerating: false });
  }

  /**
   * Add a tool call indicator to the current assistant message.
   */
  function addToolCallIndicator(conversationId, toolCall) {
    const conv = AppStore.state.conversations.find(c => c.id === conversationId);
    if (!conv || conv.messages.length === 0) return;

    const lastMsg = conv.messages[conv.messages.length - 1];
    if (!lastMsg.toolCalls) lastMsg.toolCalls = [];

    lastMsg.toolCalls.push({
      id: toolCall.id,
      name: toolCall.name,
      arguments: toolCall.arguments,
      status: 'running',
      result: null,
    });

    AppStore.update({ conversations: [...AppStore.state.conversations] });
  }

  /**
   * Update a tool call result.
   */
  function updateToolCallResult(conversationId, toolCall) {
    const conv = AppStore.state.conversations.find(c => c.id === conversationId);
    if (!conv || conv.messages.length === 0) return;

    const lastMsg = conv.messages[conv.messages.length - 1];
    if (!lastMsg.toolCalls) return;

    const tc = lastMsg.toolCalls.find(t => t.id === toolCall.id);
    if (tc) {
      tc.status = toolCall.status;
      tc.result = toolCall.result;
    }

    AppStore.update({ conversations: [...AppStore.state.conversations] });
  }

  /**
   * Speak text using TTS.
   */
  async function speakText(text) {
    if (!window.KokoroEngine) return;
    try {
      // Strip code blocks for TTS
      const cleanText = text.replace(/```[\s\S]*?```/g, '[code block]');
      await window.KokoroEngine.speak(cleanText);
    } catch (e) {
      console.warn('[ChatManager] TTS error:', e);
    }
  }

  /**
   * Show a toast notification.
   */
  function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer') || createToastContainer();
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  }

  function createToastContainer() {
    const container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    document.body.appendChild(container);
    return container;
  }

  /**
   * Trigger message rendering (called by ChatManager, delegates to MessageRenderer).
   */
  function renderMessages() {
    if (window.MessageRenderer) {
      window.MessageRenderer.render();
    }
  }

  return {
    sendMessage,
    stopGeneration,
    isGenerating: () => isGenerating,
    showToast,
  };
})();

window.ChatManager = ChatManager;