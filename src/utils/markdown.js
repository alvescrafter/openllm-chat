/**
 * OpenLLM Chat — Lightweight Markdown Parser
 * Handles: code blocks, inline code, bold, italic, links, lists, headers, blockquotes, hr
 * No external dependencies.
 */

const MarkdownParser = (() => {
  function parse(markdown) {
    if (!markdown) return '';

    let html = markdown;

    // ─── Code blocks (must be first — they protect content from other rules) ───
    const codeBlocks = [];
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
      const index = codeBlocks.length;
      codeBlocks.push({ lang: lang || 'text', code: code });
      return `\x00CODEBLOCK_${index}\x00`;
    });

    // ─── Inline code (protect from other rules) ───
    const inlineCodes = [];
    html = html.replace(/`([^`\n]+)`/g, (match, code) => {
      const index = inlineCodes.length;
      inlineCodes.push(code);
      return `\x00INLINE_${index}\x00`;
    });

    // ─── Process line by line for block elements ───
    const lines = html.split('\n');
    const result = [];
    let inList = false;
    let listType = '';
    let inParagraph = false;

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];

      // Skip lines that are part of code blocks
      if (line.includes('\x00CODEBLOCK_') || line.includes('\x00INLINE_')) {
        if (inList) { result.push(listType === 'ul' ? '</ul>' : '</ol>'); inList = false; }
        if (inParagraph) { result.push('</p>'); inParagraph = false; }
        result.push(line);
        continue;
      }

      // ─── Horizontal rule ───
      if (/^---+$/.test(line.trim())) {
        if (inList) { result.push(listType === 'ul' ? '</ul>' : '</ol>'); inList = false; }
        if (inParagraph) { result.push('</p>'); inParagraph = false; }
        result.push('<hr>');
        continue;
      }

      // ─── Headers ───
      const headerMatch = line.match(/^(#{1,6})\s+(.+)/);
      if (headerMatch) {
        if (inList) { result.push(listType === 'ul' ? '</ul>' : '</ol>'); inList = false; }
        if (inParagraph) { result.push('</p>'); inParagraph = false; }
        const level = headerMatch[1].length;
        result.push(`<h${level}>${formatInline(headerMatch[2])}</h${level}>`);
        continue;
      }

      // ─── Blockquote ───
      if (line.startsWith('> ')) {
        if (inList) { result.push(listType === 'ul' ? '</ul>' : '</ol>'); inList = false; }
        if (inParagraph) { result.push('</p>'); inParagraph = false; }
        result.push(`<blockquote>${formatInline(line.slice(2))}</blockquote>`);
        continue;
      }

      // ─── Unordered list ───
      const ulMatch = line.match(/^[\s]*[-*+]\s+(.+)/);
      if (ulMatch) {
        if (inParagraph) { result.push('</p>'); inParagraph = false; }
        if (!inList || listType !== 'ul') {
          if (inList) result.push(listType === 'ul' ? '</ul>' : '</ol>');
          result.push('<ul>');
          inList = true;
          listType = 'ul';
        }
        result.push(`<li>${formatInline(ulMatch[1])}</li>`);
        continue;
      }

      // ─── Ordered list ───
      const olMatch = line.match(/^[\s]*\d+\.\s+(.+)/);
      if (olMatch) {
        if (inParagraph) { result.push('</p>'); inParagraph = false; }
        if (!inList || listType !== 'ol') {
          if (inList) result.push(listType === 'ul' ? '</ul>' : '</ol>');
          result.push('<ol>');
          inList = true;
          listType = 'ol';
        }
        result.push(`<li>${formatInline(olMatch[1])}</li>`);
        continue;
      }

      // ─── Close list if we hit a non-list line ───
      if (inList) {
        result.push(listType === 'ul' ? '</ul>' : '</ol>');
        inList = false;
      }

      // ─── Empty line ───
      if (line.trim() === '') {
        if (inParagraph) { result.push('</p>'); inParagraph = false; }
        continue;
      }

      // ─── Regular text → paragraph ───
      if (!inParagraph) {
        result.push(`<p>${formatInline(line)}`);
        inParagraph = true;
      } else {
        result.push(`<br>${formatInline(line)}`);
      }
    }

    if (inList) result.push(listType === 'ul' ? '</ul>' : '</ol>');
    if (inParagraph) result.push('</p>');

    html = result.join('\n');

    // ─── Restore code blocks ───
    html = html.replace(/\x00CODEBLOCK_(\d+)\x00/g, (match, index) => {
      const block = codeBlocks[parseInt(index)];
      const escapedCode = escapeHtml(block.code);
      return `<div class="code-block" data-lang="${block.lang}" data-raw-code="${encodeURIComponent(block.code)}">` +
        `<div class="code-block-header">` +
        `<span class="code-block-lang">${block.lang}</span>` +
        `<div class="code-block-actions">` +
        (isPreviewableLang(block.lang) ? `<button class="code-action-btn preview-btn" data-lang="${block.lang}" title="Preview in window">▶ Preview</button>` : '') +
        `<button class="code-action-btn copy-btn" title="Copy code">📋 Copy</button>` +
        `</div></div>` +
        `<pre><code class="language-${block.lang}">${escapedCode}</code></pre></div>`;
    });

    // ─── Restore inline code ───
    html = html.replace(/\x00INLINE_(\d+)\x00/g, (match, index) => {
      return `<code>${escapeHtml(inlineCodes[parseInt(index)])}</code>`;
    });

    // ─── Add HTML detected card for HTML code blocks ───
    html = html.replace(/(<div class="code-block" data-lang="html[^"]*"[^>]*>)/g, (match) => {
      return match; // We'll add the card via JS after rendering
    });

    return html;
  }

  function formatInline(text) {
    // Bold: **text** or __text__
    text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/__(.+?)__/g, '<strong>$1</strong>');
    // Italic: *text* or _text_
    text = text.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');
    text = text.replace(/(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, '<em>$1</em>');
    // Strikethrough: ~~text~~
    text = text.replace(/~~(.+?)~~/g, '<del>$1</del>');
    // Links: [text](url)
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    // Auto-links: <url>
    text = text.replace(/<(https?:\/\/[^>]+)>/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
    return text;
  }

  function escapeHtml(text) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return text.replace(/[&<>"']/g, c => map[c]);
  }

  function isPreviewableLang(lang) {
    const previewable = ['html', 'htm', 'css', 'js', 'javascript', 'svg'];
    return previewable.includes(lang.toLowerCase());
  }

  function extractCodeBlocks(markdown) {
    const blocks = [];
    const regex = /```(\w*)\n([\s\S]*?)```/g;
    let match;
    while ((match = regex.exec(markdown)) !== null) {
      blocks.push({
        language: match[1] || 'text',
        code: match[2],
        index: match.index,
        fullMatch: match[0]
      });
    }
    return blocks;
  }

  return { parse, extractCodeBlocks, isPreviewableLang };
})();

window.MarkdownParser = MarkdownParser;