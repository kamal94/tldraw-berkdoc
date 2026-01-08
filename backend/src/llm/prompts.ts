/**
 * Prompt templates for LLM tasks
 * These prompts are constructed in the backend and sent to the model service
 */

/**
 * Build a prompt for generating a one-sentence summary
 */
export function buildSummaryPrompt(content: string): string {
  // Clean and truncate content to avoid context window issues
  const cleanedContent = content.replace(/\s+/g, ' ').trim();
  return `Summarize the following text in one concise sentence: ${cleanedContent}`;
}

/**
 * Build a prompt for extracting tags from content
 */
export function buildTagsPrompt(content: string): string {
  const cleanedContent = content.replace(/\s+/g, ' ').trim();
  return `Extract up to 10 canonical tags from the <TEXT> section.

Rules:
- Tags should represent reusable concepts, not phrasing from the sentence
- Normalize similar ideas into a single tag
- Prefer standard industry terms when applicable
- 1–3 words per tag
- lowercase only
- Return a comma-separated list and nothing else

<TEXT>
${cleanedContent}
</TEXT>
`;
}
