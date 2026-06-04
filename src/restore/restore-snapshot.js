import { createBlock } from '@wordpress/blocks';
import { dispatch } from '@wordpress/data';
import { select } from '@wordpress/data';

import { LEHFG_BLOCK_ID_ATTRIBUTE } from '../constants';
import { findBlockByLehfgBlockId } from '../selectors/block-tree';
import { runtimeState } from '../state/runtime-state';
import { getSnapshotByHashForBlock, persistRecoverySnapshotForBlockIfChanged } from '../snapshots/snapshot-service';
import { computeSerializedHash, serializeBlockState } from '../serialization/serialize-block';

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
	if ( ! snapshot?.blockId ) {
		return false;
	}

	const targetBlock = findBlockByLehfgBlockId( snapshot.blockId );
	if ( ! targetBlock ) {
		return false;
	}

	const currentSerializedState = serializeBlockState( targetBlock );
	const currentHash = computeSerializedHash( currentSerializedState );

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
		if ( postId ) {

			if ( ! ( await getSnapshotByHashForBlock( postId, snapshot.blockId, currentHash ) ) ) {
				await persistRecoverySnapshotForBlockIfChanged( targetBlock, postId );
			}
		}

		const replacementBlock = createBlock(
			snapshot.blockName,
			{
				...( snapshot.attributes || {} ),
				[ LEHFG_BLOCK_ID_ATTRIBUTE ]: snapshot.blockId,
			},
			rehydrateInnerBlocks( snapshot.innerBlocks || [] )
		);

		dispatch( 'core/block-editor' ).replaceBlock( targetBlock.clientId, replacementBlock );
		runtimeState.lastObservedHashes.set(
			snapshot.blockId,
			computeSerializedHash( {
				attributes: {
					...( snapshot.attributes || {} ),
					[ LEHFG_BLOCK_ID_ATTRIBUTE ]: snapshot.blockId,
				},
				innerBlocks: snapshot.innerBlocks || [],
			} )
		);
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
