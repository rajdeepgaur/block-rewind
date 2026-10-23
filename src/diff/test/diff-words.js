import {
	collapseUnchanged,
	countSegmentWords,
	countWords,
	diffWords,
} from '../diff-words';

const join = ( segments ) =>
	segments.map( ( segment ) => segment.text ).join( '' );

const textOf = ( segments, types ) =>
	join( segments.filter( ( segment ) => types.includes( segment.type ) ) );

describe( 'diffWords', () => {
	it( 'returns one equal segment for identical text', () => {
		expect( diffWords( 'Hello there', 'Hello there' ) ).toEqual( [
			{ type: 'equal', text: 'Hello there' },
		] );
	} );

	it( 'marks added words', () => {
		expect( diffWords( 'Hello world', 'Hello big world' ) ).toEqual( [
			{ type: 'equal', text: 'Hello ' },
			{ type: 'added', text: 'big ' },
			{ type: 'equal', text: 'world' },
		] );
	} );

	it( 'marks removed words at the end', () => {
		expect( diffWords( 'Edit one. Edit two.', 'Edit one.' ) ).toEqual( [
			{ type: 'equal', text: 'Edit one.' },
			{ type: 'removed', text: ' Edit two.' },
		] );
	} );

	it( 'keeps a replaced phrase as one removed and one added run', () => {
		const segments = diffWords(
			'start before seven today',
			'start earlier than usual today'
		);

		expect( segments ).toEqual( [
			{ type: 'equal', text: 'start ' },
			{ type: 'removed', text: 'before seven' },
			{ type: 'added', text: 'earlier than usual' },
			{ type: 'equal', text: ' today' },
		] );
	} );

	it( 'rebuilds both texts from the segments', () => {
		const from = 'We walked down the new stairs in a little under an hour.';
		const to = 'We walked down the stairs in about forty minutes, slowly.';
		const segments = diffWords( from, to );

		expect( textOf( segments, [ 'equal', 'removed' ] ) ).toBe( from );
		expect( textOf( segments, [ 'equal', 'added' ] ) ).toBe( to );
	} );

	it( 'handles empty text on either side', () => {
		expect( diffWords( '', 'New text' ) ).toEqual( [
			{ type: 'added', text: 'New text' },
		] );
		expect( diffWords( 'Old text', '' ) ).toEqual( [
			{ type: 'removed', text: 'Old text' },
		] );
		expect( diffWords( '', '' ) ).toEqual( [] );
	} );
} );

describe( 'countWords', () => {
	it( 'counts words, not whitespace', () => {
		expect( countWords( '  Hello there,\n world  ' ) ).toBe( 3 );
		expect( countWords( '' ) ).toBe( 0 );
	} );

	it( 'counts the words of one segment type', () => {
		const segments = diffWords( 'one two three', 'one four five three' );

		expect( countSegmentWords( segments, 'removed' ) ).toBe( 1 );
		expect( countSegmentWords( segments, 'added' ) ).toBe( 2 );
	} );
} );

describe( 'collapseUnchanged', () => {
	const words = ( count, prefix = 'w' ) =>
		Array.from(
			{ length: count },
			( _, index ) => `${ prefix }${ index }`
		).join( ' ' );

	it( 'keeps short unchanged runs', () => {
		const segments = diffWords( 'a b c', 'a x c' );

		expect( collapseUnchanged( segments, 2 ) ).toEqual( segments );
	} );

	it( 'shortens a long run between two changes to context on both sides', () => {
		const middle = words( 20 );
		const segments = diffWords(
			`start ${ middle } end`,
			`begin ${ middle } finish`
		);
		const collapsed = collapseUnchanged( segments, 2 );

		expect( collapsed ).toEqual( [
			{ type: 'removed', text: 'start' },
			{ type: 'added', text: 'begin' },
			{ type: 'equal', text: ' w0 w1 ' },
			{ type: 'gap', words: 16, index: 2 },
			{ type: 'equal', text: ' w18 w19 ' },
			{ type: 'removed', text: 'end' },
			{ type: 'added', text: 'finish' },
		] );
	} );

	it( 'keeps only the words next to the change at the start and end', () => {
		const segments = diffWords(
			`${ words( 12, 'a' ) } old ${ words( 12, 'b' ) }`,
			`${ words( 12, 'a' ) } new ${ words( 12, 'b' ) }`
		);
		const collapsed = collapseUnchanged( segments, 3 );

		expect( collapsed[ 0 ] ).toEqual( { type: 'gap', words: 9, index: 0 } );
		expect( collapsed[ collapsed.length - 1 ] ).toEqual( {
			type: 'gap',
			words: 9,
			index: segments.length - 1,
		} );
	} );

	it( 'shows expanded runs in full', () => {
		const segments = diffWords(
			`${ words( 12, 'a' ) } old ${ words( 12, 'b' ) }`,
			`${ words( 12, 'a' ) } new ${ words( 12, 'b' ) }`
		);
		const collapsed = collapseUnchanged( segments, 3, new Set( [ 0 ] ) );

		expect( collapsed[ 0 ] ).toEqual( segments[ 0 ] );
		expect( collapsed[ collapsed.length - 1 ] ).toMatchObject( {
			type: 'gap',
		} );
	} );
} );
