import { schema as roomSchema } from './boards.room-manager.js';

/**
 * Validates a shape object and returns a readable error message if validation fails.
 * @param shape The shape object to validate
 * @returns Object with valid flag and optional error message
 */
export function validateShape(
  shape: unknown,
): { valid: true } | { valid: false; error: string } {
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

    validator.validate(shape);
    return { valid: true };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    return {
      valid: false,
      error: formatValidationError(error, shape),
    };
  }
}

/**
 * Format validation error into a readable message
 */
function formatValidationError(error: Error, shape: unknown): string {
  const errorMessage = error.message || String(error);
  const fieldMatch = errorMessage.match(/At (\w+):/);

  if (!fieldMatch) {
    return buildBaseErrorMessage(error, errorMessage);
  }

  const fieldName = fieldMatch[1];
  // @ts-expect-error - shape is a TLBaseShape
  const fieldValue = shape?.[fieldName];
  return `Shape validation failed at field "${fieldName}": ${errorMessage}. Current value: ${JSON.stringify(fieldValue)}${getAdditionalErrorContext(error)}`;
}

/**
 * Build base error message with additional context
 */
function buildBaseErrorMessage(error: Error, errorMessage: string): string {
  return `Shape validation failed: ${errorMessage}${getAdditionalErrorContext(error)}`;
}

/**
 * Get additional error context if available
 */
function getAdditionalErrorContext(error: Error): string {
  let context = '';

  if (error.cause) {
    context += `\nCause: ${error.cause}`;
  }

  if ('errors' in error && error.errors) {
    context += `\nValidation errors: ${JSON.stringify(error.errors, null, 2)}`;
  }

  return context;
}
