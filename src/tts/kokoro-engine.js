/**
 * OpenLLM Chat — Kokoro TTS Engine
 * Lazy-loads the Kokoro TTS model in a Web Worker.
 * Supports WebGPU (preferred) and WASM fallback.
 */

const KokoroEngine = (() => {
  let ttsWorker = null;
  let isModelLoaded = false;
  let isModelLoading = false;
  let audioContext = null;
  let audioQueue = [];
  let isPlaying = false;
  let currentSource = null;
  let resolveSpeak = null;

  /**
   * Initialize the TTS engine.
   */
  async function init() {
    if (ttsWorker) return;

    // Create audio context
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }

    // Create web worker for TTS inference
    const workerCode = `
      let model = null;
      let isLoaded = false;

      self.onmessage = async function(e) {
        const { type, data } = e.data;

        if (type === 'load') {
          try {
            // Dynamically import kokoro-js
            const { KokoroTTS } = await import('https://cdn.jsdelivr.net/npm/kokoro-js@0.1.0/dist/kokoro.min.js');
            
            const modelSize = data.modelSize || 'q8';
            const modelUrl = modelSize === 'q8' 
              ? 'https://huggingface.co/hexgrad/Kokoro-82M-v1.0-ONNX/resolve/main/onnx/model_q8f16.onnx'
              : 'https://huggingface.co/hexgrad/Kokoro-82M-v1.0-ONNX/resolve/main/onnx/model.onnx';
            
            const voicesUrl = 'https://huggingface.co/hexgrad/Kokoro-82M-v1.0-ONNX/resolve/main/voices.json';

            model = new KokoroTTS({
              modelUrl,
              voicesUrl,
              onnxWasmPaths: 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/',
            });

            await model.init();
            isLoaded = true;

            self.postMessage({ type: 'loaded', data: { backend: model.backend || 'wasm' } });
          } catch (error) {
            self.postMessage({ type: 'error', data: { message: error.message } });
          }
        }

        if (type === 'speak') {
          if (!isLoaded || !model) {
            self.postMessage({ type: 'error', data: { message: 'Model not loaded' } });
            return;
          }

          try {
            const { text, voice, speed } = data;
            const audio = await model.synthesize(text, {
              voice: voice || 'af_heart',
              speed: speed || 1.0,
            });

            // Transfer the audio buffer
            self.postMessage({ 
              type: 'audio', 
              data: { 
                audio: audio.audio,
                sampleRate: audio.sampleRate,
                text: data.text,
              } 
            }, [audio.audio.buffer]);
          } catch (error) {
            self.postMessage({ type: 'error', data: { message: error.message } });
          }
        }

        if (type === 'status') {
          self.postMessage({ type: 'status', data: { isLoaded, isLoading: false } });
        }
      };
    `;

    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const workerUrl = URL.createObjectURL(blob);
    ttsWorker = new Worker(workerUrl);

    ttsWorker.onmessage = (e) => {
      const { type, data } = e.data;

      if (type === 'loaded') {
        isModelLoaded = true;
        isModelLoading = false;
        AppStore.update({ ttsModelLoaded: true, ttsModelLoading: false, ttsBackend: data.backend });
        updateTTSStatus('loaded', `Model loaded (${data.backend})`);
      } else if (type === 'audio') {
        playAudioBuffer(data.audio, data.sampleRate);
      } else if (type === 'error') {
        console.error('[KokoroEngine] Error:', data.message);
        isModelLoading = false;
        AppStore.update({ ttsModelLoading: false });
        updateTTSStatus('error', `Error: ${data.message}`);
      }
    };
  }

  /**
   * Load the TTS model.
   */
  async function loadModel(modelSize = 'q8') {
    if (isModelLoaded || isModelLoading) return;

    isModelLoading = true;
    AppStore.update({ ttsModelLoading: true });
    updateTTSStatus('loading', 'Loading model...');

    await init();

    ttsWorker.postMessage({
      type: 'load',
      data: { modelSize },
    });
  }

  /**
   * Speak text aloud.
   */
  async function speak(text, options = {}) {
    if (!isModelLoaded) {
      await loadModel();
    }

    if (!isModelLoaded) {
      throw new Error('TTS model failed to load');
    }

    const voice = options.voice || AppStore.state.ttsVoice || 'af_heart';
    const speed = options.speed || AppStore.state.ttsSpeed || 1.0;

    // Stop any current playback
    stop();

    return new Promise((resolve) => {
      resolveSpeak = resolve;

      // Split text into sentences for streaming
      const sentences = splitIntoSentences(text);

      for (const sentence of sentences) {
        if (sentence.trim()) {
          ttsWorker.postMessage({
            type: 'speak',
            data: { text: sentence.trim(), voice, speed },
          });
        }
      }
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
    audioQueue = [];
    isPlaying = false;
    if (resolveSpeak) {
      resolveSpeak();
      resolveSpeak = null;
    }
  }

  /**
   * Play an audio buffer.
   */
  function playAudioBuffer(audioData, sampleRate) {
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }

    // Resume audio context if suspended
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }

    let float32Data;
    if (audioData instanceof Float32Array) {
      float32Data = audioData;
    } else if (audioData instanceof ArrayBuffer) {
      float32Data = new Float32Array(audioData);
    } else {
      float32Data = new Float32Array(audioData);
    }

    const audioBuffer = audioContext.createBuffer(1, float32Data.length, sampleRate || 24000);
    audioBuffer.getChannelData(0).set(float32Data);

    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;

    const gainNode = audioContext.createGain();
    gainNode.gain.value = AppStore.state.ttsVolume || 0.8;

    source.connect(gainNode);
    gainNode.connect(audioContext.destination);

    source.onended = () => {
      isPlaying = false;
      currentSource = null;
      if (resolveSpeak) {
        resolveSpeak();
        resolveSpeak = null;
      }
    };

    currentSource = source;
    isPlaying = true;
    source.start(0);
  }

  /**
   * Split text into sentences for TTS.
   */
  function splitIntoSentences(text) {
    return text
      .replace(/([.!?])\s+/g, '$1\n')
      .split('\n')
      .filter(s => s.trim().length > 0);
  }

  /**
   * Update TTS status in the UI.
   */
  function updateTTSStatus(status, message) {
    const statusEl = document.getElementById('ttsStatus');
    if (statusEl) {
      const dotClass = status === 'loaded' ? 'status-online' : status === 'loading' ? 'status-loading' : status === 'error' ? 'status-error' : 'status-offline';
      statusEl.innerHTML = `<span class="status-dot ${dotClass}"></span><span>${message}</span>`;
    }
  }

  /**
   * Clear the TTS model cache.
   */
  async function clearCache() {
    try {
      const dbs = await indexedDB.databases();
      for (const db of dbs) {
        if (db.name && db.name.includes('kokoro')) {
          indexedDB.deleteDatabase(db.name);
        }
      }
    } catch (e) {
      console.warn('[KokoroEngine] Failed to clear cache:', e);
    }
    isModelLoaded = false;
    AppStore.update({ ttsModelLoaded: false });
    updateTTSStatus('offline', 'Model not loaded');
  }

  return {
    init,
    loadModel,
    speak,
    stop,
    clearCache,
    get isLoaded() { return isModelLoaded; },
    get isLoading() { return isModelLoading; },
  };
})();

window.KokoroEngine = KokoroEngine;