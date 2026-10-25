import { subscribe } from '@wordpress/data';

import { CHECKPOINT_INTERVAL_MS, CHECKPOINT_TICK_MS } from '../constants';
import {
	clearDirtyBlock,
	getDirtyBlockIds,
	markBlockDirty,
} from '../change-detection/dirty-registry';
import { scanEditorBlocks } from '../change-detection/subscribe-store';
import { isEditingSharedContent } from '../selectors/edited-entity';
import {
	getLastSaved,
	persistSnapshotIfChanged,
	persistSnapshotsNow,
	runSnapshotExpiryCleanup,
} from '../snapshots/snapshot-service';
import { runtimeState } from '../state/runtime-state';
import { isQuotaExceededError } from '../state/storage-status';

const logError = ( error ) => {
	// eslint-disable-next-line no-console
	console.error( 'Block Rewind checkpoint error:', error );
};

// A full storage is shown in the sidebar instead of being logged on every attempt.
const logWriteError = ( error ) => {
	if ( ! isQuotaExceededError( error ) ) {
		logError( error );
	}
};

// Saves pre-edit states whose earlier save failed, before any later state of the block.
const saveUnsavedBaselines = async ( postId ) => {
	for ( const [ blockId, block ] of Array.from(
		runtimeState.unsavedBaselines
	) ) {
		runtimeState.unsavedBaselines.delete( blockId );

		try {
			await persistSnapshotIfChanged( blockId, block, postId, {
				isBaseline: true,
			} );
		} catch ( error ) {
			runtimeState.unsavedBaselines.set( blockId, block );
			logWriteError( error );
		}
	}
};

const isDue = ( blockId, now ) =>
	now - ( getLastSaved( blockId )?.timestamp || 0 ) >= CHECKPOINT_INTERVAL_MS;

/**
 * Saves edited blocks whose latest version is at least a minute old.
 *
 * Each block keeps its own one-minute rhythm, so a block's first snapshot and its
 * next checkpoint are never seconds apart. Blocks that are not due stay marked as
 * edited and are saved on a later tick, as are blocks whose save failed.
 *
 * @param {Object}  options         Options.
 * @param {boolean} options.saveAll Save every edited block, due or not. If a checkpoint
 *                                  is already running, this one runs right after it.
 */
export const runCheckpoint = async ( { saveAll = false } = {} ) => {
	if (
		runtimeState.checkpointInProgress ||
		runtimeState.isRestoringSnapshot
	) {
		runtimeState.saveAllRequested ||= saveAll;
		return;
	}

	saveAll ||= runtimeState.saveAllRequested;
	runtimeState.saveAllRequested = false;

	runtimeState.checkpointInProgress = true;

	try {
		scanEditorBlocks();
		const postId = runtimeState.trackedPostId;
		if ( ! postId ) {
			return;
		}

		await saveUnsavedBaselines( postId );
		const now = Date.now();

		for ( const blockId of getDirtyBlockIds() ) {
			if ( ! saveAll && ! isDue( blockId, now ) ) {
				continue;
			}

			const block = runtimeState.blockByBlockId.get( blockId );

			// Clear first so edits made while this write is pending mark the block again.
			clearDirtyBlock( blockId );

			if ( block ) {
				try {
					await persistSnapshotIfChanged( blockId, block, postId );
				} catch ( error ) {
					markBlockDirty( blockId );
					logWriteError( error );
				}
			}
		}
	} finally {
		runtimeState.checkpointInProgress = false;
	}

	if ( runtimeState.saveAllRequested ) {
		await runCheckpoint();
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
		const { baselines } = scanEditorBlocks( { persistBaselines: false } );
		const postId = runtimeState.trackedPostId;
		if ( ! postId ) {
			return;
		}

		const dirtyBlockIds = getDirtyBlockIds();
		const unsavedBaselines = Array.from(
			runtimeState.unsavedBaselines,
			( [ blockId, block ] ) => ( { blockId, block } )
		);
		const entries = [
			...[ ...unsavedBaselines, ...baselines ].map( ( baseline ) => ( {
				...baseline,
				metadata: { isBaseline: true },
			} ) ),
			...dirtyBlockIds.map( ( blockId ) => ( {
				blockId,
				block: runtimeState.blockByBlockId.get( blockId ),
			} ) ),
		];

		// If the write fails (e.g. storage is full) and the page stays open, as when
		// leaving is cancelled, everything is saved again later.
		const restoreUnsaved = () => {
			dirtyBlockIds.forEach( markBlockDirty );
			[ ...unsavedBaselines, ...baselines ].forEach(
				( { blockId, block } ) =>
					runtimeState.unsavedBaselines.set( blockId, block )
			);
		};

		if (
			persistSnapshotsNow( entries, postId, {
				onFailed: restoreUnsaved,
			} )
		) {
			dirtyBlockIds.forEach( clearDirtyBlock );
			runtimeState.unsavedBaselines.clear();
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

// Opening a template or pattern from the post saves the post's edited blocks right
// away, since tracking pauses until the post is shown again.
export const startFlushOnSharedContent = () => {
	let wasEditingSharedContent = isEditingSharedContent();

	subscribe( () => {
		const editingSharedContent = isEditingSharedContent();

		if ( editingSharedContent && ! wasEditingSharedContent ) {
			runCheckpoint( { saveAll: true } ).catch( logError );
		}

		wasEditingSharedContent = editingSharedContent;
	}, 'core/editor' );
};
