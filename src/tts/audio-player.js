/**
 * OpenLLM Chat — Audio Player
 * Web Audio API playback with gapless chunk scheduling.
 */

const AudioPlayer = (() => {
  let audioContext = null;
  let currentSource = null;
  let gainNode = null;
  let isPlaying = false;
  let audioQueue = [];
  let playbackResolve = null;

  function getContext() {
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      gainNode = audioContext.createGain();
      gainNode.connect(audioContext.destination);
    }
    return audioContext;
  }

  function setVolume(volume) {
    const ctx = getContext();
    if (gainNode) {
      gainNode.gain.value = Math.max(0, Math.min(1, volume));
    }
  }

  function play(float32Array, sampleRate = 24000) {
    const ctx = getContext();

    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    stop();

    const buffer = ctx.createBuffer(1, float32Array.length, sampleRate);
    buffer.getChannelData(0).set(float32Array);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(gainNode);

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

  function stop() {
    if (currentSource) {
      try { currentSource.stop(); } catch { /* ignore */ }
      currentSource = null;
    }
    isPlaying = false;
  }

  return {
    play,
    stop,
    setVolume,
    get playing() { return isPlaying; },
  };
})();

window.AudioPlayer = AudioPlayer;