/**
 * OpenLLM Chat — Tool Definitions
 * JSON Schema definitions for all available tools.
 */

const TOOL_DEFINITIONS = {
  web_search: {
    name: 'web_search',
    description: 'Search the web using DuckDuckGo. Returns a list of results with titles, URLs, and snippets. Use this when you need current information, facts, or data that may not be in your training data.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query. Be specific and concise.',
        },
        pageSize: {
          type: 'integer',
          description: 'Number of results (1-10). Default: 5',
          minimum: 1,
          maximum: 10,
        },
        safeSearch: {
          type: 'string',
          enum: ['strict', 'moderate', 'off'],
          description: 'Safe search level. Default: moderate',
        },
      },
      required: ['query'],
    },
  },

  image_search: {
    name: 'image_search',
    description: 'Search for images on DuckDuckGo. Returns image URLs with descriptions.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Image search query',
        },
        pageSize: {
          type: 'integer',
          description: 'Number of results (1-10). Default: 5',
          minimum: 1,
          maximum: 10,
        },
      },
      required: ['query'],
    },
  },

  visit_website: {
    name: 'visit_website',
    description: 'Visit a website and extract its title, headings, links, images, and text content. Use this to get detailed information from a URL found via web_search, or any URL the user provides.',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          format: 'uri',
          description: 'The URL of the website to visit',
        },
        findInPage: {
          type: 'array',
          items: { type: 'string' },
          description: 'Search terms to prioritize relevant content, links, and images. HIGHLY RECOMMENDED for targeted information extraction.',
        },
        maxLinks: {
          type: 'integer',
          minimum: 0,
          maximum: 200,
          description: 'Max links to extract. Default: 20',
        },
        maxImages: {
          type: 'integer',
          minimum: 0,
          maximum: 50,
          description: 'Max images to extract. Default: 5',
        },
        contentLimit: {
          type: 'integer',
          minimum: 0,
          maximum: 10000,
          description: 'Max text content chars. Default: 3000',
        },
      },
      required: ['url'],
    },
  },
};

window.TOOL_DEFINITIONS = TOOL_DEFINITIONS;