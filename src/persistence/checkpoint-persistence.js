import { select } from '@wordpress/data';

import { CHECKPOINT_INTERVAL_MS } from '../constants';
import {
	clearDirtyBlock,
	getDirtyBlockIds,
} from '../change-detection/dirty-registry';
import { scanEditorBlocks } from '../change-detection/subscribe-store';
import { persistSnapshotIfChanged } from '../snapshots/snapshot-service';
import { runtimeState } from '../state/runtime-state';

// Persists snapshots for all dirty blocks and clears their dirty flags.
const runCheckpoint = async () => {
	if (
		runtimeState.checkpointInProgress ||
		runtimeState.isRestoringSnapshot
	) {
		return;
	}

	runtimeState.checkpointInProgress = true;

	try {
		const postId = select( 'core/editor' ).getCurrentPostId();
		if ( ! postId ) {
			return;
		}

		scanEditorBlocks();

		for ( const blockId of getDirtyBlockIds() ) {
			const block = runtimeState.blockByBlockId.get( blockId );

			// Clear first so edits made while this write is pending mark the block again.
			clearDirtyBlock( blockId );

			if ( block ) {
				await persistSnapshotIfChanged( blockId, block, postId );
			}
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
