// Builds an RFC 4122 version 4 UUID from 16 random bytes.
/* eslint-disable no-bitwise */
const uuidFromBytes = ( bytes ) => {
	bytes[ 6 ] = ( bytes[ 6 ] & 0x0f ) | 0x40;
	bytes[ 8 ] = ( bytes[ 8 ] & 0x3f ) | 0x80;

	const hex = Array.from( bytes, ( byte ) =>
		byte.toString( 16 ).padStart( 2, '0' )
	).join( '' );

	return `${ hex.slice( 0, 8 ) }-${ hex.slice( 8, 12 ) }-${ hex.slice(
		12,
		16
	) }-${ hex.slice( 16, 20 ) }-${ hex.slice( 20 ) }`;
};
/* eslint-enable no-bitwise */

/**
 * Returns a unique ID for blocks and snapshot records.
 *
 * crypto.randomUUID() only exists in secure contexts (HTTPS or localhost), so sites
 * served over plain HTTP fall back to crypto.getRandomValues(), which is available
 * everywhere. Math.random() is only a last resort for environments without crypto.
 *
 * @return {string} A version 4 UUID.
 */
export const generateId = () => {
	const cryptoApi = typeof crypto !== 'undefined' ? crypto : undefined;

	if ( typeof cryptoApi?.randomUUID === 'function' ) {
		return cryptoApi.randomUUID();
	}

	const bytes = new Uint8Array( 16 );

	if ( typeof cryptoApi?.getRandomValues === 'function' ) {
		cryptoApi.getRandomValues( bytes );
	} else {
		for ( let index = 0; index < bytes.length; index += 1 ) {
			bytes[ index ] = Math.floor( Math.random() * 256 );
		}
	}

	return uuidFromBytes( bytes );
};
