import { addFilter } from '@wordpress/hooks';

import { BLOCK_ID_ATTRIBUTE } from '../constants';
import { getTrackedBlockId } from './block-identity';
import { preserveIdOnTransform } from './preserve-id-on-transform';

// Adds the persistent Block Rewind ID to every block type definition.
// The same attribute is registered server-side in PHP so REST endpoints accept it.
const registerBlockIdAttribute = ( settings = {} ) => {
	const attributes = settings.attributes || {};

	if ( attributes[ BLOCK_ID_ATTRIBUTE ] ) {
		return settings;
	}

	return {
		...settings,
		attributes: {
			...attributes,
			[ BLOCK_ID_ATTRIBUTE ]: {
				type: 'string',
				default: '',
			},
		},
	};
};

addFilter(
	'blocks.registerBlockType',
	'block-rewind/register-attributes',
	registerBlockIdAttribute
);

addFilter(
	'blocks.switchToBlockType.transformedBlock',
	'block-rewind/preserve-id-on-transform',
	( transformedBlock, sourceBlocks, index ) =>
		preserveIdOnTransform(
			transformedBlock,
			sourceBlocks,
			index,
			getTrackedBlockId
		)
);
