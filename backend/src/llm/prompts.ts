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
  return `Style constraints:
- Use an impersonal, agentless voice.
- Do not reference the document, author, or reader (avoid phrases like "this document", "the report", "we", or "you").
- Write in a title-like, ultra-compressed style.
- Prefer a noun phrase or gerund phrase over a full sentence.
- Use present tense with no temporal framing.

Summarize the following text in one concise sentence.
Return your response as valid JSON in this exact format:
{
  "summary": "your one-sentence summary here"
}

Text to summarize:
${cleanedContent}`;
}

/**
 * Build a prompt for extracting tags from content
 */
export function buildTagsPrompt(content: string): string {
  const cleanedContent = content.replace(/\s+/g, ' ').trim();
  return `Extract up to 5 canonical tags from the <TEXT> section.

Rules:
- Tags should represent reusable concepts, not phrasing from the sentence
- Normalize similar ideas into a single tag
- Prefer standard industry terms when applicable
- 1–3 words per tag
- lowercase only
- Return your response as valid JSON in this exact format:
{
  "tags": ["tag1", "tag2", "tag3"]
}

<TEXT>
${cleanedContent}
</TEXT>
`;
}
