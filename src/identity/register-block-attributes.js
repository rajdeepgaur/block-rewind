import { addFilter } from '@wordpress/hooks';

import { LEHFG_BLOCK_ID_ATTRIBUTE } from '../constants';
import { getTrackedBlockId } from './block-identity';
import { preserveIdOnTransform } from './preserve-id-on-transform';

// Adds the persistent Lehfg block ID to every block type definition.
// The same attribute is registered server-side in PHP so REST endpoints accept it.
const registerLehfgBlockAttribute = ( settings = {} ) => {
	const attributes = settings.attributes || {};

	if ( attributes[ LEHFG_BLOCK_ID_ATTRIBUTE ] ) {
		return settings;
	}

	return {
		...settings,
		attributes: {
			...attributes,
			[ LEHFG_BLOCK_ID_ATTRIBUTE ]: {
				type: 'string',
				default: '',
			},
		},
	};
};

addFilter(
	'blocks.registerBlockType',
	'lehfg/register-attributes',
	registerLehfgBlockAttribute
);

addFilter(
	'blocks.switchToBlockType.transformedBlock',
	'lehfg/preserve-id-on-transform',
	( transformedBlock, sourceBlocks, index ) =>
		preserveIdOnTransform(
			transformedBlock,
			sourceBlocks,
			index,
			getTrackedBlockId
		)
);
