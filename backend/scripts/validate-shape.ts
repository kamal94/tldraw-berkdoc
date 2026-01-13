import { makePermissiveSchema } from '../src/boards/permissive_scheme.js';
import { schema as roomSchema } from '../src/boards/boards.room-manager.js';

const testObject = {
	id: 'shape:doc_1767941930946_tyozlr9',
	typeName: 'shape',
	type: 'document',
	x: -150,
	y: 340,
	rotation: 0,
	index: 'a30',
	parentId: 'page:page',
	isLocked: false,
	opacity: 1,
	props: {
		w: 300,
		h: 140,
		title: 'SSIR.The Four Principles of Purpose-Driven Board Leadership-1 (1).pdf',
		url: 'https://drive.google.com/file/d/18yzkK51VoDHbw5GvmYTqroRDoFJV55He/view?usp=drivesdk',
		source: 'google-drive',
		contributors: [],
		tags: [],
	},
	meta: {},
};

console.log('Validating object against permissive schema...\n');
console.log('Object to validate:');
console.log(JSON.stringify(testObject, null, 2));
console.log('\n' + '='.repeat(80) + '\n');

const schema = makePermissiveSchema();
// const schema = roomSchema;
const shapeType = schema.getType('shape');

if (!shapeType) {
	console.error('Error: Could not get shape type from schema');
	process.exit(1);
}

const validator = shapeType.validator;

if (!validator) {
	console.error('Error: Shape type does not have a validator');
	process.exit(1);
}

try {
	const result = validator.validate(testObject);
	console.log('✅ Validation passed!');
	console.log('\nValidated object:');
	console.log(JSON.stringify(result, null, 2));
} catch (error: any) {
	console.error('❌ Validation failed!\n');
	
	// Extract error message
	const errorMessage = error.message || String(error);
	console.error('Error:', errorMessage);
	
	// Try to identify which field caused the error
	const fieldMatch = errorMessage.match(/At (\w+):/);
	if (fieldMatch) {
		const fieldName = fieldMatch[1];
		console.error(`\n📍 Field with error: "${fieldName}"`);
		console.error(`   Current value: ${JSON.stringify((testObject as any)[fieldName])}`);
	}
	
	if (error.cause) {
		console.error('\nCause:', error.cause);
	}
	
	if (error.errors) {
		console.error('\nValidation errors:');
		console.error(JSON.stringify(error.errors, null, 2));
	}
	
	// Show full error details in verbose mode (commented out by default)
	// if (error instanceof Error && error.stack) {
	// 	console.error('\nError stack:');
	// 	console.error(error.stack);
	// }
	
	console.error('\n💡 Tip: Check the error message above to see what needs to be fixed.');
	process.exit(1);
}
