import { select } from '@wordpress/data';

import { CHECKPOINT_INTERVAL_MS } from '../constants';
import {
	clearDirtyBlock,
	getDirtyBlockIds,
} from '../change-detection/dirty-registry';
import { scanEditorBlocks } from '../change-detection/subscribe-store';
import {
	persistSnapshotIfChanged,
	runSnapshotExpiryCleanup,
} from '../snapshots/snapshot-service';
import { runtimeState } from '../state/runtime-state';

const logError = ( error ) => {
	// eslint-disable-next-line no-console
	console.error( 'LEHFG checkpoint error:', error );
};

// Persists snapshots for all dirty blocks and clears their dirty flags.
export const runCheckpoint = async () => {
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
		runCheckpoint().catch( logError );
	}, CHECKPOINT_INTERVAL_MS );
};

// Saves pending edits and removes expired history when the tab is hidden or closed,
// so the last minute of work is not lost and cleanup does not depend on the timers.
export const startFlushOnPageHide = () => {
	const flush = () => {
		runCheckpoint().catch( logError );
		runSnapshotExpiryCleanup().catch( logError );
	};

	document.addEventListener( 'visibilitychange', () => {
		if ( document.visibilityState === 'hidden' ) {
			flush();
		}
	} );
	window.addEventListener( 'pagehide', flush );
};
