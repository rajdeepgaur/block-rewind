import { isEmptyBlock } from '../is-empty-block';

const BLOCK_TYPES = {
	'core/paragraph': {
		attributes: {
			content: { type: 'rich-text' },
			dropCap: { type: 'boolean', default: false },
			blockRewindId: { type: 'string', default: '' },
		},
	},
	'core/group': {
		attributes: { tagName: { type: 'string', default: 'div' } },
	},
};

jest.mock(
	'@wordpress/blocks',
	() => ( { getBlockType: ( name ) => BLOCK_TYPES[ name ] } ),
	{ virtual: true }
);

const paragraph = ( attributes = {} ) => ( {
	name: 'core/paragraph',
	attributes: { dropCap: false, ...attributes },
	innerBlocks: [],
} );

describe( 'isEmptyBlock', () => {
	it( 'treats a freshly inserted block as empty, ignoring its history ID', () => {
		expect( isEmptyBlock( paragraph() ) ).toBe( true );
		expect( isEmptyBlock( paragraph( { content: '' } ) ) ).toBe( true );
		expect(
			isEmptyBlock( paragraph( { content: { toJSON: () => '' } } ) )
		).toBe( true );
		expect( isEmptyBlock( paragraph( { blockRewindId: 'id-1' } ) ) ).toBe(
			true
		);
	} );

	it( 'treats content or changed settings as not empty', () => {
		expect( isEmptyBlock( paragraph( { content: 'Hi' } ) ) ).toBe( false );
		expect( isEmptyBlock( paragraph( { dropCap: true } ) ) ).toBe( false );
	} );

	it( 'checks inner blocks recursively', () => {
		const group = ( innerBlocks ) => ( {
			name: 'core/group',
			attributes: { tagName: 'div' },
			innerBlocks,
		} );

		expect( isEmptyBlock( group( [ paragraph() ] ) ) ).toBe( true );
		expect(
			isEmptyBlock( group( [ paragraph( { content: 'Hi' } ) ] ) )
		).toBe( false );
	} );

	it( 'never treats unknown block types as empty', () => {
		expect(
			isEmptyBlock( {
				name: 'x/unknown',
				attributes: {},
				innerBlocks: [],
			} )
		).toBe( false );
	} );
} );
