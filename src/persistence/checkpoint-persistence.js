import { select } from '@wordpress/data';

import { CHECKPOINT_INTERVAL_MS } from '../constants';
import { clearDirtyBlock, getDirtyBlockIds } from '../change-detection/dirty-registry';
import { findBlockByLehfgBlockId } from '../selectors/block-tree';
import { persistSnapshotForBlockIfChanged } from '../snapshots/snapshot-service';
import { runtimeState } from '../state/runtime-state';

// Persists snapshots for all dirty blocks and clears their dirty flags.
const runCheckpoint = async () => {
	if ( runtimeState.checkpointInProgress || runtimeState.isRestoringSnapshot ) {
		return;
	}

	runtimeState.checkpointInProgress = true;

	try {
		const postId = select( 'core/editor' ).getCurrentPostId();
		if ( ! postId ) {
			return;
		}

		const dirtyBlockIds = getDirtyBlockIds();
		for ( const blockId of dirtyBlockIds ) {
			const block = findBlockByLehfgBlockId( blockId );
			if ( block ) {
				await persistSnapshotForBlockIfChanged( block, postId );
			}

			clearDirtyBlock( blockId );
		}
	} finally {
		runtimeState.checkpointInProgress = false;
	}
};

// Starts the 1-minute checkpoint scheduler once per session.
export const startCheckpointPersistence = () => {
	if ( runtimeState.checkpointTimerId ) {
		return;
	}

	runtimeState.checkpointTimerId = setInterval( () => {
		runCheckpoint().catch( ( error ) => {
			// eslint-disable-next-line no-console
			console.error( 'LEHFG checkpoint error:', error );
		} );
	}, CHECKPOINT_INTERVAL_MS );
};
