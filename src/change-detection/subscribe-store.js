import { select, subscribe } from '@wordpress/data';

import { BLOCK_ID_ATTRIBUTE, SCAN_THROTTLE_MS } from '../constants';
import { markBlockDirty, pruneDirtyBlocks } from './dirty-registry';
import {
	notifyTrackedIdsChanged,
	writeBlockIdAttributes,
} from '../identity/block-identity';
import {
	claimBlockId,
	resolveBlockIdentities,
} from '../identity/resolve-block-identities';
import { computeBlockHash } from '../serialization/serialize-block';
import { getAllEditorBlocks } from '../selectors/block-tree';
import { isEditingSharedContent } from '../selectors/edited-entity';
import { matchOrphanedHistories } from '../identity/match-orphaned-histories';
import {
	listSnapshotsForPost,
	persistSnapshotIfChanged,
} from '../snapshots/snapshot-service';
import { runtimeState } from '../state/runtime-state';
import { isQuotaExceededError } from '../state/storage-status';
import { generateId } from '../utils/generate-id';
import { isEmptyBlock } from '../utils/is-empty-block';

const areMapsEqual = ( left, right ) =>
	left.size === right.size &&
	Array.from( left ).every(
		( [ key, value ] ) => right.get( key ) === value
	);

const logError = ( error ) => {
	// eslint-disable-next-line no-console
	console.error( 'Block Rewind block scan error:', error );
};

// Keeps a pre-edit state that couldn't be saved, so the next save tries it again.
// A full storage is shown in the sidebar instead of being logged.
const keepUnsavedBaseline = ( blockId, block ) => ( error ) => {
	runtimeState.unsavedBaselines.set( blockId, block );

	if ( ! isQuotaExceededError( error ) ) {
		logError( error );
	}
};

// Compares two block states; hashes are cached per block object, so this is cheap.
const hasContentChanged = ( previousBlock, nextBlock ) =>
	previousBlock !== nextBlock &&
	computeBlockHash( previousBlock ) !== computeBlockHash( nextBlock );

// Remembers the state of a newly selected, untracked block so its first edit has a baseline.
// Runs synchronously on every store change so the state is captured before any edit lands.
const captureSelectionBaseline = () => {
	if ( isEditingSharedContent() ) {
		return;
	}

	const blockEditorSelect = select( 'core/block-editor' );
	const clientId = blockEditorSelect.getSelectedBlockClientId();

	if ( clientId === runtimeState.previousSelectedClientId ) {
		return;
	}

	runtimeState.previousSelectedClientId = clientId;

	if (
		! clientId ||
		runtimeState.idByClientId.has( clientId ) ||
		runtimeState.identity.sessionIdByClientId.has( clientId ) ||
		runtimeState.pendingBaselines.has( clientId )
	) {
		return;
	}

	const block = blockEditorSelect.getBlock( clientId );
	if ( block ) {
		runtimeState.pendingBaselines.set( clientId, block );
	}
};

// Remembers a block's state when it is first tracked this session.
const rememberInitialState = ( blockId, block ) => {
	if ( ! runtimeState.initialStateByBlockId.has( blockId ) ) {
		runtimeState.initialStateByBlockId.set( blockId, {
			blockId,
			blockName: block.name,
			hash: computeBlockHash( block ),
		} );
	}
};

/**
 * Gives blocks back the history IDs they lost when undo returned to the loaded post.
 *
 * Before WordPress 7.0, undoing all the way back to the state the post was loaded in
 * rebuilds every block from the saved content, with new client IDs. Blocks first
 * edited in this session lose their ID then. A block gets it back when its type and
 * content match the state the ID was first tracked in, and no other block or ID
 * matches as well. Nothing happens unless every client ID changed and there is
 * nothing left to undo, so deleting or replacing blocks never re-links.
 *
 * @param {Object[]} blocks Flattened editor blocks of the current scan.
 */
const relinkAfterUndoToLoadedPost = ( blocks ) => {
	if (
		! runtimeState.idByClientId.size ||
		blocks.some( ( block ) =>
			runtimeState.scannedClientIds.has( block.clientId )
		) ||
		select( 'core/editor' ).hasEditorUndo()
	) {
		return;
	}

	const presentBlockIds = new Set();
	const untrackedBlocks = [];
	for ( const block of blocks ) {
		const blockId = block.attributes?.[ BLOCK_ID_ATTRIBUTE ];
		if ( blockId ) {
			presentBlockIds.add( blockId );
		} else if ( ! isEmptyBlock( block ) ) {
			untrackedBlocks.push( {
				clientId: block.clientId,
				name: block.name,
				hash: computeBlockHash( block ),
			} );
		}
	}

	const lostStates = Array.from(
		runtimeState.idByClientId.values(),
		( blockId ) => runtimeState.initialStateByBlockId.get( blockId )
	).filter( Boolean );

	for ( const [ clientId, blockId ] of matchOrphanedHistories(
		untrackedBlocks,
		lostStates,
		presentBlockIds
	) ) {
		claimBlockId( runtimeState.identity, clientId, blockId );
	}
};

/**
 * Scans the editor blocks: resolves IDs, starts tracking edited blocks and marks changes.
 *
 * Blocks get an ID only on their first edit after being selected, so selecting a
 * block never changes the post. The pre-edit state of each tracked block is saved
 * once per session as its baseline snapshot, unless that state was empty (e.g. a
 * block that was just inserted).
 *
 * While a template or pattern is shown instead of the post, nothing is scanned and the
 * results of the last scan of the post are kept, so its edited blocks can still be saved.
 *
 * @param {Object}  options                  Options.
 * @param {boolean} options.persistBaselines Save new baselines in the background. The
 *                                           page-exit save turns this off and writes
 *                                           them itself, synchronously.
 * @return {{ baselines: Array<{blockId: string, block: Object}> }} New baselines.
 */
export const scanEditorBlocks = ( { persistBaselines = true } = {} ) => {
	if ( runtimeState.scanTimerId !== null ) {
		clearTimeout( runtimeState.scanTimerId );
		runtimeState.scanTimerId = null;
	}

	if ( isEditingSharedContent() ) {
		return { baselines: [] };
	}

	const postId = select( 'core/editor' ).getCurrentPostId();
	runtimeState.trackedPostId = postId;

	const blocks = getAllEditorBlocks();
	relinkAfterUndoToLoadedPost( blocks );
	const { idByClientId, writes } = resolveBlockIdentities(
		blocks,
		runtimeState.identity
	);
	const presentClientIds = new Set();

	for ( const block of blocks ) {
		presentClientIds.add( block.clientId );

		if ( idByClientId.has( block.clientId ) ) {
			continue;
		}

		const baseline = runtimeState.pendingBaselines.get( block.clientId );
		if ( ! baseline || ! hasContentChanged( baseline, block ) ) {
			continue;
		}

		const blockId = generateId();
		claimBlockId( runtimeState.identity, block.clientId, blockId );
		idByClientId.set( block.clientId, blockId );
		writes.set( block.clientId, blockId );
		runtimeState.pendingBaselines.delete( block.clientId );
		runtimeState.observedByBlockId.set( blockId, baseline );
		rememberInitialState( blockId, baseline );
	}

	const blockByBlockId = new Map();
	const baselines = [];

	for ( const block of blocks ) {
		const blockId = idByClientId.get( block.clientId );
		if ( ! blockId ) {
			continue;
		}

		blockByBlockId.set( blockId, block );
		rememberInitialState( blockId, block );

		const observed = runtimeState.observedByBlockId.get( blockId );
		runtimeState.observedByBlockId.set( blockId, block );

		if ( ! observed || ! hasContentChanged( observed, block ) ) {
			continue;
		}

		if ( ! runtimeState.baselineCapturedIds.has( blockId ) ) {
			runtimeState.baselineCapturedIds.add( blockId );

			if ( ! isEmptyBlock( observed ) ) {
				baselines.push( { blockId, block: observed } );
			}
		}

		markBlockDirty( blockId );
	}

	for ( const blockId of Array.from(
		runtimeState.observedByBlockId.keys()
	) ) {
		if ( ! blockByBlockId.has( blockId ) ) {
			runtimeState.observedByBlockId.delete( blockId );
		}
	}

	for ( const clientId of Array.from(
		runtimeState.pendingBaselines.keys()
	) ) {
		if ( ! presentClientIds.has( clientId ) ) {
			runtimeState.pendingBaselines.delete( clientId );
		}
	}

	pruneDirtyBlocks( new Set( blockByBlockId.keys() ) );
	const trackedIdsChanged = ! areMapsEqual(
		runtimeState.idByClientId,
		idByClientId
	);
	runtimeState.idByClientId = idByClientId;
	runtimeState.blockByBlockId = blockByBlockId;
	runtimeState.scannedClientIds = presentClientIds;

	writeBlockIdAttributes( writes );

	if ( trackedIdsChanged ) {
		notifyTrackedIdsChanged();
	}

	if ( persistBaselines ) {
		for ( const { blockId, block } of baselines ) {
			persistSnapshotIfChanged( blockId, block, postId, {
				isBaseline: true,
			} ).catch( keepUnsavedBaseline( blockId, block ) );
		}
	}

	if ( runtimeState.relinkStatus === 'pending' && postId && blocks.length ) {
		runtimeState.relinkStatus = 'running';
		relinkOrphanedHistories( postId )
			.catch( logError )
			.finally( () => {
				runtimeState.relinkStatus = 'done';
			} );
	}

	return { baselines };
};

/**
 * Gives blocks that lost their history ID (the post was reloaded without saving) their
 * ID back, by matching their content against orphaned histories of this post.
 *
 * Runs once, as soon as the post's blocks are loaded. Empty blocks are never matched.
 *
 * @param {number|string} postId Current post ID.
 */
async function relinkOrphanedHistories( postId ) {
	const snapshots = await listSnapshotsForPost( postId );
	if ( ! snapshots.length ) {
		return;
	}

	const presentBlockIds = new Set( runtimeState.idByClientId.values() );
	const untrackedBlocks = getAllEditorBlocks()
		.filter(
			( block ) =>
				! runtimeState.idByClientId.has( block.clientId ) &&
				! isEmptyBlock( block )
		)
		.map( ( block ) => ( {
			clientId: block.clientId,
			name: block.name,
			hash: computeBlockHash( block ),
		} ) );

	const matches = matchOrphanedHistories(
		untrackedBlocks,
		snapshots,
		presentBlockIds
	);

	if ( ! matches.size ) {
		return;
	}

	for ( const [ clientId, blockId ] of matches ) {
		claimBlockId( runtimeState.identity, clientId, blockId );
		runtimeState.pendingBaselines.delete( clientId );
	}

	// Writes the IDs (without an undo level) and updates the sidebar.
	scanEditorBlocks();
}

// Returns the editor block currently owning a history ID, using an up-to-date scan.
export const getTrackedBlock = ( blockId ) => {
	scanEditorBlocks();
	return runtimeState.blockByBlockId.get( blockId ) || null;
};

const runScheduledScan = () => {
	runtimeState.scanTimerId = null;

	try {
		scanEditorBlocks();
	} catch ( error ) {
		logError( error );
	}
};

// Starts the block-editor store subscription once per editor session.
// Scans are throttled; selection baselines are captured immediately.
export const startStoreSubscription = () => {
	if ( runtimeState.storeUnsubscribe ) {
		return;
	}

	captureSelectionBaseline();
	runScheduledScan();

	runtimeState.storeUnsubscribe = subscribe( () => {
		captureSelectionBaseline();

		if ( runtimeState.scanTimerId === null ) {
			runtimeState.scanTimerId = setTimeout(
				runScheduledScan,
				SCAN_THROTTLE_MS
			);
		}
	}, 'core/block-editor' );
};
