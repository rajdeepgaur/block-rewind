import { dispatch } from '@wordpress/data';

import { LEHFG_BLOCK_ID_ATTRIBUTE } from '../constants';

// Reads the plugin-specific persistent ID from a block.
export const getLehfgBlockId = ( block ) => block?.attributes?.[ LEHFG_BLOCK_ID_ATTRIBUTE ] || null;

// Writes the plugin-specific persistent ID to block attributes.
export const assignLehfgBlockId = ( clientId, blockId ) => {
	dispatch( 'core/block-editor' ).updateBlockAttributes( clientId, {
		[ LEHFG_BLOCK_ID_ATTRIBUTE ]: blockId,
	} );
};
