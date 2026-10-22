import {
	claimBlockId,
	createIdentityState,
	resolveBlockIdentities,
} from '../resolve-block-identities';

const block = ( clientId, blockRewindId ) => ( {
	clientId,
	attributes: blockRewindId === undefined ? {} : { blockRewindId },
} );

describe( 'resolveBlockIdentities', () => {
	it( 'keeps unique IDs and requests no writes', () => {
		const state = createIdentityState();
		const { idByClientId, writes } = resolveBlockIdentities(
			[ block( 'a', 'id-1' ), block( 'b', 'id-2' ), block( 'c' ) ],
			state
		);

		expect( Object.fromEntries( idByClientId ) ).toEqual( {
			a: 'id-1',
			b: 'id-2',
		} );
		expect( writes.size ).toBe( 0 );
	} );

	it( 'clears the ID from a duplicate inserted after the original', () => {
		const state = createIdentityState();
		resolveBlockIdentities( [ block( 'original', 'id-1' ) ], state );

		const { idByClientId, writes } = resolveBlockIdentities(
			[ block( 'original', 'id-1' ), block( 'copy', 'id-1' ) ],
			state
		);

		expect( idByClientId.get( 'original' ) ).toBe( 'id-1' );
		expect( idByClientId.has( 'copy' ) ).toBe( false );
		expect( Object.fromEntries( writes ) ).toEqual( { copy: '' } );
	} );

	it( 'keeps the ID on the original when a copy is pasted above it', () => {
		const state = createIdentityState();
		resolveBlockIdentities( [ block( 'original', 'id-1' ) ], state );

		const { idByClientId, writes } = resolveBlockIdentities(
			[ block( 'pasted', 'id-1' ), block( 'original', 'id-1' ) ],
			state
		);

		expect( idByClientId.get( 'original' ) ).toBe( 'id-1' );
		expect( Object.fromEntries( writes ) ).toEqual( { pasted: '' } );
	} );

	it( 'keeps the first block in document order when duplicates are loaded from content', () => {
		const state = createIdentityState();
		const { idByClientId, writes } = resolveBlockIdentities(
			[ block( 'first', 'id-1' ), block( 'second', 'id-1' ) ],
			state
		);

		expect( idByClientId.get( 'first' ) ).toBe( 'id-1' );
		expect( Object.fromEntries( writes ) ).toEqual( { second: '' } );
	} );

	it( 'lets a moved block (new client ID, original gone) keep the ID', () => {
		const state = createIdentityState();
		resolveBlockIdentities( [ block( 'original', 'id-1' ) ], state );

		const { idByClientId, writes } = resolveBlockIdentities(
			[ block( 'moved', 'id-1' ) ],
			state
		);

		expect( idByClientId.get( 'moved' ) ).toBe( 'id-1' );
		expect( writes.size ).toBe( 0 );
	} );

	it( 'gives the ID back to the original when an undo restores it', () => {
		const state = createIdentityState();
		resolveBlockIdentities( [ block( 'original', 'id-1' ) ], state );
		// Original deleted; the remaining copy temporarily owns the ID.
		resolveBlockIdentities( [ block( 'copy', 'id-1' ) ], state );

		const { idByClientId, writes } = resolveBlockIdentities(
			[ block( 'original', 'id-1' ), block( 'copy', 'id-1' ) ],
			state
		);

		expect( idByClientId.get( 'original' ) ).toBe( 'id-1' );
		expect( Object.fromEntries( writes ) ).toEqual( { copy: '' } );

		// Once cleared, the copy must not fall back to the ID via session state.
		const next = resolveBlockIdentities(
			[ block( 'original', 'id-1' ), block( 'copy', '' ) ],
			state
		);
		expect( next.idByClientId.has( 'copy' ) ).toBe( false );
		expect( next.writes.size ).toBe( 0 );
	} );

	it( 'rewrites an ID that undo removed from the attribute', () => {
		const state = createIdentityState();
		claimBlockId( state, 'a', 'id-1' );

		const { idByClientId, writes } = resolveBlockIdentities(
			[ block( 'a' ) ],
			state
		);

		expect( idByClientId.get( 'a' ) ).toBe( 'id-1' );
		expect( Object.fromEntries( writes ) ).toEqual( { a: 'id-1' } );
	} );
} );
