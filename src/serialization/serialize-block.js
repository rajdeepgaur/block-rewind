import { BLOCK_ID_ATTRIBUTE } from '../constants';
import { hasExternalInnerBlocks } from '../utils/external-content';

// Stable strings and hashes are cached per block object. Editor blocks are
// immutable, so an unchanged block (or subtree) is never serialized twice.
const stableStringCache = new WeakMap();
const hashCache = new WeakMap();

// Creates a deep-cloned JSON-safe value for deterministic persistence.
const cloneSerializable = ( value ) =>
	JSON.parse( JSON.stringify( value ?? null ) );

const getBlockName = ( block ) => block.name || block.blockName || '';

// Inner blocks that belong to another entity are not part of a block's own content.
const getOwnInnerBlocks = ( block ) =>
	hasExternalInnerBlocks( block ) ? [] : block.innerBlocks || [];

// Removes the plugin's own block ID from an attributes object.
const withoutBlockId = ( attributes = {} ) => {
	const { [ BLOCK_ID_ATTRIBUTE ]: omitted, ...rest } = attributes;
	return rest;
};

// Serializes a value to JSON with object keys sorted, so key order never affects the result.
export const stableStringify = ( value ) => {
	if ( value && typeof value.toJSON === 'function' ) {
		return stableStringify( value.toJSON() );
	}

	if ( Array.isArray( value ) ) {
		return `[${ value
			.map( ( item ) =>
				item === undefined ? 'null' : stableStringify( item )
			)
			.join( ',' ) }]`;
	}

	if ( value && typeof value === 'object' ) {
		const entries = Object.keys( value )
			.filter( ( key ) => value[ key ] !== undefined )
			.sort()
			.map(
				( key ) =>
					`${ JSON.stringify( key ) }:${ stableStringify(
						value[ key ]
					) }`
			);
		return `{${ entries.join( ',' ) }}`;
	}

	return JSON.stringify( value ?? null );
};

// Returns a 53-bit hash (cyrb53) of a string as a hex string.
/* eslint-disable no-bitwise */
export const hashString = ( input ) => {
	let h1 = 0xdeadbeef;
	let h2 = 0x41c6ce57;

	for ( let index = 0; index < input.length; index += 1 ) {
		const code = input.charCodeAt( index );
		h1 = Math.imul( h1 ^ code, 2654435761 );
		h2 = Math.imul( h2 ^ code, 1597334677 );
	}

	h1 = Math.imul( h1 ^ ( h1 >>> 16 ), 2246822507 );
	h1 ^= Math.imul( h2 ^ ( h2 >>> 13 ), 3266489909 );
	h2 = Math.imul( h2 ^ ( h2 >>> 16 ), 2246822507 );
	h2 ^= Math.imul( h1 ^ ( h1 >>> 13 ), 3266489909 );

	return ( 4294967296 * ( 2097151 & h2 ) + ( h1 >>> 0 ) ).toString( 16 );
};
/* eslint-enable no-bitwise */

// Builds a stable string of a block's content, ignoring plugin block IDs at every level.
// Accepts editor blocks (`name`) and stored snapshots (`blockName`).
const getStableBlockString = ( block ) => {
	const cached = stableStringCache.get( block );
	if ( cached !== undefined ) {
		return cached;
	}

	const innerBlocks = getOwnInnerBlocks( block ).map( getStableBlockString );
	const result = `{"name":${ JSON.stringify(
		getBlockName( block )
	) },"attributes":${ stableStringify(
		withoutBlockId( block.attributes )
	) },"innerBlocks":[${ innerBlocks.join( ',' ) }]}`;

	stableStringCache.set( block, result );
	return result;
};

// Produces a content fingerprint for change detection and snapshot matching.
export const computeBlockHash = ( block ) => {
	if ( ! block ) {
		return null;
	}

	const cached = hashCache.get( block );
	if ( cached !== undefined ) {
		return cached;
	}

	const hash = hashString( getStableBlockString( block ) );
	hashCache.set( block, hash );
	return hash;
};

// Recursively serializes inner blocks into a persistence-friendly shape.
// Inner block IDs are kept so a restore puts them back on the same blocks.
const serializeInnerBlocks = ( innerBlocks = [] ) =>
	innerBlocks.map( ( block ) => ( {
		blockName: getBlockName( block ),
		attributes: cloneSerializable( block.attributes || {} ),
		innerBlocks: serializeInnerBlocks( getOwnInnerBlocks( block ) ),
	} ) );

// Serializes block state used for snapshot storage.
// The block's own ID is stored on the snapshot record instead of its attributes.
export const serializeBlockState = ( block ) => ( {
	blockName: getBlockName( block ),
	attributes: cloneSerializable( withoutBlockId( block.attributes ) ),
	innerBlocks: serializeInnerBlocks( getOwnInnerBlocks( block ) ),
} );
