import { generateId } from '../generate-id';

const UUID_V4 =
	/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe( 'generateId', () => {
	const originalCrypto = global.crypto;

	afterEach( () => {
		Object.defineProperty( global, 'crypto', {
			value: originalCrypto,
			configurable: true,
		} );
	} );

	const setCrypto = ( value ) =>
		Object.defineProperty( global, 'crypto', {
			value,
			configurable: true,
		} );

	it( 'uses crypto.randomUUID when available', () => {
		setCrypto( { randomUUID: () => 'from-random-uuid' } );
		expect( generateId() ).toBe( 'from-random-uuid' );
	} );

	it( 'builds a v4 UUID from crypto.getRandomValues on insecure origins', () => {
		setCrypto( {
			getRandomValues: ( bytes ) => bytes.fill( 0xff ),
		} );
		expect( generateId() ).toMatch( UUID_V4 );
	} );

	it( 'still returns unique v4 UUIDs without any crypto API', () => {
		setCrypto( undefined );
		const ids = new Set( Array.from( { length: 50 }, generateId ) );

		expect( ids.size ).toBe( 50 );
		ids.forEach( ( id ) => expect( id ).toMatch( UUID_V4 ) );
	} );
} );
