/**
 * OpenLLM Chat — Image Handler
 * Processes and scores images extracted from web pages.
 */

const ImageHandler = (() => {
  /**
   * Score images by relevance to search terms.
   */
  function scoreImages(images, searchTerms = []) {
    return images.map(img => {
      let score = 0;

      // Prefer images with alt text
      if (img.alt) score += 10;

      // Prefer larger alt text (likely more descriptive)
      score += Math.min(img.alt.length, 50);

      // Boost if search terms found in alt text
      if (searchTerms.length) {
        searchTerms.forEach(term => {
          if (img.alt.toLowerCase().includes(term.toLowerCase())) score += 100;
          if (img.src.toLowerCase().includes(term.toLowerCase())) score += 50;
        });
      }

      // Penalize common non-content image patterns
      const nonContentPatterns = [
        /logo/i, /icon/i, /avatar/i, /badge/i, /banner/i,
        /spinner/i, /loading/i, /pixel/i, /tracker/i,
        /\.svg$/i, /1x1/i, /spacer/i,
      ];

      for (const pattern of nonContentPatterns) {
        if (pattern.test(img.alt) || pattern.test(img.src)) {
          score -= 50;
          break;
        }
      }

      return { ...img, score };
    }).sort((a, b) => b.score - a.score);
  }

  /**
   * Filter images to only include content images.
   */
  function filterContentImages(images, maxImages = 5) {
    return images
      .filter(img => {
        // Skip very small images (likely icons/spacers)
        if (img.src.includes('1x1') || img.src.includes('spacer')) return false;
        // Skip SVGs (likely logos/icons)
        if (img.src.endsWith('.svg')) return false;
        // Skip data URIs (embedded, often small)
        if (img.src.startsWith('data:')) return false;
        return true;
      })
      .slice(0, maxImages);
  }

  return { scoreImages, filterContentImages };
})();

window.ImageHandler = ImageHandler;