import { select } from '@wordpress/data';

import { CHECKPOINT_INTERVAL_MS, CHECKPOINT_TICK_MS } from '../constants';
import {
	clearDirtyBlock,
	getDirtyBlockIds,
} from '../change-detection/dirty-registry';
import { scanEditorBlocks } from '../change-detection/subscribe-store';
import {
	persistSnapshotIfChanged,
	runSnapshotExpiryCleanup,
	subscribeToSnapshotChanges,
} from '../snapshots/snapshot-service';
import { runtimeState } from '../state/runtime-state';

// blockId -> time of the block's latest saved version (from any trigger).
const lastSavedAtByBlockId = new Map();

subscribeToSnapshotChanges( ( snapshot ) => {
	lastSavedAtByBlockId.set( snapshot.blockId, snapshot.timestamp );
} );

const logError = ( error ) => {
	// eslint-disable-next-line no-console
	console.error( 'Block Rewind checkpoint error:', error );
};

const isDue = ( blockId, now ) =>
	now - ( lastSavedAtByBlockId.get( blockId ) || 0 ) >=
	CHECKPOINT_INTERVAL_MS;

/**
 * Saves edited blocks whose latest version is at least a minute old.
 *
 * Each block keeps its own one-minute rhythm, so a block's first snapshot and its
 * next checkpoint are never seconds apart. Blocks that are not due stay marked as
 * edited and are saved on a later tick.
 *
 * @param {Object}  options       Options.
 * @param {boolean} options.force Save every edited block now, e.g. when the page closes.
 */
export const runCheckpoint = async ( { force = false } = {} ) => {
	if ( runtimeState.isRestoringSnapshot ) {
		return;
	}

	// Writes are queued, so a forced save may overlap a running checkpoint safely.
	if ( runtimeState.checkpointInProgress && ! force ) {
		return;
	}

	runtimeState.checkpointInProgress = true;

	try {
		const postId = select( 'core/editor' ).getCurrentPostId();
		if ( ! postId ) {
			return;
		}

		scanEditorBlocks();
		const now = Date.now();

		for ( const blockId of getDirtyBlockIds() ) {
			if ( ! force && ! isDue( blockId, now ) ) {
				continue;
			}

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

// Starts the checkpoint scheduler once per session.
export const startCheckpointPersistence = () => {
	if ( runtimeState.checkpointTimerId ) {
		return;
	}

	runtimeState.checkpointTimerId = setInterval( () => {
		runCheckpoint().catch( logError );
	}, CHECKPOINT_TICK_MS );
};

// Switching tabs saves blocks that are due, like a regular checkpoint. Leaving or
// closing the page saves every edited block, since unsaved work would be lost.
export const startFlushOnPageHide = () => {
	document.addEventListener( 'visibilitychange', () => {
		if ( document.visibilityState === 'hidden' ) {
			runCheckpoint().catch( logError );
			runSnapshotExpiryCleanup().catch( logError );
		}
	} );

	window.addEventListener( 'pagehide', () => {
		runCheckpoint( { force: true } ).catch( logError );
	} );
};
