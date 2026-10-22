import { BLOCK_ID_ATTRIBUTE } from '../constants';

const readBlockIdAttribute = ( block ) =>
	block?.attributes?.[ BLOCK_ID_ATTRIBUTE ] || null;

const containsBlockId = ( blocks = [], blockId ) =>
	blocks.some(
		( block ) =>
			readBlockIdAttribute( block ) === blockId ||
			containsBlockId( block.innerBlocks, blockId )
	);

/**
 * Carries the history ID over when one block is transformed into another type.
 *
 * Only the first result of a one-to-one or one-to-many transform receives the ID,
 * and only when the result does not already contain it (e.g. "Group" wraps a copy
 * of the original block, which keeps its own ID).
 *
 * @param {Object}          transformedBlock Block produced by the transform.
 * @param {Object[]|Object} sourceBlocks     Blocks being transformed (a single block when
 *                                           switchToBlockType was called with one block).
 * @param {number}          index            Index of this result among all results.
 * @param {Function}        resolveBlockId   Returns the tracked ID for a source block.
 * @return {Object} The transformed block, possibly with the ID applied.
 */
export const preserveIdOnTransform = (
	transformedBlock,
	sourceBlocks,
	index,
	resolveBlockId
) => {
	const sources = Array.isArray( sourceBlocks )
		? sourceBlocks
		: [ sourceBlocks ];

	if ( index > 0 || sources.length !== 1 || ! transformedBlock ) {
		return transformedBlock;
	}

	const blockId = sources[ 0 ] && resolveBlockId( sources[ 0 ] );

	if (
		! blockId ||
		readBlockIdAttribute( transformedBlock ) ||
		containsBlockId( transformedBlock.innerBlocks, blockId )
	) {
		return transformedBlock;
	}

	return {
		...transformedBlock,
		attributes: {
			...transformedBlock.attributes,
			[ BLOCK_ID_ATTRIBUTE ]: blockId,
		},
	};
};
