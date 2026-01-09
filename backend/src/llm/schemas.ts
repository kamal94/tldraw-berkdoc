/**
 * Zod schemas for validating LLM structured outputs
 * These schemas ensure consistent parsing of model responses
 */
import { z } from "zod";

/**
 * Schema for summary response
 * Expected format: { summary: string }
 */
export const SummaryResponseSchema = z.object({
  summary: z.string().min(1).max(500),
});

/**
 * Schema for tags response
 * Expected format: { tags: string[] }
 */
export const TagsResponseSchema = z.object({
  tags: z
    .array(z.string().min(1).max(50))
    .min(0)
    
});

/**
 * Type exports for TypeScript inference
 */
export type SummaryResponse = z.infer<typeof SummaryResponseSchema>;
export type TagsResponse = z.infer<typeof TagsResponseSchema>;
