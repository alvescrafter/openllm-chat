/**
 * OpenLLM Chat — Message Renderer
 * Renders conversation messages into the DOM with markdown, code blocks, and tool indicators.
 */

const MessageRenderer = (() => {
  let lastRenderedConversationId = null;
  let lastRenderedMessageCount = 0;

  /**
   * Render all messages for the active conversation.
   */
  function render() {
    const conv = AppStore.getActiveConversation();
    const container = document.getElementById('messagesContainer');
    const welcome = document.getElementById('welcomeScreen');

    if (!conv || conv.messages.length === 0) {
      container.style.display = 'none';
      welcome.style.display = 'flex';
      return;
    }

    welcome.style.display = 'none';
    container.style.display = 'block';

    // Only re-render if conversation or message count changed
    const convId = conv.id;
    const msgCount = conv.messages.length;

    if (convId === lastRenderedConversationId && msgCount === lastRenderedMessageCount) {
      // Just update the last message (streaming)
      updateLastMessage(conv);
      return;
    }

    lastRenderedConversationId = convId;
    lastRenderedMessageCount = msgCount;

    // Full re-render
    container.innerHTML = '';

    for (const msg of conv.messages) {
      const el = createMessageElement(msg);
      container.appendChild(el);
    }

    // Scroll to bottom
    scrollToBottom();
  }

  /**
   * Update only the last message (for streaming).
   */
  function updateLastMessage(conv) {
    const container = document.getElementById('messagesContainer');
    if (!conv || conv.messages.length === 0) return;

    const lastMsg = conv.messages[conv.messages.length - 1];
    let lastEl = container.lastElementChild;

    if (!lastEl || lastEl.dataset.messageId !== lastMsg.id) {
      // Need to add a new element
      const el = createMessageElement(lastMsg);
      container.appendChild(el);
      scrollToBottom();
      return;
    }

    // Update existing element
    const bodyEl = lastEl.querySelector('.message-body');
    if (bodyEl) {
      bodyEl.innerHTML = MarkdownParser.parse(lastMsg.content);
      // Re-attach code action buttons
      attachCodeActions(bodyEl);
    }

    // Update tool call indicators
    if (lastMsg.toolCalls && lastMsg.toolCalls.length > 0) {
      renderToolCallIndicators(lastEl, lastMsg.toolCalls);
    }

    scrollToBottom();
  }

  /**
   * Create a message DOM element.
   */
  function createMessageElement(msg) {
    const div = document.createElement('div');
    div.className = `message ${msg.role}`;
    div.dataset.messageId = msg.id || '';

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = msg.role === 'user' ? '🧑' : '🤖';

    const content = document.createElement('div');
    content.className = 'message-content';

    const header = document.createElement('div');
    header.className = 'message-header';

    const sender = document.createElement('span');
    sender.className = 'message-sender';
    sender.textContent = msg.role === 'user' ? 'You' : 'Assistant';

    const time = document.createElement('span');
    time.className = 'message-time';
    time.textContent = formatTime(msg.timestamp);

    header.appendChild(sender);
    header.appendChild(time);

    const body = document.createElement('div');
    body.className = 'message-body';

    if (msg.role === 'user') {
      body.textContent = msg.content;
    } else {
      body.innerHTML = MarkdownParser.parse(msg.content || '');
      attachCodeActions(body);

      // Add HTML detected card if applicable
      const codeBlocks = MarkdownParser.extractCodeBlocks(msg.content || '');
      const htmlBlocks = codeBlocks.filter(b => MarkdownParser.isPreviewableLang(b.language));
      if (htmlBlocks.length > 0) {
        for (const block of htmlBlocks) {
          if (block.language.toLowerCase() === 'html' || block.language.toLowerCase() === 'htm') {
            const card = createHtmlDetectedCard(block.code);
            body.appendChild(card);
          }
        }
      }
    }

    content.appendChild(header);
    content.appendChild(body);

    // Tool call indicators
    if (msg.toolCalls && msg.toolCalls.length > 0) {
      renderToolCallIndicators(content, msg.toolCalls);
    }

    // Message actions
    const actions = document.createElement('div');
    actions.className = 'message-actions';

    // Copy button
    const copyBtn = document.createElement('button');
    copyBtn.className = 'message-action-btn';
    copyBtn.innerHTML = '📋 Copy';
    copyBtn.onclick = () => {
      navigator.clipboard.writeText(msg.content || '');
      copyBtn.innerHTML = '✅ Copied';
      setTimeout(() => copyBtn.innerHTML = '📋 Copy', 2000);
    };
    actions.appendChild(copyBtn);

    // TTS button (only for assistant messages)
    if (msg.role === 'assistant' && window.KokoroEngine) {
      const ttsBtn = document.createElement('button');
      ttsBtn.className = 'message-action-btn';
      ttsBtn.innerHTML = '🔊 Read';
      ttsBtn.onclick = () => {
        const cleanText = (msg.content || '').replace(/```[\s\S]*?```/g, '[code block]');
        window.KokoroEngine.speak(cleanText);
        ttsBtn.innerHTML = '🔊 Reading...';
        ttsBtn.disabled = true;
        setTimeout(() => {
          ttsBtn.innerHTML = '🔊 Read';
          ttsBtn.disabled = false;
        }, 5000);
      };
      actions.appendChild(ttsBtn);
    }

    content.appendChild(actions);

    div.appendChild(avatar);
    div.appendChild(content);

    return div;
  }

  /**
   * Render tool call indicators within a message.
   */
  function renderToolCallIndicators(container, toolCalls) {
    // Remove existing indicators
    const existing = container.querySelectorAll('.tool-call-indicator');
    existing.forEach(el => el.remove());

    for (const tc of toolCalls) {
      const indicator = document.createElement('div');
      indicator.className = 'tool-call-indicator';

      const isSearch = tc.name.includes('search') || tc.name.includes('duckduckgo');
      const isVisit = tc.name.includes('visit') || tc.name.includes('website');
      const icon = isSearch ? '🔍' : isVisit ? '🌐' : '🔧';
      const label = isSearch ? 'Searching...' : isVisit ? 'Visiting website...' : `Running ${tc.name}...`;

      let args = {};
      try { args = typeof tc.arguments === 'string' ? JSON.parse(tc.arguments) : tc.arguments; } catch {}

      indicator.innerHTML = `
        <div class="tool-call-header">
          <span class="tool-call-icon">${icon}</span>
          <span class="tool-call-name">${tc.name}</span>
          <span class="tool-call-status">
            ${tc.status === 'running' ? '<span class="spinner"></span> Running' : ''}
            ${tc.status === 'complete' ? '✅ Complete' : ''}
            ${tc.status === 'error' ? '❌ Error' : ''}
          </span>
        </div>
        ${args.query ? `<div class="tool-call-query">${escapeHtml(args.query)}</div>` : ''}
        ${args.url ? `<div class="tool-call-query">${escapeHtml(args.url)}</div>` : ''}
      `;

      // Show result if complete
      if (tc.status === 'complete' && tc.result) {
        const resultCard = createToolResultCard(tc);
        indicator.appendChild(resultCard);
      }

      if (tc.status === 'error' && tc.result) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'tool-error';
        errorDiv.innerHTML = `<span class="error-icon">⚠️</span> ${escapeHtml(tc.result.error || 'Unknown error')}`;
        indicator.appendChild(errorDiv);
      }

      container.appendChild(indicator);
    }
  }

  /**
   * Create a tool result card.
   */
  function createToolResultCard(toolCall) {
    const card = document.createElement('div');
    card.className = 'tool-result-card';

    const result = toolCall.result;
    const isSearch = toolCall.name.includes('search');
    const isVisit = toolCall.name.includes('visit');

    let headerText = 'Result';
    let resultCount = '';

    if (isSearch && result.results) {
      headerText = 'Search Results';
      resultCount = `${result.results.length} results`;
    } else if (isVisit && result.title) {
      headerText = result.title;
      resultCount = `${(result.content || '').length} chars`;
    }

    card.innerHTML = `
      <div class="tool-result-header" onclick="this.parentElement.querySelector('.tool-result-body').classList.toggle('expanded'); this.classList.toggle('expanded');">
        <span class="result-icon">${isSearch ? '🔍' : isVisit ? '🌐' : '📋'}</span>
        <span class="result-title">${escapeHtml(headerText)}</span>
        ${resultCount ? `<span class="result-count">${resultCount}</span>` : ''}
        <span class="result-chevron">▼</span>
      </div>
      <div class="tool-result-body">
        <div class="tool-result-content">${formatToolResult(result, toolCall.name)}</div>
      </div>
    `;

    return card;
  }

  /**
   * Format tool result for display.
   */
  function formatToolResult(result, toolName) {
    if (typeof result === 'string') {
      try { result = JSON.parse(result); } catch { return escapeHtml(result); }
    }

    if (toolName.includes('search') && result.results) {
      return result.results.map((r, i) => `
        <div class="search-result-item">
          <a class="search-result-title" href="${escapeHtml(r.url)}" target="_blank" rel="noopener">${escapeHtml(r.title)}</a>
          <div class="search-result-url">${escapeHtml(r.url)}</div>
          ${r.snippet ? `<div class="search-result-snippet">${escapeHtml(r.snippet)}</div>` : ''}
        </div>
      `).join('');
    }

    if (toolName.includes('visit')) {
      let html = '';
      if (result.title) html += `<div class="visit-result-title">${escapeHtml(result.title)}</div>`;
      if (result.h1) html += `<div class="visit-result-title" style="font-size:14px">${escapeHtml(result.h1)}</div>`;
      if (result.content) html += `<div class="visit-result-content">${escapeHtml(result.content.slice(0, 500))}${result.content.length > 500 ? '...' : ''}</div>`;
      if (result.links && result.links.length > 0) {
        html += `<div class="visit-result-links">`;
        for (const [label, url] of result.links.slice(0, 5)) {
          html += `<a class="visit-result-link" href="${escapeHtml(url)}" target="_blank" rel="noopener">🔗 ${escapeHtml(label || url)}</a>`;
        }
        html += `</div>`;
      }
      return html;
    }

    return `<pre>${escapeHtml(JSON.stringify(result, null, 2).slice(0, 1000))}</pre>`;
  }

  /**
   * Create an "HTML detected" card.
   */
  function createHtmlDetectedCard(code) {
    const card = document.createElement('div');
    card.className = 'html-detected-card';
    card.innerHTML = `
      <span class="card-icon">🖥️</span>
      <span class="card-text">HTML detected</span>
      <span class="card-link">Open in Preview Window →</span>
    `;
    card.onclick = () => {
      if (window.PreviewWindow) {
        window.PreviewWindow.open(code, 'html');
      }
    };
    return card;
  }

  /**
   * Attach copy and preview buttons to code blocks.
   */
  function attachCodeActions(container) {
    const codeBlocks = container.querySelectorAll('.code-block');
    codeBlocks.forEach(block => {
      // Copy button
      const copyBtn = block.querySelector('.copy-btn');
      if (copyBtn && !copyBtn.dataset.attached) {
        copyBtn.dataset.attached = 'true';
        copyBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const code = decodeURIComponent(block.dataset.rawCode || '');
          navigator.clipboard.writeText(code).then(() => {
            copyBtn.classList.add('copied');
            copyBtn.textContent = '✅ Copied';
            setTimeout(() => {
              copyBtn.classList.remove('copied');
              copyBtn.textContent = '📋 Copy';
            }, 2000);
          });
        });
      }

      // Preview button
      const previewBtn = block.querySelector('.preview-btn');
      if (previewBtn && !previewBtn.dataset.attached) {
        previewBtn.dataset.attached = 'true';
        previewBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const code = decodeURIComponent(block.dataset.rawCode || '');
          const lang = block.dataset.lang || 'html';
          if (window.PreviewWindow) {
            window.PreviewWindow.open(code, lang);
          }
        });
      }
    });
  }

  function formatTime(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function escapeHtml(text) {
    if (!text) return '';
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return String(text).replace(/[&<>"']/g, c => map[c]);
  }

  function scrollToBottom() {
    const area = document.getElementById('messagesArea');
    if (area) {
      requestAnimationFrame(() => {
        area.scrollTop = area.scrollHeight;
      });
    }
  }

  return {
    render,
    updateLastMessage,
    createMessageElement,
    scrollToBottom,
  };
})();

window.MessageRenderer = MessageRenderer;