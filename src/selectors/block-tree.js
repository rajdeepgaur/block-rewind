import { select } from '@wordpress/data';

import { LEHFG_BLOCK_ID_ATTRIBUTE } from '../constants';

// Flattens a nested block tree into a single list.
const flattenBlocks = ( blocks, collector = [] ) => {
	for ( const block of blocks ) {
		collector.push( block );

		if ( block.innerBlocks?.length ) {
			flattenBlocks( block.innerBlocks, collector );
		}
	}

	return collector;
};

// Returns all blocks currently present in the editor canvas.
export const getAllEditorBlocks = () => {
	const blockEditorSelect = select( 'core/block-editor' );
	const topLevelBlocks = blockEditorSelect.getBlocks() || [];

	return flattenBlocks( topLevelBlocks );
};

// Finds a block in the editor by its persistent plugin ID.
export const findBlockByLehfgBlockId = ( blockId ) => {
	if ( ! blockId ) {
		return null;
	}

	const allBlocks = getAllEditorBlocks();
	return allBlocks.find( ( block ) => block.attributes?.[ LEHFG_BLOCK_ID_ATTRIBUTE ] === blockId ) || null;
};
