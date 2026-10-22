// Generates a compact fallback ID when randomUUID is unavailable.
const fallbackId = () =>
	`${ Date.now().toString( 36 ) }-${ Math.random()
		.toString( 36 )
		.slice( 2 ) }`;

// Returns a unique ID for blocks and snapshot records.
export const generateId = () =>
	typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
		? crypto.randomUUID()
		: fallbackId();
