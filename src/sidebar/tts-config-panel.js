/**
 * OpenLLM Chat — TTS Configuration Panel
 */

const TTSConfigPanel = (() => {
  function init() {
    const ttsEnabled = document.getElementById('ttsEnabled');
    const ttsVoiceSelect = document.getElementById('ttsVoiceSelect');
    const ttsSpeedSlider = document.getElementById('ttsSpeedSlider');
    const ttsSpeedValue = document.getElementById('ttsSpeedValue');
    const ttsVolumeSlider = document.getElementById('ttsVolumeSlider');
    const ttsVolumeValue = document.getElementById('ttsVolumeValue');
    const ttsAutoRead = document.getElementById('ttsAutoRead');
    const ttsAutoReadUser = document.getElementById('ttsAutoReadUser');
    const loadTtsModelBtn = document.getElementById('loadTtsModelBtn');
    const clearTtsCacheBtn = document.getElementById('clearTtsCacheBtn');

    // Load saved state
    loadState();

    ttsEnabled.addEventListener('change', () => {
      AppStore.update({ ttsEnabled: ttsEnabled.checked });
    });

    ttsVoiceSelect.addEventListener('change', () => {
      AppStore.update({ ttsVoice: ttsVoiceSelect.value });
    });

    ttsSpeedSlider.addEventListener('input', () => {
      ttsSpeedValue.textContent = ttsSpeedSlider.value;
      AppStore.update({ ttsSpeed: parseFloat(ttsSpeedSlider.value) });
    });

    ttsVolumeSlider.addEventListener('input', () => {
      ttsVolumeValue.textContent = ttsVolumeSlider.value;
      AppStore.update({ ttsVolume: parseFloat(ttsVolumeSlider.value) });
    });

    ttsAutoRead.addEventListener('change', () => {
      AppStore.update({ ttsAutoRead: ttsAutoRead.checked });
    });

    ttsAutoReadUser.addEventListener('change', () => {
      AppStore.update({ ttsAutoReadUser: ttsAutoReadUser.checked });
    });

    loadTtsModelBtn.addEventListener('click', async () => {
      loadTtsModelBtn.disabled = true;
      loadTtsModelBtn.textContent = 'Loading...';
      try {
        await KokoroEngine.loadModel();
        ChatManager.showToast('TTS model loaded successfully', 'success');
      } catch (error) {
        ChatManager.showToast(`Failed to load TTS model: ${error.message}`, 'error');
      } finally {
        loadTtsModelBtn.disabled = false;
        loadTtsModelBtn.textContent = 'Load Model';
      }
    });

    clearTtsCacheBtn.addEventListener('click', async () => {
      await KokoroEngine.clearCache();
      ChatManager.showToast('TTS cache cleared', 'success');
    });
  }

  function loadState() {
    const state = AppStore.state;
    document.getElementById('ttsEnabled').checked = state.ttsEnabled || false;
    document.getElementById('ttsVoiceSelect').value = state.ttsVoice || 'af_heart';
    document.getElementById('ttsSpeedSlider').value = state.ttsSpeed || 1.0;
    document.getElementById('ttsSpeedValue').textContent = state.ttsSpeed || 1.0;
    document.getElementById('ttsVolumeSlider').value = state.ttsVolume || 0.8;
    document.getElementById('ttsVolumeValue').textContent = state.ttsVolume || 0.8;
    document.getElementById('ttsAutoRead').checked = state.ttsAutoRead || false;
    document.getElementById('ttsAutoReadUser').checked = state.ttsAutoReadUser || false;
  }

  return { init, loadState };
})();

window.TTSConfigPanel = TTSConfigPanel;