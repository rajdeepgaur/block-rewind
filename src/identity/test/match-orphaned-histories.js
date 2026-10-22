import { matchOrphanedHistories } from '../match-orphaned-histories';

const block = ( clientId, hash, name = 'core/paragraph' ) => ( {
	clientId,
	name,
	hash,
} );
const snapshot = ( blockId, hash, blockName = 'core/paragraph' ) => ( {
	blockId,
	blockName,
	hash,
} );

describe( 'matchOrphanedHistories', () => {
	it( 're-links a block whose content appears in exactly one orphaned history', () => {
		const matches = matchOrphanedHistories(
			[ block( 'a', 'saved' ) ],
			[ snapshot( 'id-1', 'saved' ), snapshot( 'id-1', 'unsaved-edit' ) ],
			new Set()
		);

		expect( Object.fromEntries( matches ) ).toEqual( { a: 'id-1' } );
	} );

	it( 'ignores histories that still belong to a block in the post', () => {
		const matches = matchOrphanedHistories(
			[ block( 'a', 'saved' ) ],
			[ snapshot( 'id-1', 'saved' ) ],
			new Set( [ 'id-1' ] )
		);

		expect( matches.size ).toBe( 0 );
	} );

	it( 'leaves identical blocks alone when they match the same history', () => {
		const matches = matchOrphanedHistories(
			[ block( 'a', 'same' ), block( 'b', 'same' ) ],
			[ snapshot( 'id-1', 'same' ) ],
			new Set()
		);

		expect( matches.size ).toBe( 0 );
	} );

	it( 'leaves a block alone when several histories match it', () => {
		const matches = matchOrphanedHistories(
			[ block( 'a', 'same' ) ],
			[ snapshot( 'id-1', 'same' ), snapshot( 'id-2', 'same' ) ],
			new Set()
		);

		expect( matches.size ).toBe( 0 );
	} );

	it( 'requires the same block type', () => {
		const matches = matchOrphanedHistories(
			[ block( 'a', 'saved', 'core/heading' ) ],
			[ snapshot( 'id-1', 'saved', 'core/paragraph' ) ],
			new Set()
		);

		expect( matches.size ).toBe( 0 );
	} );

	it( 'matches several blocks independently', () => {
		const matches = matchOrphanedHistories(
			[
				block( 'a', 'first' ),
				block( 'b', 'second' ),
				block( 'c', 'none' ),
			],
			[ snapshot( 'id-1', 'first' ), snapshot( 'id-2', 'second' ) ],
			new Set()
		);

		expect( Object.fromEntries( matches ) ).toEqual( {
			a: 'id-1',
			b: 'id-2',
		} );
	} );
} );
