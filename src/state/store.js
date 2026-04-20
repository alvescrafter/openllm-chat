/**
 * OpenLLM Chat — Central Reactive State Store
 * Proxy-based reactive state with localStorage persistence.
 * Components subscribe to specific keys for updates.
 */

const AppStore = (() => {
  // ─── Default State ───
  const defaultState = {
    // LLM Configuration
    provider: 'openai',
    apiKey: '',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o',
    toolCallFormat: 'auto',
    temperature: 0.7,
    maxTokens: 4096,
    systemPrompt: 'You are a helpful assistant.',

    // Tools
    ddgEnabled: true,
    visitWebsiteEnabled: true,
    ddgConfig: { pageSize: 5, safeSearch: 'moderate' },
    visitConfig: { maxLinks: 20, maxImages: 5, contentLimit: 3000 },
    corsProxy: { mode: 'none', nodePort: 8321, searxngUrl: 'http://localhost:8888', customUrl: '' },

    // TTS
    ttsEnabled: false,
    ttsAutoRead: false,
    ttsAutoReadUser: false,
    ttsVoice: 'af_heart',
    ttsSpeed: 1.0,
    ttsVolume: 0.8,
    ttsModelLoaded: false,
    ttsModelLoading: false,
    ttsBackend: null, // 'webgpu' | 'wasm' | null

    // Chat
    conversations: [],
    activeConversationId: null,
    isGenerating: false,

    // UI
    theme: 'dark',
    sidebarOpen: true,
  };

  // ─── Subscribers ───
  const subscribers = new Map(); // key -> Set<callback>

  // ─── Load persisted state ───
  function loadState() {
    try {
      const saved = localStorage.getItem('openllm-chat-state');
      if (saved) {
        const parsed = JSON.parse(saved);
        return { ...defaultState, ...parsed };
      }
    } catch (e) {
      console.warn('[AppStore] Failed to load state from localStorage:', e);
    }
    return { ...defaultState };
  }

  // ─── Save state to localStorage (debounced) ───
  let saveTimeout = null;
  function saveState() {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      try {
        // Don't persist transient state
        const toSave = { ...state };
        delete toSave.isGenerating;
        delete toSave.ttsModelLoading;
        localStorage.setItem('openllm-chat-state', JSON.stringify(toSave));
      } catch (e) {
        console.warn('[AppStore] Failed to save state to localStorage:', e);
      }
    }, 300);
  }

  // ─── Create reactive proxy ───
  let state = loadState();

  function notify(key) {
    if (subscribers.has(key)) {
      for (const callback of subscribers.get(key)) {
        try {
          callback(state[key], key);
        } catch (e) {
          console.error(`[AppStore] Subscriber error for key "${key}":`, e);
        }
      }
    }
    // Also notify wildcard subscribers
    if (subscribers.has('*')) {
      for (const callback of subscribers.get('*')) {
        try {
          callback(state, key);
        } catch (e) {
          console.error(`[AppStore] Wildcard subscriber error:`, e);
        }
      }
    }
  }

  const handler = {
    set(target, key, value) {
      const oldValue = target[key];

      // Deep compare for objects/arrays
      if (oldValue === value) return true;
      if (typeof oldValue === 'object' && typeof value === 'object' &&
          oldValue !== null && value !== null) {
        if (JSON.stringify(oldValue) === JSON.stringify(value)) return true;
      }

      target[key] = value;
      notify(key);
      saveState();
      return true;
    }
  };

  state = new Proxy(state, handler);

  // ─── Public API ───

  /**
   * Subscribe to changes on a specific key (or '*' for all changes).
   * @param {string} key - State key to watch, or '*' for all
   * @param {function} callback - Called with (newValue, key) or (state, key)
   * @returns {function} Unsubscribe function
   */
  function subscribe(key, callback) {
    if (!subscribers.has(key)) {
      subscribers.set(key, new Set());
    }
    subscribers.get(key).add(callback);

    // Return unsubscribe function
    return () => {
      if (subscribers.has(key)) {
        subscribers.get(key).delete(callback);
      }
    };
  }

  /**
   * Update multiple state keys at once (batch update).
   * Only triggers one save and one notification per changed key.
   * @param {object} updates - Key-value pairs to update
   */
  function update(updates) {
    for (const [key, value] of Object.entries(updates)) {
      state[key] = value;
    }
  }

  /**
   * Get a copy of the current state (safe to read without reactivity).
   */
  function getState() {
    return { ...state };
  }

  /**
   * Reset state to defaults.
   */
  function reset() {
    for (const [key, value] of Object.entries(defaultState)) {
      state[key] = typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value;
    }
  }

  // ─── Conversation Helpers ───

  function getActiveConversation() {
    if (!state.activeConversationId) return null;
    return state.conversations.find(c => c.id === state.activeConversationId) || null;
  }

  function createConversation(title = 'New Chat') {
    const conv = {
      id: UUID(),
      title,
      messages: [],
      provider: state.provider,
      model: state.model,
      systemPrompt: state.systemPrompt,
      ddgEnabled: state.ddgEnabled,
      visitWebsiteEnabled: state.visitWebsiteEnabled,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    state.conversations = [conv, ...state.conversations];
    state.activeConversationId = conv.id;
    return conv;
  }

  function deleteConversation(id) {
    state.conversations = state.conversations.filter(c => c.id !== id);
    if (state.activeConversationId === id) {
      state.activeConversationId = state.conversations.length > 0
        ? state.conversations[0].id
        : null;
    }
  }

  function addMessage(conversationId, message) {
    const conv = state.conversations.find(c => c.id === conversationId);
    if (!conv) return;
    conv.messages.push({
      id: UUID(),
      ...message,
      timestamp: Date.now(),
    });
    conv.updatedAt = Date.now();
    // Trigger reactivity
    state.conversations = [...state.conversations];
  }

  function updateLastAssistantMessage(conversationId, content) {
    const conv = state.conversations.find(c => c.id === conversationId);
    if (!conv || conv.messages.length === 0) return;
    const lastMsg = conv.messages[conv.messages.length - 1];
    if (lastMsg.role === 'assistant') {
      lastMsg.content = content;
      conv.updatedAt = Date.now();
      state.conversations = [...state.conversations];
    }
  }

  function renameConversation(id, newTitle) {
    const conv = state.conversations.find(c => c.id === id);
    if (conv) {
      conv.title = newTitle;
      conv.updatedAt = Date.now();
      state.conversations = [...state.conversations];
    }
  }

  // ─── Initialize ───
  // Ensure we have at least one conversation if none exist
  if (state.conversations.length === 0) {
    // Don't create a default conversation — show welcome screen
  }

  return {
    state,
    subscribe,
    update,
    getState,
    reset,
    getActiveConversation,
    createConversation,
    deleteConversation,
    addMessage,
    updateLastAssistantMessage,
    renameConversation,
  };
})();

window.AppStore = AppStore;