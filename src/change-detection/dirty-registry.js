const dirtyBlockIds = new Set();

// Flags a tracked block as changed since the last checkpoint.
export const markBlockDirty = ( blockId ) => {
	if ( blockId ) {
		dirtyBlockIds.add( blockId );
	}
};

// Clears dirty state for a block after checkpoint handling.
export const clearDirtyBlock = ( blockId ) => {
	dirtyBlockIds.delete( blockId );
};

// Returns a snapshot of all currently dirty block IDs.
export const getDirtyBlockIds = () => Array.from( dirtyBlockIds );

// Removes dirty entries for blocks that no longer exist in the editor.
export const pruneDirtyBlocks = ( validBlockIds ) => {
	for ( const dirtyBlockId of dirtyBlockIds ) {
		if ( ! validBlockIds.has( dirtyBlockId ) ) {
			dirtyBlockIds.delete( dirtyBlockId );
		}
	}
};
