/**
 * OpenLLM Chat — UUID Generator
 * Generates unique IDs for conversations, messages, and tool calls.
 */

const UUID = (() => {
  // Use crypto.randomUUID if available (modern browsers)
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return () => crypto.randomUUID();
  }

  // Fallback: Math.random-based UUID v4
  return () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  };
})();

// Export for use in other modules
window.UUID = UUID;