import { preserveIdOnTransform } from '../preserve-id-on-transform';

const resolveFromAttribute = ( block ) => block.attributes.lehfgBlockId;

const paragraph = {
	clientId: 'p',
	name: 'core/paragraph',
	attributes: { content: 'Hi', lehfgBlockId: 'id-1' },
	innerBlocks: [],
};

describe( 'preserveIdOnTransform', () => {
	it( 'copies the ID to a one-to-one transform result', () => {
		const heading = {
			name: 'core/heading',
			attributes: { content: 'Hi' },
			innerBlocks: [],
		};

		const result = preserveIdOnTransform(
			heading,
			[ paragraph ],
			0,
			resolveFromAttribute
		);

		expect( result.attributes ).toEqual( {
			content: 'Hi',
			lehfgBlockId: 'id-1',
		} );
		expect( heading.attributes.lehfgBlockId ).toBeUndefined();
	} );

	it( 'accepts a single source block instead of an array', () => {
		const heading = {
			name: 'core/heading',
			attributes: {},
			innerBlocks: [],
		};

		expect(
			preserveIdOnTransform( heading, paragraph, 0, resolveFromAttribute )
				.attributes.lehfgBlockId
		).toBe( 'id-1' );
	} );

	it( 'only gives the ID to the first result', () => {
		const second = {
			name: 'core/paragraph',
			attributes: {},
			innerBlocks: [],
		};

		expect(
			preserveIdOnTransform(
				second,
				[ paragraph ],
				1,
				resolveFromAttribute
			)
		).toBe( second );
	} );

	it( 'leaves wrapping transforms alone when the original is nested inside', () => {
		const group = {
			name: 'core/group',
			attributes: {},
			innerBlocks: [ { ...paragraph, clientId: 'copy' } ],
		};

		expect(
			preserveIdOnTransform(
				group,
				[ paragraph ],
				0,
				resolveFromAttribute
			)
		).toBe( group );
	} );

	it( 'ignores many-to-one transforms', () => {
		const merged = { name: 'core/list', attributes: {}, innerBlocks: [] };

		expect(
			preserveIdOnTransform(
				merged,
				[ paragraph, { ...paragraph, clientId: 'p2' } ],
				0,
				resolveFromAttribute
			)
		).toBe( merged );
	} );
} );
