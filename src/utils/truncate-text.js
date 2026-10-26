// Splits text into the characters people see: graphemes where the browser supports
// it, otherwise code points, so emoji and accents are never cut in half.
export const splitCharacters = ( text ) =>
	typeof Intl !== 'undefined' && Intl.Segmenter
		? Array.from(
				new Intl.Segmenter().segment( text ),
				( { segment } ) => segment
		  )
		: Array.from( text );

/**
 * Shortens text to at most `maxLength` characters, ending with "…" when cut.
 *
 * Only the start of the text is split, so long texts stay cheap to shorten.
 *
 * @param {string} text      Text to shorten.
 * @param {number} maxLength Maximum number of characters, including the "…".
 * @return {string} The text, or its start followed by "…".
 */
export const truncateText = ( text, maxLength ) => {
	// Enough code units for `maxLength` characters in nearly all text.
	const head = text.slice( 0, maxLength * 4 );
	const characters = splitCharacters( head );

	if ( head.length === text.length && characters.length <= maxLength ) {
		return text;
	}

	// The slice may have cut the last character in half.
	if ( head.length < text.length ) {
		characters.pop();
	}

	return `${ characters.slice( 0, maxLength - 1 ).join( '' ) }…`;
};
