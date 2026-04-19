/**
 * OpenLLM Chat — Streaming TTS
 * Real-time TTS that starts playing while the LLM is still generating.
 */

const StreamingTTS = (() => {
  let sentenceBuffer = '';
  let isStreaming = false;
  let sentenceQueue = [];

  /**
   * Start streaming TTS for an ongoing LLM response.
   * Buffers text and sends sentences to TTS as they complete.
   */
  function startStreaming() {
    sentenceBuffer = '';
    isStreaming = true;
    sentenceQueue = [];
  }

  /**
   * Feed a text token from the LLM stream.
   * Sentences are extracted and queued for TTS.
   */
  function feedToken(token) {
    if (!isStreaming || !AppStore.state.ttsEnabled || !AppStore.state.ttsAutoRead) return;

    sentenceBuffer += token;

    // Check for sentence boundaries
    const sentenceEnders = /[.!?]\s+/;
    const match = sentenceBuffer.match(/^(.*?[.!?])\s+(.*)$/s);

    if (match) {
      const sentence = match[1].trim();
      sentenceBuffer = match[2];

      if (sentence.length > 0) {
        queueSentence(sentence);
      }
    }
  }

  /**
   * End streaming — flush remaining buffer.
   */
  function endStreaming() {
    if (sentenceBuffer.trim().length > 0) {
      queueSentence(sentenceBuffer.trim());
    }
    sentenceBuffer = '';
    isStreaming = false;
  }

  /**
   * Queue a sentence for TTS playback.
   */
  async function queueSentence(sentence) {
    // Skip code blocks and very short sentences
    if (sentence.startsWith('```') || sentence.startsWith('[TOOL_CALL]')) return;
    if (sentence.length < 5) return;

    try {
      await KokoroEngine.speak(sentence);
    } catch (e) {
      console.warn('[StreamingTTS] Error speaking sentence:', e);
    }
  }

  /**
   * Stop all streaming TTS.
   */
  function stop() {
    isStreaming = false;
    sentenceBuffer = '';
    sentenceQueue = [];
    KokoroEngine.stop();
  }

  return {
    startStreaming,
    feedToken,
    endStreaming,
    stop,
    get isStreaming() { return isStreaming; },
  };
})();

window.StreamingTTS = StreamingTTS;