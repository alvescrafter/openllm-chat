# OpenLLM Chat

A zero-build-step, vanilla JavaScript single-page application combining multi-provider LLM chat, DuckDuckGo search + website visiting (3-tier tool calling), Kokoro TTS, and HTML code preview.

## Features

- **8 LLM Providers**: OpenAI, Anthropic, Google Gemini, Ollama, LM Studio, Groq, Mistral, Custom OpenAI-compatible
- **3-Tier Tool Calling**: Native tool calling (Tier 1), prompt injection (Tier 2), manual search prepend (Tier 3)
- **DuckDuckGo Search**: Web search and image search via HTML scraping or SearXNG
- **Website Visiting**: Fetch and extract content from any URL with link/image extraction
- **Kokoro TTS**: Text-to-speech with WebGPU/WASM auto-detect, streaming support
- **Code Preview**: Sandboxed HTML/CSS/JS preview in popup windows
- **Dark/Light Theme**: Toggle between themes with persistent preference
- **Conversation Management**: Create, rename, delete, export/import conversations
- **CORS Proxy**: Built-in Node.js proxy for cross-origin API requests

## Quick Start

1. Open `index.html` in a modern browser
2. Configure your LLM provider in the sidebar (API key, model, etc.)
3. Start chatting!

### CORS Proxy (for browser-based API calls)

Some LLM APIs require a CORS proxy when called from the browser. Start the included proxy:

```bash
node proxy.js
```

This runs on port 8321 by default. Configure the proxy mode in **Settings → Tools → CORS Proxy**.

### SearXNG (alternative search backend)

If you have a SearXNG instance running, configure its URL in **Settings → Tools → CORS Proxy → SearXNG**.

## Architecture

- **No build step** — Pure vanilla JS, CSS, and HTML
- **Proxy-based reactive state** (`AppStore`) with localStorage persistence
- **Module pattern** — Each file is an IIFE exposing a global via `window.ModuleName`
- **3-tier tool calling** — Automatically selects the best strategy based on provider capability

## Project Structure

```
├── index.html                    # Main HTML entry point
├── proxy.js                      # Node.js CORS proxy companion
├── styles/
│   ├── main.css                  # CSS variables, reset, common components
│   ├── sidebar.css               # Sidebar layout and styles
│   ├── chat.css                  # Chat area, messages, input
│   ├── code-preview.css          # Code block and preview styles
│   └── tools.css                 # Tool call indicators and results
├── src/
│   ├── app.js                    # Main bootstrap and event binding
│   ├── state/
│   │   └── store.js              # Proxy-based reactive state store
│   ├── utils/
│   │   ├── id.js                 # UUID generator
│   │   ├── markdown.js           # Lightweight markdown parser
│   │   └── cors-proxy.js         # CORS proxy resolution
│   ├── llm/
│   │   ├── providers/
│   │   │   ├── openai.js         # OpenAI + OpenAI-compatible providers
│   │   │   ├── anthropic.js      # Anthropic Claude (direct browser access)
│   │   │   ├── google.js         # Google Gemini
│   │   │   ├── ollama.js         # Ollama (delegates to OpenAI)
│   │   │   └── lm-studio.js      # LM Studio (delegates to OpenAI)
│   │   ├── provider-registry.js  # Provider registration and routing
│   │   ├── streaming-handler.js  # Agent loop with tool calling
│   │   └── tool-call-parser.js   # Multi-format tool call parser
│   ├── tools/
│   │   ├── tool-definitions.js   # JSON Schema tool definitions
│   │   ├── orchestrator.js       # 3-tier tool orchestration
│   │   ├── duckduckgo/
│   │   │   ├── html-parser.js    # DDG HTML result parser
│   │   │   ├── search.js         # DDG web search
│   │   │   └── image-search.js  # DDG image search
│   │   └── visit-website/
│   │       ├── fetcher.js        # Website visitor and content extractor
│   │       ├── content-extractor.js # Text/link/image extraction
│   │       └── image-handler.js  # Image scoring and filtering
│   ├── chat/
│   │   ├── chat-manager.js       # Message sending and conversation management
│   │   ├── message-renderer.js   # DOM rendering with markdown and tool indicators
│   │   ├── code-actions.js       # Copy and preview code actions
│   │   └── tts-buttons.js        # Per-message TTS buttons
│   ├── tts/
│   │   ├── kokoro-engine.js     # Kokoro TTS with Web Worker
│   │   ├── audio-player.js       # Web Audio API playback
│   │   └── streaming-tts.js     # Streaming token buffering
│   ├── code-preview/
│   │   └── preview-window.js    # Sandboxed iframe preview
│   └── sidebar/
│       ├── llm-config-panel.js   # LLM provider configuration
│       ├── tts-config-panel.js   # TTS configuration
│       ├── tools-config-panel.js # Tools and CORS proxy configuration
│       └── sidebar.js            # Sidebar controller
```

## License

MIT