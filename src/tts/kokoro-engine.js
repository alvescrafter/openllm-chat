/**
 * OpenLLM Chat — Kokoro TTS Engine
 * Runs natively in the browser using kokoro-js (loaded via dynamic import).
 * Uses WebGPU when available, falls back to WASM.
 * Model is downloaded from HuggingFace and cached in IndexedDB.
 */

const KokoroEngine = (() => {
  let model = null;
  let isModelLoaded = false;
  let isModelLoading = false;
  let audioContext = null;
  let currentSource = null;
  let isPlaying = false;

  const MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';

  /**
   * Ensure AudioContext is ready.
   */
  function ensureAudioContext() {
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }
    return audioContext;
  }

  /**
   * Load the TTS model.
   * Downloads kokoro-js from CDN, then downloads the ONNX model from HuggingFace.
   * Everything is cached in IndexedDB for subsequent loads.
   */
  async function loadModel(dtype = 'q8f16') {
    if (isModelLoaded || isModelLoading) return;

    isModelLoading = true;
    AppStore.update({ ttsModelLoading: true });
    updateTTSStatus('loading', 'Loading TTS model...');

    try {
      // Dynamically import kokoro-js from CDN
      updateTTSStatus('loading', 'Downloading TTS engine...');
      const { KokoroTTS } = await import('https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/dist/kokoro.web.js');

      // Load the model — this downloads from HuggingFace and caches in IndexedDB
      updateTTSStatus('loading', 'Downloading TTS model (first time may take a minute)...');

      // Try WebGPU first, fall back to WASM
      let backend = 'wasm';
      try {
        if (navigator.gpu) {
          model = await KokoroTTS.from_pretrained(MODEL_ID, {
            dtype: dtype,
            device: 'webgpu',
          });
          backend = 'webgpu';
        } else {
          model = await KokoroTTS.from_pretrained(MODEL_ID, {
            dtype: dtype,
            device: 'wasm',
          });
        }
      } catch (gpuError) {
        console.warn('[KokoroEngine] WebGPU failed, falling back to WASM:', gpuError.message);
        model = await KokoroTTS.from_pretrained(MODEL_ID, {
          dtype: dtype,
          device: 'wasm',
        });
      }

      isModelLoaded = true;
      isModelLoading = false;
      AppStore.update({ ttsModelLoaded: true, ttsModelLoading: false, ttsBackend: backend });
      updateTTSStatus('loaded', `Model loaded (${backend})`);
      console.log(`[KokoroEngine] Model loaded successfully (${backend})`);

    } catch (error) {
      console.error('[KokoroEngine] Failed to load model:', error);
      isModelLoading = false;
      AppStore.update({ ttsModelLoading: false });
      updateTTSStatus('error', `Error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Speak text aloud.
   * @param {string} text - The text to speak
   * @param {object} options - { voice, speed }
   * @returns {Promise<void>}
   */
  async function speak(text, options = {}) {
    if (!isModelLoaded) {
      await loadModel();
    }

    if (!isModelLoaded || !model) {
      throw new Error('TTS model failed to load');
    }

    const voice = options.voice || AppStore.state.ttsVoice || 'af_heart';
    const speed = options.speed || AppStore.state.ttsSpeed || 1.0;

    // Stop any current playback
    stop();

    // Clean text for TTS
    const cleanText = text
      .replace(/```[\s\S]*?```/g, ' code block ')
      .replace(/[#*_~`]/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/https?:\/\/\S+/g, 'link')
      .trim();

    if (!cleanText) return;

    try {
      updateTTSStatus('speaking', 'Speaking...');

      // Generate audio using kokoro-js
      const audio = await model.generate(cleanText, {
        voice: voice,
        speed: speed,
      });

      // Play the audio
      await playAudio(audio);

    } catch (error) {
      console.error('[KokoroEngine] Speak error:', error);
      updateTTSStatus('error', `Speak error: ${error.message}`);
      throw error;
    } finally {
      if (isModelLoaded) {
        updateTTSStatus('loaded', `Model loaded (${AppStore.state.ttsBackend || 'wasm'})`);
      }
    }
  }

  /**
   * Play audio from kokoro-js output.
   * The audio object has .audio (Float32Array) and .sampling_rate (number).
   */
  async function playAudio(audio) {
    const ctx = ensureAudioContext();

    // kokoro-js returns a RawAudio object with .audio and .sampling_rate
    const audioData = audio.audio || audio;
    const sampleRate = audio.sampling_rate || audio.sampleRate || 24000;

    let float32Data;
    if (audioData instanceof Float32Array) {
      float32Data = audioData;
    } else if (audioData instanceof ArrayBuffer) {
      float32Data = new Float32Array(audioData);
    } else if (ArrayBuffer.isView(audioData)) {
      float32Data = new Float32Array(audioData.buffer, audioData.byteOffset, audioData.length);
    } else if (Array.isArray(audioData)) {
      float32Data = new Float32Array(audioData);
    } else {
      // Try converting
      float32Data = new Float32Array(audioData);
    }

    const audioBuffer = ctx.createBuffer(1, float32Data.length, sampleRate);
    audioBuffer.getChannelData(0).set(float32Data);

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;

    const gainNode = ctx.createGain();
    gainNode.gain.value = AppStore.state.ttsVolume || 0.8;

    source.connect(gainNode);
    gainNode.connect(ctx.destination);

    return new Promise((resolve) => {
      source.onended = () => {
        isPlaying = false;
        currentSource = null;
        resolve();
      };

      currentSource = source;
      isPlaying = true;
      source.start(0);
    });
  }

  /**
   * Stop current playback.
   */
  function stop() {
    if (currentSource) {
      try { currentSource.stop(); } catch { /* ignore */ }
      currentSource = null;
    }
    isPlaying = false;
  }

  /**
   * Update TTS status in the UI.
   */
  function updateTTSStatus(status, message) {
    const statusEl = document.getElementById('ttsStatus');
    if (statusEl) {
      const dotClass = status === 'loaded' ? 'status-online'
        : status === 'loading' ? 'status-loading'
        : status === 'speaking' ? 'status-loading'
        : status === 'error' ? 'status-error'
        : 'status-offline';
      statusEl.innerHTML = `<span class="status-dot ${dotClass}"></span><span>${message}</span>`;
    }
  }

  /**
   * Clear the TTS model cache (IndexedDB).
   */
  async function clearCache() {
    stop();
    model = null;
    isModelLoaded = false;

    try {
      // Delete IndexedDB databases that contain the model
      if (indexedDB.databases) {
        const dbs = await indexedDB.databases();
        for (const db of dbs) {
          if (db.name && (db.name.includes('kokoro') || db.name.includes('onnx') || db.name.includes('huggingface'))) {
            indexedDB.deleteDatabase(db.name);
          }
        }
      }

      // Also try to clear Cache API entries
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        for (const name of cacheNames) {
          if (name.includes('kokoro') || name.includes('onnx') || name.includes('huggingface')) {
            await caches.delete(name);
          }
        }
      }
    } catch (e) {
      console.warn('[KokoroEngine] Failed to clear cache:', e);
    }

    AppStore.update({ ttsModelLoaded: false, ttsBackend: null });
    updateTTSStatus('offline', 'Model not loaded');
  }

  /**
   * Get list of available voices.
   */
  function listVoices() {
    return [
      { id: 'af_heart', name: 'Heart', flag: '🚺', trait: '❤️' },
      { id: 'af_bella', name: 'Bella', flag: '🚺', trait: '🔥' },
      { id: 'af_nicole', name: 'Nicole', flag: '🚺', trait: '🎧' },
      { id: 'af_sarah', name: 'Sarah', flag: '🚺', trait: '' },
      { id: 'am_adam', name: 'Adam', flag: '🚹', trait: '' },
      { id: 'am_michael', name: 'Michael', flag: '🚹', trait: '' },
      { id: 'bf_emma', name: 'Emma', flag: '🚺', trait: '' },
      { id: 'bm_george', name: 'George', flag: '🚹', trait: '' },
    ];
  }

  return {
    loadModel,
    speak,
    stop,
    clearCache,
    listVoices,
    get isLoaded() { return isModelLoaded; },
    get isLoading() { return isModelLoading; },
  };
})();

window.KokoroEngine = KokoroEngine;