/**
 * OpenLLM Chat — Sidebar Controller
 * Handles sidebar toggle, section collapse, conversation list, and theme.
 */

const Sidebar = (() => {
  function init() {
    const sidebar = document.getElementById('sidebar');
    const sidebarClose = document.getElementById('sidebarClose');
    const sidebarToggle = document.getElementById('sidebarToggle');
    const newChatBtn = document.getElementById('newChatBtn');
    const themeToggle = document.getElementById('themeToggle');
    const exportBtn = document.getElementById('exportBtn');
    const importBtn = document.getElementById('importBtn');
    const importFileInput = document.getElementById('importFileInput');
    const renameChatBtn = document.getElementById('renameChatBtn');
    const deleteChatBtn = document.getElementById('deleteChatBtn');

    // Section collapse
    document.querySelectorAll('.section-header').forEach(header => {
      header.addEventListener('click', () => {
        header.classList.toggle('active');
        const content = header.nextElementSibling;
        content.classList.toggle('open');
      });
    });

    // Sidebar toggle
    sidebarClose.addEventListener('click', () => {
      sidebar.classList.add('collapsed');
      AppStore.update({ sidebarOpen: false });
    });

    sidebarToggle.addEventListener('click', () => {
      sidebar.classList.toggle('collapsed');
      AppStore.update({ sidebarOpen: !sidebar.classList.contains('collapsed') });
    });

    // New chat
    newChatBtn.addEventListener('click', () => {
      AppStore.createConversation();
      MessageRenderer.render();
      updateConversationList();
    });

    // Theme toggle
    themeToggle.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme');
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      AppStore.update({ theme: next });
    });

    // Export
    exportBtn.addEventListener('click', exportConversations);

    // Import
    importBtn.addEventListener('click', () => importFileInput.click());
    importFileInput.addEventListener('change', importConversations);

    // Rename chat
    renameChatBtn.addEventListener('click', () => {
      const conv = AppStore.getActiveConversation();
      if (!conv) return;
      const newTitle = prompt('Rename chat:', conv.title);
      if (newTitle && newTitle.trim()) {
        AppStore.renameConversation(conv.id, newTitle.trim());
        updateConversationList();
        updateChatTitle();
      }
    });

    // Delete chat
    deleteChatBtn.addEventListener('click', () => {
      const conv = AppStore.getActiveConversation();
      if (!conv) return;
      if (confirm('Delete this chat?')) {
        AppStore.deleteConversation(conv.id);
        updateConversationList();
        MessageRenderer.render();
        updateChatTitle();
      }
    });

    // Subscribe to state changes
    AppStore.subscribe('conversations', updateConversationList);
    AppStore.subscribe('activeConversationId', () => {
      updateConversationList();
      updateChatTitle();
    });

    // Initial render
    updateConversationList();
    updateChatTitle();

    // Load saved theme
    document.documentElement.setAttribute('data-theme', AppStore.state.theme || 'dark');

    // Open sidebar if it was open
    if (AppStore.state.sidebarOpen !== false) {
      sidebar.classList.remove('collapsed');
    } else {
      sidebar.classList.add('collapsed');
    }
  }

  function updateConversationList() {
    const list = document.getElementById('conversationList');
    if (!list) return;

    const conversations = AppStore.state.conversations;
    const activeId = AppStore.state.activeConversationId;

    list.innerHTML = '';

    if (conversations.length === 0) {
      list.innerHTML = '<div style="padding: 8px 12px; font-size: 12px; color: var(--text-muted);">No conversations yet</div>';
      return;
    }

    for (const conv of conversations) {
      const item = document.createElement('div');
      item.className = `conversation-item ${conv.id === activeId ? 'active' : ''}`;
      item.innerHTML = `
        <span class="conv-title">${escapeHtml(conv.title || 'New Chat')}</span>
        <button class="conv-delete" title="Delete">✕</button>
      `;

      item.addEventListener('click', (e) => {
        if (e.target.classList.contains('conv-delete')) return;
        AppStore.update({ activeConversationId: conv.id });
        MessageRenderer.render();
        updateConversationList();
        updateChatTitle();
      });

      item.querySelector('.conv-delete').addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm('Delete this chat?')) {
          AppStore.deleteConversation(conv.id);
          updateConversationList();
          MessageRenderer.render();
          updateChatTitle();
        }
      });

      list.appendChild(item);
    }
  }

  function updateChatTitle() {
    const titleEl = document.getElementById('chatTitle');
    const badgeEl = document.getElementById('modelBadge');
    const conv = AppStore.getActiveConversation();

    if (titleEl) {
      titleEl.textContent = conv ? conv.title : 'OpenLLM Chat';
    }
    if (badgeEl) {
      const state = AppStore.state;
      badgeEl.textContent = conv ? `${state.provider} / ${state.model || 'No model'}` : 'No model selected';
    }
  }

  function exportConversations() {
    const data = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      conversations: AppStore.state.conversations,
      settings: {
        provider: AppStore.state.provider,
        model: AppStore.state.model,
        systemPrompt: AppStore.state.systemPrompt,
        temperature: AppStore.state.temperature,
        maxTokens: AppStore.state.maxTokens,
      },
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `openllm-chat-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importConversations(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (data.conversations) {
          AppStore.update({ conversations: [...data.conversations, ...AppStore.state.conversations] });
          updateConversationList();
          ChatManager.showToast(`Imported ${data.conversations.length} conversations`, 'success');
        }
      } catch (error) {
        ChatManager.showToast('Failed to import: invalid JSON file', 'error');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  }

  function escapeHtml(text) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return String(text).replace(/[&<>"']/g, c => map[c]);
  }

  return { init, updateConversationList, updateChatTitle };
})();

window.Sidebar = Sidebar;