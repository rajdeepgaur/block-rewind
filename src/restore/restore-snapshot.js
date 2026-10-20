import { createBlock } from '@wordpress/blocks';
import { dispatch, select } from '@wordpress/data';

import { LEHFG_BLOCK_ID_ATTRIBUTE } from '../constants';
import { getTrackedBlock } from '../change-detection/subscribe-store';
import { claimBlockId } from '../identity/resolve-block-identities';
import { computeBlockHash } from '../serialization/serialize-block';
import {
	findSnapshotByHash,
	persistSnapshotIfChanged,
} from '../snapshots/snapshot-service';
import { runtimeState } from '../state/runtime-state';

// Rebuilds nested block instances from serialized snapshot inner blocks.
const rehydrateInnerBlocks = ( serializedInnerBlocks = [] ) =>
	serializedInnerBlocks.map( ( serializedBlock ) =>
		createBlock(
			serializedBlock.blockName,
			serializedBlock.attributes || {},
			rehydrateInnerBlocks( serializedBlock.innerBlocks || [] )
		)
	);

// Replaces the current editor block content with a stored snapshot.
export const restoreSnapshotToEditor = async ( snapshot ) => {
	const blockId = snapshot?.blockId;
	if ( ! blockId ) {
		return false;
	}

	const targetBlock = getTrackedBlock( blockId );
	if ( ! targetBlock ) {
		return false;
	}

	const currentHash = computeBlockHash( targetBlock );

	if ( snapshot.hash && currentHash === snapshot.hash ) {
		dispatch( 'core/notices' ).createNotice(
			'info',
			'This snapshot is already the current block state.',
			{
				dismissible: true,
			}
		);
		return false;
	}

	runtimeState.isRestoringSnapshot = true;

	try {
		const postId = select( 'core/editor' ).getCurrentPostId();

		// Save the current state first so the restore can itself be reverted from history.
		if (
			postId &&
			! ( await findSnapshotByHash( postId, blockId, currentHash ) )
		) {
			await persistSnapshotIfChanged( blockId, targetBlock, postId );
		}

		const latestTargetBlock = getTrackedBlock( blockId );
		if ( ! latestTargetBlock ) {
			return false;
		}

		const replacementBlock = createBlock(
			snapshot.blockName,
			{
				...( snapshot.attributes || {} ),
				[ LEHFG_BLOCK_ID_ATTRIBUTE ]: blockId,
			},
			rehydrateInnerBlocks( snapshot.innerBlocks || [] )
		);

		dispatch( 'core/block-editor' ).replaceBlock(
			latestTargetBlock.clientId,
			replacementBlock
		);

		// The restored block takes over the ID; its content is already in history.
		claimBlockId(
			runtimeState.identity,
			replacementBlock.clientId,
			blockId
		);
		runtimeState.observedByBlockId.set( blockId, replacementBlock );

		dispatch( 'core/notices' ).createNotice(
			'info',
			'Target snapshot restored successfully',
			{
				dismissible: true,
			}
		);
		return true;
	} finally {
		runtimeState.isRestoringSnapshot = false;
	}
};
