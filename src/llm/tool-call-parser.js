/**
 * OpenLLM Chat — Universal Tool Call Parser
 * Normalizes tool calls from different provider formats.
 */

const ToolCallParser = (() => {
  /**
   * Parse tool calls from an OpenAI-format response.
   * OpenAI: response.choices[0].message.tool_calls
   */
  function parseOpenAI(response) {
    const message = response.choices?.[0]?.message;
    if (!message?.tool_calls) return [];

    return message.tool_calls.map(tc => ({
      id: tc.id || `call_${Date.now()}`,
      name: tc.function?.name || '',
      arguments: tc.function?.arguments || '{}',
    }));
  }

  /**
   * Parse tool calls from an Anthropic-format response.
   * Anthropic: response.content blocks with type:"tool_use"
   */
  function parseAnthropic(response) {
    const contentBlocks = response.content || [];
    return contentBlocks
      .filter(block => block.type === 'tool_use')
      .map(block => ({
        id: block.id || `call_${Date.now()}`,
        name: block.name || '',
        arguments: JSON.stringify(block.input || {}),
      }));
  }

  /**
   * Parse tool calls from a Google Gemini-format response.
   * Gemini: response.candidates[0].content.parts with functionCall
   */
  function parseGoogle(response) {
    const parts = response.candidates?.[0]?.content?.parts || [];
    return parts
      .filter(part => part.functionCall)
      .map(part => ({
        id: `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name: part.functionCall.name || '',
        arguments: JSON.stringify(part.functionCall.args || {}),
      }));
  }

  /**
   * Parse tool calls embedded in plain text (Tier 2: prompt injection).
   * Looks for patterns like:
   *   [TOOL_CALL]{"name": "...", "arguments": {...}}[/TOOL_CALL]
   *   ```json\n{"tool": "...", "arguments": {...}}\n```
   *   Action: web_search\nAction Input: {"query": "..."}
   */
  function parseFromText(text) {
    const toolCalls = [];

    // Pattern 1: [TOOL_CALL]...[/TOOL_CALL]
    const pattern1 = /\[TOOL_CALL\]\s*([\s\S]*?)\s*\[\/TOOL_CALL\]/g;
    let match;
    while ((match = pattern1.exec(text)) !== null) {
      try {
        const parsed = JSON.parse(match[1].trim());
        toolCalls.push({
          id: `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          name: parsed.name || parsed.tool || '',
          arguments: JSON.stringify(parsed.arguments || parsed.args || parsed.params || {}),
        });
      } catch (e) {
        console.warn('[ToolCallParser] Failed to parse TOOL_CALL block:', match[1]);
      }
    }

    if (toolCalls.length > 0) return toolCalls;

    // Pattern 2: ```json\n{"tool": "...", ...}\n```
    const pattern2 = /```json\s*\n?\s*(\{[\s\S]*?"(?:name|tool|function)"[\s\S]*?\})\s*\n?\s*```/g;
    while ((match = pattern2.exec(text)) !== null) {
      try {
        const parsed = JSON.parse(match[1].trim());
        if (parsed.name || parsed.tool || parsed.function) {
          toolCalls.push({
            id: `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            name: parsed.name || parsed.tool || parsed.function || '',
            arguments: JSON.stringify(parsed.arguments || parsed.args || parsed.parameters || {}),
          });
        }
      } catch (e) {
        // Not a valid tool call JSON
      }
    }

    if (toolCalls.length > 0) return toolCalls;

    // Pattern 3: Action: tool_name\nAction Input: {...}
    const pattern3 = /Action:\s*(\w+)\s*\n\s*Action Input:\s*(\{[\s\S]*?\})/g;
    while ((match = pattern3.exec(text)) !== null) {
      try {
        toolCalls.push({
          id: `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          name: match[1].trim(),
          arguments: match[2].trim(),
        });
      } catch (e) {
        // Skip
      }
    }

    return toolCalls;
  }

  /**
   * Parse tool calls based on the format type.
   * @param {object|string} response - Provider response or text
   * @param {string} format - 'openai' | 'anthropic' | 'google' | 'prompt'
   * @returns {array} Array of {id, name, arguments}
   */
  function parse(response, format) {
    switch (format) {
      case 'openai':
        return parseOpenAI(response);
      case 'anthropic':
        return parseAnthropic(response);
      case 'google':
        return parseGoogle(response);
      case 'prompt':
        return parseFromText(typeof response === 'string' ? response : response?.textContent || '');
      default:
        return [];
    }
  }

  /**
   * Build tool definitions in the format required by the provider.
   */
  function buildToolDefinitions(tools, format) {
    if (!tools || tools.length === 0) return undefined;

    switch (format) {
      case 'openai':
        return tools.map(t => ({
          type: 'function',
          function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          },
        }));

      case 'anthropic':
        return tools.map(t => ({
          name: t.name,
          description: t.description,
          input_schema: t.parameters,
        }));

      case 'google':
        return [{
          functionDeclarations: tools.map(t => ({
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          })),
        }];

      default:
        return undefined;
    }
  }

  /**
   * Build the system prompt injection for Tier 2 (prompt-based tool calling).
   */
  function buildPromptInjection(tools) {
    if (!tools || tools.length === 0) return '';

    const toolDescriptions = tools.map(t => {
      const params = t.parameters?.properties
        ? Object.entries(t.parameters.properties)
            .map(([key, val]) => `    - "${key}" (${val.type || 'any'}${t.parameters.required?.includes(key) ? ', required' : ', optional'}): ${val.description || ''}`)
            .join('\n')
        : '    (no parameters)';

      return `### ${t.name}
${t.description}
Parameters:
${params}`;
    }).join('\n\n');

    return `

# Available Tools

You have access to the following tools. To use a tool, output EXACTLY:

[TOOL_CALL]
{"name": "tool_name", "arguments": {"param1": "value1"}}
[/TOOL_CALL]

You may use multiple tool calls in a single response. After receiving tool results, you should analyze them and either use more tools or provide your final answer.

Available tools:
${toolDescriptions}

IMPORTANT:
- Use tools when you need current information, facts, or data from the web
- You can use web_search first to find relevant URLs, then visit_website for details
- Always analyze tool results before responding
- Do NOT repeat tool results verbatim — synthesize and explain
- If a tool returns an error, try a different approach
- After receiving tool results, provide your final answer in normal text (NOT in [TOOL_CALL] format)
`;
  }

  return {
    parse,
    parseOpenAI,
    parseAnthropic,
    parseGoogle,
    parseFromText,
    buildToolDefinitions,
    buildPromptInjection,
  };
})();

window.ToolCallParser = ToolCallParser;