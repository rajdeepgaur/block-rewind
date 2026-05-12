// Generates a compact fallback ID when randomUUID is unavailable.
const fallbackId = () => `${ Date.now().toString( 36 ) }-${ Math.random().toString( 36 ).slice( 2 ) }`;

// Returns a persistent plugin-specific block ID.
export const generateBlockId = () => {
	if ( typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ) {
		return `lehfg-${ crypto.randomUUID() }`;
	}

	return `lehfg-${ fallbackId() }`;
};

// Returns a unique snapshot ID for IndexedDB records.
export const generateSnapshotId = () => {
	if ( typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ) {
		return crypto.randomUUID();
	}

	return fallbackId();
};
