import { addFilter } from '@wordpress/hooks';

import { LEHFG_BLOCK_ID_ATTRIBUTE } from '../constants';

// Adds the persistent Lehfg block ID to every block type definition.
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
			},
		},
	};
};

addFilter(
	'blocks.registerBlockType',
	'lehfg/register-attributes',
	registerLehfgBlockAttribute
);
