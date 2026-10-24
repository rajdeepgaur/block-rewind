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

// Returns the client ID of the block holding the post's blocks: '' (the root) when only
// the post is shown, the Post Content block when the template is shown around it, or
// null when the shown template has no Post Content block.
const getPostRootClientId = () => {
	const renderingMode = select( 'core/editor' ).getRenderingMode?.();
	if ( ! renderingMode || renderingMode === 'post-only' ) {
		return '';
	}

	const [ postContentClientId ] =
		select( 'core/block-editor' ).getBlocksByName( 'core/post-content' );
	return postContentClientId || null;
};

// Returns all blocks of the post in the editor canvas. Blocks of the template around
// the post are left out, so they are never tracked or re-linked.
export const getAllEditorBlocks = () => {
	const rootClientId = getPostRootClientId();
	if ( rootClientId === null ) {
		return [];
	}

	const blocks =
		select( 'core/block-editor' ).getBlocks( rootClientId ) || [];

	return flattenBlocks( blocks );
};
