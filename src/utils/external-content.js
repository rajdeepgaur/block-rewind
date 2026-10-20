// Blocks whose inner blocks always live in another entity (synced patterns, template parts).
const EXTERNAL_CONTENT_BLOCK_TYPES = new Set( [
	'core/block',
	'core/template-part',
] );

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
	const name = block?.name || block?.blockName;

	return (
		EXTERNAL_CONTENT_BLOCK_TYPES.has( name ) ||
		( name === 'core/navigation' && Boolean( block.attributes?.ref ) )
	);
};
