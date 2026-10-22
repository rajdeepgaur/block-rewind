import { select, subscribe } from '@wordpress/data';

import { SCAN_THROTTLE_MS } from '../constants';
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
import { persistSnapshotIfChanged } from '../snapshots/snapshot-service';
import { runtimeState } from '../state/runtime-state';
import { generateId } from '../utils/generate-id';

const areMapsEqual = ( left, right ) =>
	left.size === right.size &&
	Array.from( left ).every(
		( [ key, value ] ) => right.get( key ) === value
	);

const logError = ( error ) => {
	// eslint-disable-next-line no-console
	console.error( 'Block Rewind block scan error:', error );
};

// Compares two block states; hashes are cached per block object, so this is cheap.
const hasContentChanged = ( previousBlock, nextBlock ) =>
	previousBlock !== nextBlock &&
	computeBlockHash( previousBlock ) !== computeBlockHash( nextBlock );

// Remembers the state of a newly selected, untracked block so its first edit has a baseline.
// Runs synchronously on every store change so the state is captured before any edit lands.
const captureSelectionBaseline = () => {
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

/**
 * Scans the editor blocks: resolves IDs, starts tracking edited blocks and marks changes.
 *
 * Blocks get an ID only on their first edit after being selected, so selecting a
 * block never changes the post. The pre-edit state of each tracked block is saved
 * once per session as its baseline snapshot.
 */
export const scanEditorBlocks = () => {
	if ( runtimeState.scanTimerId !== null ) {
		clearTimeout( runtimeState.scanTimerId );
		runtimeState.scanTimerId = null;
	}

	const blocks = getAllEditorBlocks();
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
	}

	const blockByBlockId = new Map();
	const baselines = [];

	for ( const block of blocks ) {
		const blockId = idByClientId.get( block.clientId );
		if ( ! blockId ) {
			continue;
		}

		blockByBlockId.set( blockId, block );

		const observed = runtimeState.observedByBlockId.get( blockId );
		runtimeState.observedByBlockId.set( blockId, block );

		if ( ! observed || ! hasContentChanged( observed, block ) ) {
			continue;
		}

		if ( ! runtimeState.baselineCapturedIds.has( blockId ) ) {
			runtimeState.baselineCapturedIds.add( blockId );
			baselines.push( { blockId, block: observed } );
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

	writeBlockIdAttributes( writes );

	if ( trackedIdsChanged ) {
		notifyTrackedIdsChanged();
	}

	const postId = select( 'core/editor' ).getCurrentPostId();
	for ( const { blockId, block } of baselines ) {
		persistSnapshotIfChanged( blockId, block, postId ).catch( logError );
	}
};

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
