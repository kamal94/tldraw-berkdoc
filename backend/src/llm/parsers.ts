/**
 * Parsing logic for LLM responses
 * Handles different response formats and extracts structured data
 */

/**
 * Parse a summary response from the model
 * The model should return a single sentence summary
 */
export function parseSummary(response: string): string {
  if (!response || typeof response !== 'string') {
    return '';
  }

  // Clean up the response
  let summary = response.trim();

  // Remove common prefixes that models might add
  const prefixes = [
    'Summary:',
    'Summary: ',
    'The summary is:',
    'The summary is: ',
    'Here is the summary:',
    'Here is the summary: ',
  ];

  for (const prefix of prefixes) {
    if (summary.toLowerCase().startsWith(prefix.toLowerCase())) {
      summary = summary.substring(prefix.length).trim();
      break;
    }
  }

  // Take only the first sentence if multiple sentences are returned
  const firstSentence = summary.split(/[.!?]+/)[0].trim();
  if (firstSentence.length > 0 && firstSentence.length < summary.length * 0.8) {
    // If first sentence is significantly shorter, use it
    summary = firstSentence + (summary.match(/[.!?]/) ? '.' : '');
  }

  return summary;
}

/**
 * Parse tags from various response formats:
 * - Comma-separated lists
 * - Numbered lists (1. Tag, 2. Tag, etc.)
 * - JSON arrays in markdown code blocks
 * - Mixed formats with intro text
 */
export function parseTags(response: string): string[] {
  if (!response || typeof response !== 'string') {
    return [];
  }

  // Clean up the response
  let text = response.trim();

  // Try to extract JSON array from markdown code blocks first
  // Match ```json [...] or ``` [...] with multiline support
  const jsonMatch = text.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/);
  if (jsonMatch) {
    try {
      const jsonArray = JSON.parse(jsonMatch[1]);
      if (Array.isArray(jsonArray)) {
        const tags = jsonArray
          .map((tag) => String(tag).trim().toLowerCase())
          .filter((tag) => {
            const lower = tag.toLowerCase();
            return (
              tag.length > 0 &&
              tag.length < 30 &&
              !['tags', 'keywords', 'the', 'and', 'or', 'from', 'text', 'output'].includes(lower)
            );
          });
        if (tags.length > 0) {
          return tags.slice(0, 10);
        }
      }
    } catch (e) {
      // If JSON parsing fails, continue with other methods
    }
  }

  // Remove markdown code blocks if present (but keep content)
  text = text.replace(/```[\s\S]*?```/g, '').trim();
  text = text.replace(/`([^`]+)`/g, '$1');

  // Remove common intro prefixes
  const introPatterns = [
    /^Here are \d+ canonical tags[^:]*:\s*/i,
    /^Here's? (?:a |an )?(?:comma-separated )?list of (?:up to \d+ )?canonical tags[^:]*:\s*/i,
    /^Here's? (?:a |an )?(?:breakdown of |list of )?the tags[^:]*:\s*/i,
    /^Tags?:\s*/i,
    /^The tags? are:\s*/i,
    /^Output:\s*/i,
    /^Here's? (?:a |an )?list[^:]*:\s*/i,
  ];

  for (const pattern of introPatterns) {
    text = text.replace(pattern, '').trim();
  }

  // Try to parse numbered list format (1. Tag, 2. Tag, etc.)
  const numberedListMatch = text.match(/^(?:\d+\.\s+[^\n]+(?:\n|$))+$/m);
  if (numberedListMatch) {
    const tags = text
      .split(/\n/)
      .map((line) => {
        // Match "1. Tag" or "1.  Tag" (with optional extra spaces)
        const match = line.match(/^\d+\.\s+(.+)$/);
        return match ? match[1].trim() : '';
      })
      .filter((tag) => tag.length > 0)
      .map((tag) => tag.toLowerCase())
      .filter((tag) => {
        const lower = tag.toLowerCase();
        return (
          tag.length > 0 &&
          tag.length < 30 &&
          !['tags', 'keywords', 'the', 'and', 'or', 'from', 'text', 'output'].includes(lower)
        );
      });
    
    if (tags.length > 0) {
      return tags.slice(0, 10);
    }
  }

  // Parse comma-separated or semicolon-separated tags
  // Split by comma or semicolon, but be smart about it
  const tags = text
    .split(/[,;]/)
    .map((tag) => {
      // Remove leading numbers and dots (e.g., "1. Tag" -> "Tag")
      tag = tag.replace(/^\d+\.\s*/, '').trim();
      return tag;
    })
    .map((tag) => tag.trim().toLowerCase())
    .filter((tag) => {
      // Filter out common non-tag words and validate
      const lower = tag.toLowerCase();
      return (
        tag.length > 0 &&
        tag.length < 30 &&
        !['tags', 'keywords', 'the', 'and', 'or', 'from', 'text', 'output', 'here', 'are', 'is', 'a', 'an', 'list', 'of', 'canonical', 'extracted', 'from', 'the', 'text', 'prioritizing', 'reusable', 'concepts', 'focusing', 'on', 'key', 'concepts', 'and', 'areas'].includes(lower)
      );
    });

  return tags.slice(0, 10);
}
