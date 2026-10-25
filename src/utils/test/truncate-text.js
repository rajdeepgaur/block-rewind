import { truncateText } from '../truncate-text';

const endsWithLoneSurrogate = ( text ) =>
	/[\uD800-\uDBFF]$/.test( text.replace( /…$/, '' ) );

describe( 'truncateText', () => {
	it( 'keeps text that fits', () => {
		expect( truncateText( 'Short text', 160 ) ).toBe( 'Short text' );
		expect( truncateText( '😀'.repeat( 160 ), 160 ) ).toBe(
			'😀'.repeat( 160 )
		);
	} );

	it( 'cuts long text to the limit, including the ellipsis', () => {
		const result = truncateText( 'a'.repeat( 200 ), 160 );

		expect( result ).toBe( `${ 'a'.repeat( 159 ) }…` );
	} );

	it( 'never ends in half an emoji', () => {
		const result = truncateText( `${ 'a'.repeat( 158 ) }😀😀 tail`, 160 );

		expect( result ).toBe( `${ 'a'.repeat( 158 ) }😀…` );
		expect( endsWithLoneSurrogate( result ) ).toBe( false );
	} );

	it( 'keeps emoji made of several code points whole', () => {
		const family = '👨‍👩‍👧';
		const result = truncateText(
			`${ 'a'.repeat( 158 ) }${ family } tail`,
			160
		);

		expect( result ).toBe( `${ 'a'.repeat( 158 ) }${ family }…` );
	} );

	it( 'never ends in half an emoji when the text is mostly emoji', () => {
		for ( let offset = 0; offset < 4; offset += 1 ) {
			const result = truncateText(
				'a'.repeat( offset ) + '👨‍👩‍👧'.repeat( 200 ),
				160
			);

			expect( endsWithLoneSurrogate( result ) ).toBe( false );
			expect( result.endsWith( '…' ) ).toBe( true );
		}
	} );

	it( 'cuts by code points where graphemes are not supported', () => {
		const { Segmenter } = Intl;
		delete Intl.Segmenter;

		try {
			const result = truncateText(
				`${ 'a'.repeat( 158 ) }😀😀 tail`,
				160
			);

			expect( result ).toBe( `${ 'a'.repeat( 158 ) }😀…` );
		} finally {
			Intl.Segmenter = Segmenter;
		}
	} );
} );
