import { dispatch } from '@wordpress/data';

import { BLOCK_ID_ATTRIBUTE } from '../constants';
import { runtimeState } from '../state/runtime-state';

const trackedIdListeners = new Set();

// Registers a listener called whenever a scan changes which blocks are tracked.
export const subscribeToTrackedIds = ( listener ) => {
	trackedIdListeners.add( listener );
	return () => trackedIdListeners.delete( listener );
};

export const notifyTrackedIdsChanged = () => {
	trackedIdListeners.forEach( ( listener ) => listener() );
};

// Returns the history ID tracked for a block, including one not yet written to its attributes.
// Duplicates that still carry another block's ID resolve to null.
export const getTrackedBlockId = ( block ) => {
	if ( ! block?.clientId ) {
		return null;
	}

	return (
		runtimeState.idByClientId.get( block.clientId ) ||
		runtimeState.identity.sessionIdByClientId.get( block.clientId ) ||
		null
	);
};

// Writes block ID attributes ('' clears one) without adding an undo level or dirtying the post.
export const writeBlockIdAttributes = ( writes ) => {
	if ( ! writes.size ) {
		return;
	}

	const attributesByClientId = {};
	for ( const [ clientId, blockId ] of writes ) {
		attributesByClientId[ clientId ] = {
			[ BLOCK_ID_ATTRIBUTE ]: blockId,
		};
	}

	const blockEditorDispatch = dispatch( 'core/block-editor' );
	blockEditorDispatch.__unstableMarkNextChangeAsNotPersistent();
	blockEditorDispatch.updateBlockAttributes(
		Array.from( writes.keys() ),
		attributesByClientId,
		{ uniqueByBlock: true }
	);
};
