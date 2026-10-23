import {
	describeChanges,
	getFullText,
	getOwnText,
	htmlToText,
} from '../describe-changes';

const paragraph = ( content, attributes = {}, innerBlocks = [] ) => ( {
	name: 'core/paragraph',
	attributes: { content, blockRewindId: 'id-1', ...attributes },
	innerBlocks,
} );

const group = ( innerBlocks, attributes = {} ) => ( {
	name: 'core/group',
	attributes,
	innerBlocks,
} );

describe( 'htmlToText', () => {
	it( 'strips tags, decodes entities and keeps line breaks', () => {
		expect(
			htmlToText( '<strong>Fish</strong> &amp; chips<br>at 5&nbsp;pm' )
		).toBe( 'Fish & chips\nat 5 pm' );
	} );
} );

describe( 'getOwnText', () => {
	it( 'reads text attributes only, in a stable order', () => {
		expect(
			getOwnText( {
				name: 'core/image',
				attributes: {
					caption: 'Caption',
					alt: 'Mountain',
					url: 'https://example.com/a.jpg',
					showCaption: true,
				},
			} )
		).toBe( 'Mountain\n\nCaption' );
	} );

	it( 'reads rich text objects', () => {
		const richText = { toHTMLString: () => 'Rich <em>text</em>' };

		expect( getOwnText( paragraph( richText ) ) ).toBe( 'Rich text' );
	} );

	it( 'leaves out the text of inner blocks', () => {
		expect( getOwnText( group( [ paragraph( 'Inner' ) ] ) ) ).toBe( '' );
		expect( getFullText( group( [ paragraph( 'Inner' ) ] ) ) ).toBe(
			'Inner'
		);
	} );
} );

describe( 'describeChanges', () => {
	it( 'reports no changes for identical blocks with different IDs', () => {
		const changes = describeChanges(
			paragraph( 'Hello' ),
			paragraph( 'Hello', { blockRewindId: 'other' } )
		);

		expect( changes ).toMatchObject( {
			hasChanges: false,
			blockType: null,
			text: null,
			attributes: [],
			innerBlocks: null,
		} );
	} );

	it( 'reports formatting-only text changes', () => {
		const { hasChanges, text } = describeChanges(
			paragraph( 'Hello <strong>there</strong>' ),
			paragraph( 'Hello there' )
		);

		expect( hasChanges ).toBe( true );
		expect( text ).toMatchObject( {
			formattingOnly: true,
			removedWords: 0,
			addedWords: 0,
		} );
	} );

	it( 'reports text changes with word counts', () => {
		const { text } = describeChanges(
			paragraph( 'Hello there. Edit one. Edit two.' ),
			paragraph( 'Hello there. Edit one.' )
		);

		expect( text ).toMatchObject( {
			from: 'Hello there. Edit one. Edit two.',
			to: 'Hello there. Edit one.',
			removedWords: 2,
			addedWords: 0,
		} );
	} );

	it( 'reports changed settings by path with their values', () => {
		const { attributes, text } = describeChanges(
			paragraph( 'Same', {
				backgroundColor: 'accent-1',
				style: { typography: { fontStyle: 'italic' } },
			} ),
			paragraph( 'Same', { style: { typography: {} } } )
		);

		expect( text ).toBeNull();
		expect( attributes ).toEqual( [
			{ path: 'backgroundColor', from: 'accent-1', to: undefined },
			{
				path: 'style.typography.fontStyle',
				from: 'italic',
				to: undefined,
			},
		] );
	} );

	it( 'reports settings added inside a new object at their leaves', () => {
		const { attributes } = describeChanges(
			paragraph( 'Same', {
				style: { typography: { fontStyle: 'italic' } },
			} ),
			paragraph( 'Same' )
		);

		expect( attributes ).toEqual( [
			{
				path: 'style.typography.fontStyle',
				from: 'italic',
				to: undefined,
			},
		] );
	} );

	it( 'reports a change of block type', () => {
		const { blockType } = describeChanges(
			{ name: 'core/heading', attributes: { content: 'Title' } },
			{ blockName: 'core/paragraph', attributes: { content: 'Title' } }
		);

		expect( blockType ).toEqual( {
			from: 'core/heading',
			to: 'core/paragraph',
		} );
	} );

	it( 'reports nested changes once, without counting them as the parent text', () => {
		const changes = describeChanges(
			group( [ paragraph( 'Inner one CHANGED' ), paragraph( 'Two' ) ], {
				layout: { type: 'flex' },
			} ),
			group( [ paragraph( 'Inner one' ), paragraph( 'Two' ) ], {
				layout: { type: 'constrained' },
			} )
		);

		expect( changes.text ).toBeNull();
		expect( changes.attributes ).toEqual( [
			{ path: 'layout.type', from: 'flex', to: 'constrained' },
		] );
		expect( changes.innerBlocks ).toMatchObject( {
			fromCount: 2,
			toCount: 2,
			changed: [
				{
					index: 0,
					fromName: 'core/paragraph',
					toName: 'core/paragraph',
					text: { removedWords: 1, addedWords: 0 },
					attributes: [],
				},
			],
		} );
	} );

	it( 'reports added and removed inner blocks', () => {
		const { innerBlocks } = describeChanges(
			group( [ paragraph( 'One' ) ] ),
			group( [ paragraph( 'One' ), paragraph( 'Two' ) ] )
		);

		expect( innerBlocks ).toMatchObject( {
			fromCount: 1,
			toCount: 2,
			changed: [ { index: 1, fromName: null, toName: 'core/paragraph' } ],
		} );
	} );

	it( 'ignores inner blocks stored in another entity', () => {
		const { hasChanges } = describeChanges(
			{
				name: 'core/block',
				attributes: { ref: 5 },
				innerBlocks: [ paragraph( 'A' ) ],
			},
			{
				blockName: 'core/block',
				attributes: { ref: 5 },
				innerBlocks: [],
			}
		);

		expect( hasChanges ).toBe( false );
	} );
} );
