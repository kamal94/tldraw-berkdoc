import {
  createTLSchema,
  defaultBindingSchemas,
  defaultShapeSchemas,
} from '@tldraw/tlschema';
import { T } from '@tldraw/validate';

/**
 * Canonical tldraw schema for BerkDoc boards.
 *
 * This is the single source of truth for the board schema. It is consumed by
 * BOTH the local NestJS sync gateway (`BoardsRoomManager`) and the Cloudflare
 * Durable Object sync worker (`sync-worker/`). The two MUST use a byte-identical
 * schema -- any divergence in shape props/validators would corrupt realtime
 * sync and persisted snapshots.
 */

export const documentShapePropsValidators = {
  w: T.number,
  h: T.number,
  title: T.string,
  url: T.string,
  source: T.string.optional().nullable(),
  contributors: T.arrayOf(
    T.object({
      name: T.string,
      email: T.string.optional().nullable(),
      avatarUrl: T.string.optional(),
      color: T.string,
    }),
  ),
  tags: T.arrayOf(T.string),
  summary: T.string.optional(),
} as const;

export const collectionShapePropsValidators = {
  w: T.number,
  h: T.number,
  label: T.string,
  documentIds: T.arrayOf(T.string),
  color: T.string,
  dash: T.string,
} as const;

/** The concrete schema type returned by {@link createBerkdocTLSchema}. */
export type BerkdocTLSchema = ReturnType<typeof createTLSchema>;

/**
 * Build the BerkDoc tldraw schema (default shapes/bindings plus the custom
 * `document` and `collection` shapes). Returns a fresh schema instance.
 */
export function createBerkdocTLSchema(): BerkdocTLSchema {
  return createTLSchema({
    shapes: {
      ...defaultShapeSchemas,
      document: {
        props: documentShapePropsValidators,
      },
      collection: {
        props: collectionShapePropsValidators,
      },
    },
    bindings: defaultBindingSchemas,
  });
}
