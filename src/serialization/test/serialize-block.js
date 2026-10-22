import {
	computeBlockHash,
	serializeBlockState,
	stableStringify,
} from '../serialize-block';

const paragraph = ( attributes, innerBlocks = [] ) => ( {
	clientId: 'p',
	name: 'core/paragraph',
	attributes,
	innerBlocks,
} );

describe( 'stableStringify', () => {
	it( 'ignores object key order', () => {
		expect( stableStringify( { b: 1, a: { d: 2, c: 3 } } ) ).toBe(
			stableStringify( { a: { c: 3, d: 2 }, b: 1 } )
		);
	} );

	it( 'matches JSON.stringify semantics for undefined and toJSON', () => {
		const richText = { toJSON: () => '<strong>Hi</strong>' };

		expect(
			JSON.parse(
				stableStringify( {
					a: undefined,
					b: [ undefined ],
					c: richText,
				} )
			)
		).toEqual( { b: [ null ], c: '<strong>Hi</strong>' } );
	} );
} );

describe( 'computeBlockHash', () => {
	it( 'is the same regardless of attribute order', () => {
		expect(
			computeBlockHash( paragraph( { content: 'Hi', align: 'left' } ) )
		).toBe(
			computeBlockHash( paragraph( { align: 'left', content: 'Hi' } ) )
		);
	} );

	it( 'ignores plugin block IDs at every level', () => {
		const withIds = paragraph( { content: 'Hi', blockRewindId: 'id-1' }, [
			paragraph( { content: 'Inner', blockRewindId: 'id-2' } ),
		] );
		const withoutIds = paragraph( { content: 'Hi' }, [
			paragraph( { content: 'Inner' } ),
		] );

		expect( computeBlockHash( withIds ) ).toBe(
			computeBlockHash( withoutIds )
		);
	} );

	it( 'changes when content, block type or inner blocks change', () => {
		const base = computeBlockHash( paragraph( { content: 'Hi' } ) );

		expect( computeBlockHash( paragraph( { content: 'Hey' } ) ) ).not.toBe(
			base
		);
		expect(
			computeBlockHash( {
				...paragraph( { content: 'Hi' } ),
				name: 'core/heading',
			} )
		).not.toBe( base );
		expect(
			computeBlockHash(
				paragraph( { content: 'Hi' }, [ paragraph( { content: '' } ) ] )
			)
		).not.toBe( base );
	} );

	it( 'matches between an editor block and its stored snapshot', () => {
		const block = paragraph(
			{ content: { toJSON: () => 'Hi' }, blockRewindId: 'id-1' },
			[ paragraph( { content: 'Inner', blockRewindId: 'id-2' } ) ]
		);

		expect( computeBlockHash( serializeBlockState( block ) ) ).toBe(
			computeBlockHash( block )
		);
	} );
} );

describe( 'synced content', () => {
	it( 'leaves the inner blocks of synced patterns out of hashes and snapshots', () => {
		const group = ( patternContent ) =>
			paragraph( {}, [
				{
					clientId: 'pattern',
					name: 'core/block',
					attributes: { ref: 12 },
					innerBlocks: [ paragraph( { content: patternContent } ) ],
				},
			] );

		expect( computeBlockHash( group( 'A' ) ) ).toBe(
			computeBlockHash( group( 'B' ) )
		);
		expect( serializeBlockState( group( 'A' ) ).innerBlocks ).toEqual( [
			{
				blockName: 'core/block',
				attributes: { ref: 12 },
				innerBlocks: [],
			},
		] );
	} );
} );

describe( 'navigation blocks', () => {
	it( 'keeps inline menu items but drops items of a saved menu', () => {
		const navigation = ( attributes ) => ( {
			clientId: 'nav',
			name: 'core/navigation',
			attributes,
			innerBlocks: [
				{
					clientId: 'link',
					name: 'core/navigation-link',
					attributes: { label: 'Home' },
					innerBlocks: [],
				},
			],
		} );

		expect(
			serializeBlockState( navigation( {} ) ).innerBlocks
		).toHaveLength( 1 );
		expect(
			serializeBlockState( navigation( { ref: 4 } ) ).innerBlocks
		).toHaveLength( 0 );
	} );
} );

describe( 'serializeBlockState', () => {
	it( 'drops the block’s own ID but keeps inner block IDs', () => {
		const state = serializeBlockState(
			paragraph( { content: 'Hi', blockRewindId: 'id-1' }, [
				paragraph( { content: 'Inner', blockRewindId: 'id-2' } ),
			] )
		);

		expect( state ).toEqual( {
			blockName: 'core/paragraph',
			attributes: { content: 'Hi' },
			innerBlocks: [
				{
					blockName: 'core/paragraph',
					attributes: { content: 'Inner', blockRewindId: 'id-2' },
					innerBlocks: [],
				},
			],
		} );
	} );
} );
