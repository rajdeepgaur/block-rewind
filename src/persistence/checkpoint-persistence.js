import { select } from '@wordpress/data';

import { CHECKPOINT_INTERVAL_MS, CHECKPOINT_TICK_MS } from '../constants';
import {
	clearDirtyBlock,
	getDirtyBlockIds,
} from '../change-detection/dirty-registry';
import { scanEditorBlocks } from '../change-detection/subscribe-store';
import {
	getLastSaved,
	persistSnapshotIfChanged,
	persistSnapshotsNow,
	runSnapshotExpiryCleanup,
} from '../snapshots/snapshot-service';
import { runtimeState } from '../state/runtime-state';

const logError = ( error ) => {
	// eslint-disable-next-line no-console
	console.error( 'Block Rewind checkpoint error:', error );
};

const isDue = ( blockId, now ) =>
	now - ( getLastSaved( blockId )?.timestamp || 0 ) >= CHECKPOINT_INTERVAL_MS;

/**
 * Saves edited blocks whose latest version is at least a minute old.
 *
 * Each block keeps its own one-minute rhythm, so a block's first snapshot and its
 * next checkpoint are never seconds apart. Blocks that are not due stay marked as
 * edited and are saved on a later tick.
 */
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
		const now = Date.now();

		for ( const blockId of getDirtyBlockIds() ) {
			if ( ! isDue( blockId, now ) ) {
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

/**
 * Saves every edited block while the page unloads (reload, close, navigation).
 *
 * Everything runs synchronously and ends in a single write transaction, because the
 * page is gone before any awaited work could run. New baselines found by the final
 * scan are written in the same transaction, before the edits that follow them.
 * Running twice is harmless: the second run finds nothing new to save.
 */
const saveAllBeforeUnload = () => {
	if ( runtimeState.isRestoringSnapshot ) {
		return;
	}

	try {
		const postId = select( 'core/editor' ).getCurrentPostId();
		const { baselines } = scanEditorBlocks( { persistBaselines: false } );
		const dirtyBlockIds = getDirtyBlockIds();
		const entries = [
			...baselines,
			...dirtyBlockIds.map( ( blockId ) => ( {
				blockId,
				block: runtimeState.blockByBlockId.get( blockId ),
			} ) ),
		];

		if ( persistSnapshotsNow( entries, postId ) ) {
			dirtyBlockIds.forEach( clearDirtyBlock );
		}
	} catch ( error ) {
		logError( error );
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
// reloading the page saves every edited block, since unsaved work would be lost.
export const startFlushOnPageHide = () => {
	document.addEventListener( 'visibilitychange', () => {
		if ( document.visibilityState === 'hidden' ) {
			runCheckpoint().catch( logError );
			runSnapshotExpiryCleanup().catch( logError );
		}
	} );

	// Browsers drop IndexedDB writes started in pagehide or unload during a reload;
	// only a write started in beforeunload reliably completes. pagehide still covers
	// browsers that skip beforeunload (mobile, back/forward cache). Neither handler
	// calls preventDefault(), so WordPress's own "unsaved changes" prompt is unaffected.
	window.addEventListener( 'beforeunload', saveAllBeforeUnload );
	window.addEventListener( 'pagehide', saveAllBeforeUnload );
};
