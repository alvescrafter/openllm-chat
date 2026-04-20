/**
 * OpenLLM Chat — Streaming TTS
 * Real-time TTS that starts playing while the LLM is still generating.
 * Sentences are queued and played sequentially to avoid overlap.
 */

const StreamingTTS = (() => {
  let sentenceBuffer = '';
  let isStreaming = false;
  let sentenceQueue = [];
  let isProcessingQueue = false;

  /**
   * Start streaming TTS for an ongoing LLM response.
   * Buffers text and sends sentences to TTS as they complete.
   */
  function startStreaming() {
    sentenceBuffer = '';
    isStreaming = true;
    sentenceQueue = [];
    isProcessingQueue = false;
  }

  /**
   * Feed a text token from the LLM stream.
   * Sentences are extracted and queued for TTS.
   */
  function feedToken(token) {
    if (!isStreaming || !AppStore.state.ttsEnabled || !AppStore.state.ttsAutoRead) return;

    sentenceBuffer += token;

    // Check for sentence boundaries
    const match = sentenceBuffer.match(/^(.*?[.!?])\s+(.*)$/s);

    if (match) {
      const sentence = match[1].trim();
      sentenceBuffer = match[2];

      if (sentence.length > 0) {
        enqueueSentence(sentence);
      }
    }
  }

  /**
   * End streaming — flush remaining buffer.
   */
  function endStreaming() {
    if (sentenceBuffer.trim().length > 0) {
      enqueueSentence(sentenceBuffer.trim());
    }
    sentenceBuffer = '';
    isStreaming = false;
  }

  /**
   * Enqueue a sentence for TTS playback and process the queue.
   */
  function enqueueSentence(sentence) {
    // Skip code blocks and very short sentences
    if (sentence.startsWith('```') || sentence.startsWith('[TOOL_CALL]')) return;
    if (sentence.length < 5) return;

    sentenceQueue.push(sentence);
    processQueue();
  }

  /**
   * Process the sentence queue sequentially.
   * Each sentence is spoken one at a time to avoid overlap.
   */
  async function processQueue() {
    if (isProcessingQueue) return;
    isProcessingQueue = true;

    while (sentenceQueue.length > 0) {
      const sentence = sentenceQueue.shift();
      try {
        await KokoroEngine.speak(sentence);
      } catch (e) {
        console.warn('[StreamingTTS] Error speaking sentence:', e);
      }
    }

    isProcessingQueue = false;
  }

  /**
   * Stop all streaming TTS.
   */
  function stop() {
    isStreaming = false;
    sentenceBuffer = '';
    sentenceQueue = [];
    isProcessingQueue = false;
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