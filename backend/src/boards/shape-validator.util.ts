import { schema as roomSchema } from './boards.room-manager.js';
import type { TLBaseShape } from '@tldraw/tlschema';

/**
 * Validates a shape object and returns a readable error message if validation fails.
 * @param shape The shape object to validate
 * @returns null if validation passes, or a readable error message string if it fails
 */
export function validateShape(shape: unknown): { valid: true } | { valid: false; error: string } {
  try {
    const schema = roomSchema;
    // @ts-expect-error - schema is a TLSchema
    const shapeType = schema.getType('shape');

    if (!shapeType) {
      return {
        valid: false,
        error: 'Validation error: Could not get shape type from schema',
      };
    }

    const validator = shapeType.validator;

    if (!validator) {
      return {
        valid: false,
        error: 'Validation error: Shape type does not have a validator',
      };
    }

    // Validate the shape
    validator.validate(shape);
    return { valid: true };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    // Extract error message
    const errorMessage = error.message || String(error);

    // Try to identify which field caused the error
    const fieldMatch = errorMessage.match(/At (\w+):/);
    let readableError = `Shape validation failed: ${errorMessage}`;

    if (fieldMatch) {
      const fieldName = fieldMatch[1];
      // @ts-expect-error - shape is a TLBaseShape
      const fieldValue = shape?.[fieldName];
      readableError = `Shape validation failed at field "${fieldName}": ${errorMessage}. Current value: ${JSON.stringify(fieldValue)}`;
    }

    // Add additional context if available
    if (error.cause) {
      readableError += `\nCause: ${error.cause}`;
    }

    if (error.errors) {
      readableError += `\nValidation errors: ${JSON.stringify(error.errors, null, 2)}`;
    }

    return {
      valid: false,
      error: readableError,
    };
  }
}
