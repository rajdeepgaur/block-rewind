import { select } from '@wordpress/data';

import { hasExternalInnerBlocks } from '../utils/external-content';

// Flattens a nested block tree into a single list of trackable blocks.
const flattenBlocks = ( blocks, collector = [] ) => {
	for ( const block of blocks ) {
		if ( hasExternalInnerBlocks( block ) ) {
			continue;
		}

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
