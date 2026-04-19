/**
 * OpenLLM Chat — Main Application Bootstrap
 * Initializes all modules, binds DOM events, wires up the UI.
 */

const App = (() => {
  let isGenerating = false;

  async function init() {
    console.log('[App] Initializing OpenLLM Chat...');

    // AppStore is an IIFE — already initialized on script load

    // Initialize sidebar panels
    LLMConfigPanel.init();
    TTSConfigPanel.init();
    ToolsConfigPanel.init();
    Sidebar.init();

    // ChatManager doesn't need init — it's a pure module

    // Bind DOM events
    bindInputEvents();
    bindToggleEvents();
    bindKeyboardShortcuts();

    // Welcome screen suggestion buttons
    document.querySelectorAll('.suggestion-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const prompt = btn.dataset.prompt;
        if (prompt) {
          document.getElementById('messageInput').value = prompt;
          handleSend();
        }
      });
    });

    // Initial render
    MessageRenderer.render();

    // Check for saved conversations
    if (AppStore.state.conversations.length === 0) {
      showWelcomeScreen();
    } else if (!AppStore.state.activeConversationId) {
      AppStore.createConversation();
      MessageRenderer.render();
    }

    console.log('[App] OpenLLM Chat initialized');
  }

  function bindInputEvents() {
    const messageInput = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendBtn');
    const stopBtn = document.getElementById('stopBtn');

    // Send message
    sendBtn.addEventListener('click', handleSend);

    // Stop generation
    stopBtn.addEventListener('click', () => {
      ChatManager.stopGeneration();
    });

    // Enter to send (Shift+Enter for newline)
    messageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    });

    // Auto-resize textarea & enable/disable send
    messageInput.addEventListener('input', () => {
      messageInput.style.height = 'auto';
      messageInput.style.height = Math.min(messageInput.scrollHeight, 200) + 'px';
      sendBtn.disabled = !messageInput.value.trim();
    });
  }

  function bindToggleEvents() {
    // DDG search toggle
    const ddgToggle = document.getElementById('ddgToggle');
    if (ddgToggle) {
      ddgToggle.addEventListener('click', () => {
        ddgToggle.classList.toggle('active');
        AppStore.update({ ddgEnabled: ddgToggle.classList.contains('active') });
      });
    }

    // Visit website toggle
    const visitToggle = document.getElementById('visitToggle');
    if (visitToggle) {
      visitToggle.addEventListener('click', () => {
        visitToggle.classList.toggle('active');
        AppStore.update({ visitWebsiteEnabled: visitToggle.classList.contains('active') });
      });
    }

    // TTS toggle
    const ttsToggle = document.getElementById('ttsToggle');
    if (ttsToggle) {
      ttsToggle.addEventListener('click', () => {
        ttsToggle.classList.toggle('active');
        AppStore.update({ ttsEnabled: ttsToggle.classList.contains('active') });
      });
    }

    // Load saved toggle states
    if (ddgToggle && AppStore.state.ddgEnabled) ddgToggle.classList.add('active');
    if (visitToggle && AppStore.state.visitWebsiteEnabled) visitToggle.classList.add('active');
    if (ttsToggle && AppStore.state.ttsEnabled) ttsToggle.classList.add('active');
  }

  function bindKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Ctrl+Shift+N: New chat
      if (e.ctrlKey && e.shiftKey && e.key === 'N') {
        e.preventDefault();
        AppStore.createConversation();
        MessageRenderer.render();
        Sidebar.updateConversationList();
        Sidebar.updateChatTitle();
      }

      // Ctrl+B: Toggle sidebar
      if (e.ctrlKey && e.key === 'b') {
        e.preventDefault();
        document.getElementById('sidebar').classList.toggle('collapsed');
      }

      // Escape: Stop generation
      if (e.key === 'Escape' && isGenerating) {
        ChatManager.stopGeneration();
      }
    });
  }

  async function handleSend() {
    const messageInput = document.getElementById('messageInput');
    const message = messageInput.value.trim();
    if (!message || isGenerating) return;

    // Hide welcome screen
    const welcomeScreen = document.getElementById('welcomeScreen');
    if (welcomeScreen) welcomeScreen.style.display = 'none';

    // Clear input
    messageInput.value = '';
    messageInput.style.height = 'auto';

    // Set generating state
    isGenerating = true;
    updateGeneratingUI(true);

    try {
      await ChatManager.sendMessage(message);
    } catch (error) {
      console.error('[App] Error sending message:', error);
      ChatManager.showToast(`Error: ${error.message}`, 'error');
    } finally {
      isGenerating = false;
      updateGeneratingUI(false);
    }
  }

  function updateGeneratingUI(generating) {
    const sendBtn = document.getElementById('sendBtn');
    const stopBtn = document.getElementById('stopBtn');
    const messageInput = document.getElementById('messageInput');

    if (generating) {
      sendBtn.style.display = 'none';
      stopBtn.style.display = 'flex';
      messageInput.disabled = true;
    } else {
      sendBtn.style.display = 'flex';
      stopBtn.style.display = 'none';
      messageInput.disabled = false;
      messageInput.focus();
    }
  }

  function showWelcomeScreen() {
    const welcomeScreen = document.getElementById('welcomeScreen');
    if (welcomeScreen) welcomeScreen.style.display = 'flex';
  }

  return { init };
})();

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});