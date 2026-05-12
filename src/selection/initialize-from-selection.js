import { select } from '@wordpress/data';

import { getLehfgBlockId, assignLehfgBlockId } from '../identity/block-identity';
import { ensureInitialSnapshotForBlock, listSnapshotsForBlock } from '../snapshots/snapshot-service';
import { runtimeState } from '../state/runtime-state';
import { generateBlockId } from '../utils/generate-id';

// Idempotently initializes tracking for the currently selected block.
export const initializeBlockFromSelection = async ( selectedClientId ) => {
	if ( ! selectedClientId ) {
		return;
	}

	if ( runtimeState.selectionInitInFlight.has( selectedClientId ) ) {
		return;
	}

	runtimeState.selectionInitInFlight.add( selectedClientId );

	try {
		const blockEditorSelect = select( 'core/block-editor' );
		const editorSelect = select( 'core/editor' );

		let block = blockEditorSelect.getBlock( selectedClientId );
		if ( ! block ) {
			return;
		}

		let blockId = getLehfgBlockId( block );

		if ( ! blockId ) {
			runtimeState.isAssigningBlockId = true;
			try {
				blockId = generateBlockId();
				assignLehfgBlockId( selectedClientId, blockId );
			} finally {
				runtimeState.isAssigningBlockId = false;
			}

			block = blockEditorSelect.getBlock( selectedClientId );
			if ( ! block ) {
				return;
			}
		}

		const postId = editorSelect.getCurrentPostId();
		if ( ! postId ) {
			return;
		}

		const snapshots = await listSnapshotsForBlock( postId, blockId );
		if ( snapshots.length === 0 ) {
			await ensureInitialSnapshotForBlock( block, postId );
		}
	} finally {
		runtimeState.selectionInitInFlight.delete( selectedClientId );
	}
};
