/**
 * Parsing logic for LLM responses
 * Handles different response formats and extracts structured data
 * Uses Zod schemas for structured validation with fallback to legacy parsing
 */

import {
  SummaryResponseSchema,
  TagsResponseSchema,
} from "./schemas.js";

/**
 * Parse a summary response from the model
 * First tries to parse as JSON using Zod schema, then falls back to legacy parsing
 */
export function parseSummary(response: string): string {
  if (!response || typeof response !== 'string') {
    return '';
  }

  const text = response.trim();

  // Try to parse as JSON first (structured output)
  try {
    // Extract JSON from markdown code blocks if present
    const jsonMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*(?:```)?/);
    // console.log("json match:", jsonMatch)
    const jsonText = jsonMatch ? jsonMatch[1] : text;

    // Try to parse as JSON
    const parsed = JSON.parse(jsonText);
    const validated = SummaryResponseSchema.parse(parsed);
    return validated.summary.trim();
  } catch {
    // If JSON parsing fails, fall back to returning empty string
  }
  return '';
}

/**
 * Parse tags from various response formats:
 * - JSON objects with tags array (preferred, validated with Zod)
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
  const text = response.trim();

  // Try to parse as JSON first (structured output with Zod validation)
  try {
    // Extract JSON from markdown code blocks if present
    const jsonMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    const jsonText = jsonMatch ? jsonMatch[1] : text;
    console.log("1json text:", jsonText)
    // Try to parse as JSON object
    const parsed = JSON.parse(jsonText);
    const validated = TagsResponseSchema.parse(parsed);
    // Normalize tags: lowercase, trim, filter invalid ones
    const normalizedTags = validated.tags
      .map((tag) => String(tag).trim().toLowerCase())
      .filter((tag) => {
        const lower = tag.toLowerCase();
        return (
          tag.length > 0 &&
          tag.length < 30 &&
          !['tags', 'keywords', 'the', 'and', 'or', 'from', 'text', 'output'].includes(lower)
        );
      });

    return normalizedTags.slice(0, 10);
  } catch (e) {
    // If JSON object parsing fails, try JSON array format
    try {
      const jsonArrayMatch = text.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/);
      const arrayText = jsonArrayMatch ? jsonArrayMatch[1] : text;
      console.log("2json text:", arrayText)
      const jsonArray = JSON.parse(arrayText);

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
    } catch {
      // If JSON array parsing fails, return empty array
    }
  }

  return [];
}
