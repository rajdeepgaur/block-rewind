import { getBlockType } from '@wordpress/blocks';

import { BLOCK_ID_ATTRIBUTE } from '../constants';
import { stableStringify } from '../serialization/serialize-block';

const isDefaultValue = ( value, definition ) => {
	if ( 'default' in definition ) {
		return (
			stableStringify( value ) === stableStringify( definition.default )
		);
	}

	// Attributes without a default are empty when unset or an empty (rich) text.
	return value === undefined || stableStringify( value ) === '""';
};

/**
 * Checks whether a block is empty and unmodified, like a freshly inserted block.
 *
 * Every attribute must still have its default value (the plugin's own ID is ignored),
 * and every inner block must be empty too. Unknown block types are never empty.
 *
 * @param {Object} block Editor block.
 * @return {boolean} Whether the block has no content of its own.
 */
export const isEmptyBlock = ( block ) => {
	const blockType = block && getBlockType( block.name );
	if ( ! blockType ) {
		return false;
	}

	const hasDefaultAttributes = Object.entries(
		blockType.attributes || {}
	).every(
		( [ key, definition ] ) =>
			key === BLOCK_ID_ATTRIBUTE ||
			isDefaultValue( block.attributes?.[ key ], definition )
	);

	return (
		hasDefaultAttributes &&
		( block.innerBlocks || [] ).every( isEmptyBlock )
	);
};
