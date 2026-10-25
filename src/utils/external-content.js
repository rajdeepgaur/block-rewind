// Blocks whose inner blocks always live in another entity (synced patterns, template parts).
const EXTERNAL_CONTENT_BLOCK_TYPES = new Set( [
	'core/block',
	'core/template-part',
] );

// The block type of an editor block (`name`) or a stored snapshot (`blockName`).
export const getBlockName = ( block ) => block?.name || block?.blockName || '';

/**
 * Checks whether a block's inner blocks are stored outside the post.
 *
 * Such blocks are never tracked, and their inner blocks are left out of snapshots,
 * so restoring a parent block cannot edit the shared entity. A navigation block only
 * qualifies when it references a saved menu; otherwise its items are post content.
 *
 * @param {Object} block Editor block or stored snapshot.
 * @return {boolean} Whether the inner blocks belong to another entity.
 */
export const hasExternalInnerBlocks = ( block ) => {
	const name = getBlockName( block );

	return (
		EXTERNAL_CONTENT_BLOCK_TYPES.has( name ) ||
		( name === 'core/navigation' && Boolean( block.attributes?.ref ) )
	);
};

// Inner blocks that are part of a block's own content; none for shared entities.
export const getOwnInnerBlocks = ( block ) =>
	! block || hasExternalInnerBlocks( block ) ? [] : block.innerBlocks || [];
