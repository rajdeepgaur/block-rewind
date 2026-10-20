import { select } from '@wordpress/data';

// Inner blocks of synced patterns belong to the pattern, not to the current post.
const SKIP_INNER_BLOCKS_OF = new Set( [ 'core/block' ] );

// Flattens a nested block tree into a single list.
const flattenBlocks = ( blocks, collector = [] ) => {
	for ( const block of blocks ) {
		collector.push( block );

		if (
			block.innerBlocks?.length &&
			! SKIP_INNER_BLOCKS_OF.has( block.name )
		) {
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
