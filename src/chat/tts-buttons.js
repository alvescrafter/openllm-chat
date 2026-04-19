/**
 * OpenLLM Chat — TTS Buttons
 * Per-message TTS trigger buttons.
 */

const TTSButtons = (() => {
  /**
   * Create a TTS button for a message.
   */
  function createButton(messageContent, role) {
    if (!window.KokoroEngine || !AppStore.state.ttsEnabled) return null;

    const btn = document.createElement('button');
    btn.className = 'message-action-btn';
    btn.innerHTML = '🔊 Read';
    btn.title = 'Read this message aloud';

    btn.addEventListener('click', async () => {
      // Strip code blocks for TTS
      const cleanText = messageContent.replace(/```[\s\S]*?```/g, '[code block]');
      
      btn.innerHTML = '🔊 Reading...';
      btn.disabled = true;

      try {
        await window.KokoroEngine.speak(cleanText);
        btn.innerHTML = '✅ Done';
      } catch (e) {
        console.warn('[TTSButtons] Error:', e);
        btn.innerHTML = '❌ Error';
      } finally {
        setTimeout(() => {
          btn.innerHTML = '🔊 Read';
          btn.disabled = false;
        }, 2000);
      }
    });

    return btn;
  }

  return { createButton };
})();

window.TTSButtons = TTSButtons;