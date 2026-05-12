import { createBlock } from '@wordpress/blocks';
import { dispatch } from '@wordpress/data';

import { LEHFG_BLOCK_ID_ATTRIBUTE } from '../constants';
import { findBlockByLehfgBlockId } from '../selectors/block-tree';
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
export const restoreSnapshotToEditor = ( snapshot ) => {
	if ( ! snapshot?.blockId ) {
		return false;
	}

	const targetBlock = findBlockByLehfgBlockId( snapshot.blockId );
	if ( ! targetBlock ) {
		return false;
	}

	runtimeState.isRestoringSnapshot = true;

	try {
		const replacementBlock = createBlock(
			snapshot.blockName,
			{
				...( snapshot.attributes || {} ),
				[ LEHFG_BLOCK_ID_ATTRIBUTE ]: snapshot.blockId,
			},
			rehydrateInnerBlocks( snapshot.innerBlocks || [] )
		);

		dispatch( 'core/block-editor' ).replaceBlock( targetBlock.clientId, replacementBlock );
		return true;
	} finally {
		runtimeState.isRestoringSnapshot = false;
	}
};
