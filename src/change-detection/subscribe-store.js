import { select, subscribe } from '@wordpress/data';

import { LEHFG_BLOCK_ID_ATTRIBUTE } from '../constants';
import { markBlockDirty, pruneDirtyBlocks } from './dirty-registry';
import { initializeBlockFromSelection } from '../selection/initialize-from-selection';
import { computeSerializedHash, serializeBlockState } from '../serialization/serialize-block';
import { getAllEditorBlocks } from '../selectors/block-tree';
import { runtimeState } from '../state/runtime-state';

// Detects selection changes and runs one-time initialization for that block.
const trackSelectionChange = async () => {
	const currentSelectedClientId = select( 'core/block-editor' ).getSelectedBlockClientId();

	if ( currentSelectedClientId === runtimeState.previousSelectedClientId ) {
		return;
	}

	runtimeState.previousSelectedClientId = currentSelectedClientId;
	await initializeBlockFromSelection( currentSelectedClientId );
};

// Compares serialized block state and marks changed tracked blocks as dirty.
const trackDirtyBlocks = () => {
	const allBlocks = getAllEditorBlocks();
	const currentBlockIds = new Set();

	for ( const block of allBlocks ) {
		const blockId = block.attributes?.[ LEHFG_BLOCK_ID_ATTRIBUTE ];
		if ( ! blockId ) {
			continue;
		}

		currentBlockIds.add( blockId );

		const serialized = serializeBlockState( block );
		const hash = computeSerializedHash( serialized );
		const previousHash = runtimeState.lastObservedHashes.get( blockId );

		if ( previousHash === undefined ) {
			runtimeState.lastObservedHashes.set( blockId, hash );
			continue;
		}

		if ( previousHash !== hash ) {
			runtimeState.lastObservedHashes.set( blockId, hash );
			markBlockDirty( blockId );
		}
	}

	for ( const observedBlockId of Array.from( runtimeState.lastObservedHashes.keys() ) ) {
		if ( ! currentBlockIds.has( observedBlockId ) ) {
			runtimeState.lastObservedHashes.delete( observedBlockId );
		}
	}

	pruneDirtyBlocks( currentBlockIds );
};

// Handles one subscription cycle while honoring mutation/restore guards.
const processStoreChange = async () => {
	if ( runtimeState.isAssigningBlockId || runtimeState.isRestoringSnapshot ) {
		return;
	}

	await trackSelectionChange();
	trackDirtyBlocks();
};

// Starts the global data-store subscription once per editor session.
export const startStoreSubscription = () => {
	if ( runtimeState.storeUnsubscribe ) {
		return;
	}

	runtimeState.storeUnsubscribe = subscribe( () => {
		if ( runtimeState.storeChangeScheduled ) {
			return;
		}

		runtimeState.storeChangeScheduled = true;

		Promise.resolve()
			.then( () => processStoreChange() )
			.catch( ( error ) => {
				// eslint-disable-next-line no-console
				console.error( 'LEHFG store subscription error:', error );
			} )
			.finally( () => {
				runtimeState.storeChangeScheduled = false;
			} );
	} );
};
