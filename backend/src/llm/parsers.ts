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
 * Parse tags from a comma-separated response
 */
export function parseTags(response: string): string[] {
  if (!response || typeof response !== 'string') {
    return [];
  }

  // Clean up the response
  let text = response.trim();

  // Remove common prefixes
  const prefixes = [
    'Tags:',
    'Tags: ',
    'The tags are:',
    'The tags are: ',
    'Output:',
    'Output: ',
  ];

  for (const prefix of prefixes) {
    if (text.toLowerCase().startsWith(prefix.toLowerCase())) {
      text = text.substring(prefix.length).trim();
      break;
    }
  }

  // Remove markdown code blocks if present
  text = text.replace(/```[\s\S]*?```/g, '').trim();
  text = text.replace(/`([^`]+)`/g, '$1');

  // Parse tags - support both comma and semicolon separators
  const tags = text
    .split(/[,;]/)
    .map((tag) => tag.trim().toLowerCase())
    .filter((tag) => {
      // Filter out common non-tag words and validate
      const lower = tag.toLowerCase();
      return (
        tag.length > 0 &&
        tag.length < 30 &&
        !['tags', 'keywords', 'the', 'and', 'or', 'from', 'text', 'output'].includes(lower)
      );
    });

  return tags.slice(0, 10);
}
