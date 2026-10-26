import { collapseUnchanged, countWords, diffText } from '../diff-words';

const diffWords = ( from, to ) => diffText( from, to ).segments;

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

	it( 'marks only the letters typed onto the end of a word', () => {
		expect( diffWords( 'Test 7 jggbt4rev', 'Test 7 jgg' ) ).toEqual( [
			{ type: 'equal', text: 'Test 7 jgg' },
			{ type: 'removed', text: 'bt4rev' },
		] );
	} );

	it( 'marks only the letters that differ inside a word', () => {
		expect( diffWords( 'I recieve it', 'I receive it' ) ).toEqual( [
			{ type: 'equal', text: 'I rec' },
			{ type: 'removed', text: 'ie' },
			{ type: 'added', text: 'ei' },
			{ type: 'equal', text: 've it' },
		] );
	} );

	it( 'marks letter changes in several words replaced one for one', () => {
		expect( diffWords( 'helo wrold fox', 'hello world fox' ) ).toEqual( [
			{ type: 'equal', text: 'hel' },
			{ type: 'added', text: 'l' },
			{ type: 'equal', text: 'o w' },
			{ type: 'removed', text: 'ro' },
			{ type: 'added', text: 'or' },
			{ type: 'equal', text: 'ld fox' },
		] );
	} );

	it( 'keeps swapped letters as whole words', () => {
		expect( diffWords( 'teh end', 'the end' ) ).toEqual( [
			{ type: 'removed', text: 'teh' },
			{ type: 'added', text: 'the' },
			{ type: 'equal', text: ' end' },
		] );
	} );

	it( 'keeps whole words when the words are not alike', () => {
		expect( diffWords( 'the cat sat', 'the dog sat' ) ).toEqual( [
			{ type: 'equal', text: 'the ' },
			{ type: 'removed', text: 'cat' },
			{ type: 'added', text: 'dog' },
			{ type: 'equal', text: ' sat' },
		] );
		expect( diffWords( 'a red car', 'a blue bike' ) ).toEqual( [
			{ type: 'equal', text: 'a ' },
			{ type: 'removed', text: 'red car' },
			{ type: 'added', text: 'blue bike' },
		] );
	} );

	it( 'keeps whole words when one of several replaced words is not alike', () => {
		expect( diffWords( 'say helo cat', 'say hello dog' ) ).toEqual( [
			{ type: 'equal', text: 'say ' },
			{ type: 'removed', text: 'helo cat' },
			{ type: 'added', text: 'hello dog' },
		] );
	} );

	it( 'never splits an emoji or accented letter', () => {
		expect( diffWords( 'Go 👍🏽!', 'Go 👍🏻!' ) ).toEqual( [
			{ type: 'equal', text: 'Go ' },
			{ type: 'removed', text: '👍🏽' },
			{ type: 'added', text: '👍🏻' },
			{ type: 'equal', text: '!' },
		] );
		expect( diffWords( 'café', 'cafe\u0301s' ) ).toEqual( [
			{ type: 'equal', text: 'caf' },
			{ type: 'removed', text: 'é' },
			{ type: 'added', text: 'e\u0301s' },
		] );
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
} );

describe( 'diffText counts', () => {
	const counts = ( from, to ) => {
		const { changedWords, removedWords, addedWords } = diffText( from, to );
		return { changedWords, removedWords, addedWords };
	};

	it( 'counts a removed word followed by an added one as one change', () => {
		expect( counts( 'Test 7 jggbt4rev', 'Test 7 jgg' ) ).toEqual( {
			changedWords: 1,
			removedWords: 0,
			addedWords: 0,
		} );
		expect( counts( 'the cat sat', 'the dog sat' ) ).toEqual( {
			changedWords: 1,
			removedWords: 0,
			addedWords: 0,
		} );
	} );

	it( 'counts the words beyond the pairs as removed or added', () => {
		expect( counts( 'one two three four', 'one five four' ) ).toEqual( {
			changedWords: 1,
			removedWords: 1,
			addedWords: 0,
		} );
		expect( counts( 'one two three', 'one four five three' ) ).toEqual( {
			changedWords: 1,
			removedWords: 0,
			addedWords: 1,
		} );
	} );

	it( 'adds up the counts of separate changes', () => {
		expect(
			counts(
				'Edit one here. Keep this.',
				'Edit two here. Keep this. New end'
			)
		).toEqual( {
			changedWords: 1,
			removedWords: 0,
			addedWords: 2,
		} );
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
