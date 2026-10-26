import { splitCharacters } from '../utils/truncate-text';

// Above this many comparisons the diff falls back to "all removed, all added".
const MAX_DIFF_CELLS = 1000000;

// Splits text into words and the whitespace between them, so joining the tokens
// gives back the original text.
const tokenize = ( text ) => String( text || '' ).match( /\s+|\S+/g ) || [];

const isWhitespace = ( token ) => /^\s+$/.test( token );

// Appends text to a segment list, merging it into the last segment of the same type.
const pushSegment = ( segments, type, text ) => {
	if ( ! text ) {
		return;
	}

	const last = segments[ segments.length - 1 ];
	if ( last && last.type === type ) {
		last.text += text;
		return;
	}

	segments.push( { type, text } );
};

// Longest common subsequence of two token lists, as equal/removed/added steps.
const diffTokens = ( fromTokens, toTokens ) => {
	const rows = fromTokens.length;
	const columns = toTokens.length;

	if ( rows * columns > MAX_DIFF_CELLS ) {
		return [
			...fromTokens.map( ( text ) => ( { type: 'removed', text } ) ),
			...toTokens.map( ( text ) => ( { type: 'added', text } ) ),
		];
	}

	// lengths[ i * ( columns + 1 ) + j ]: LCS length of fromTokens[ i.. ] and toTokens[ j.. ].
	const width = columns + 1;
	const lengths = new Uint32Array( ( rows + 1 ) * width );

	for ( let i = rows - 1; i >= 0; i -= 1 ) {
		for ( let j = columns - 1; j >= 0; j -= 1 ) {
			lengths[ i * width + j ] =
				fromTokens[ i ] === toTokens[ j ]
					? lengths[ ( i + 1 ) * width + j + 1 ] + 1
					: Math.max(
							lengths[ ( i + 1 ) * width + j ],
							lengths[ i * width + j + 1 ]
					  );
		}
	}

	const steps = [];
	let i = 0;
	let j = 0;

	while ( i < rows && j < columns ) {
		if ( fromTokens[ i ] === toTokens[ j ] ) {
			steps.push( { type: 'equal', text: fromTokens[ i ] } );
			i += 1;
			j += 1;
		} else if (
			lengths[ ( i + 1 ) * width + j ] >= lengths[ i * width + j + 1 ]
		) {
			steps.push( { type: 'removed', text: fromTokens[ i ] } );
			i += 1;
		} else {
			steps.push( { type: 'added', text: toTokens[ j ] } );
			j += 1;
		}
	}

	for ( ; i < rows; i += 1 ) {
		steps.push( { type: 'removed', text: fromTokens[ i ] } );
	}

	for ( ; j < columns; j += 1 ) {
		steps.push( { type: 'added', text: toTokens[ j ] } );
	}

	return steps;
};

// Counts the words in a text.
export const countWords = ( text ) =>
	tokenize( text ).filter( ( token ) => ! isWhitespace( token ) ).length;

// Characters the two words share at their start and at their end. The end is only
// matched in what is left after the start, so the two never overlap.
const getSharedEdges = ( fromCharacters, toCharacters ) => {
	const shorter = Math.min( fromCharacters.length, toCharacters.length );
	let start = 0;
	while (
		start < shorter &&
		fromCharacters[ start ] === toCharacters[ start ]
	) {
		start += 1;
	}

	let end = 0;
	while (
		end < shorter - start &&
		fromCharacters[ fromCharacters.length - 1 - end ] ===
			toCharacters[ toCharacters.length - 1 - end ]
	) {
		end += 1;
	}

	return { start, end, shorter };
};

// Whether two words are alike enough to compare letter by letter: together, their
// shared start and end cover at least half of the shorter word.
const isSimilarWord = ( fromWord, toWord ) => {
	const { start, end, shorter } = getSharedEdges(
		splitCharacters( fromWord ),
		splitCharacters( toWord )
	);
	return start + end >= Math.ceil( shorter / 2 );
};

// Marks only the middle of a replaced word, e.g. "jgg" + removed "bt4rev".
const pushWordChange = ( segments, fromWord, toWord ) => {
	const fromCharacters = splitCharacters( fromWord );
	const toCharacters = splitCharacters( toWord );
	const { start, end } = getSharedEdges( fromCharacters, toCharacters );
	const join = ( characters ) => characters.join( '' );

	pushSegment( segments, 'equal', join( fromCharacters.slice( 0, start ) ) );
	pushSegment(
		segments,
		'removed',
		join( fromCharacters.slice( start, fromCharacters.length - end ) )
	);
	pushSegment(
		segments,
		'added',
		join( toCharacters.slice( start, toCharacters.length - end ) )
	);
	pushSegment(
		segments,
		'equal',
		join( fromCharacters.slice( fromCharacters.length - end ) )
	);
};

// Whether a changed stretch replaces words one for one, with the same spacing,
// by similar words, e.g. a typo fix or a word typed on.
const isWordForWordChange = ( fromTokens, toTokens ) =>
	fromTokens.length === toTokens.length &&
	fromTokens.every( ( fromToken, index ) => {
		const toToken = toTokens[ index ];
		return isWhitespace( fromToken ) || isWhitespace( toToken )
			? fromToken === toToken
			: isSimilarWord( fromToken, toToken );
	} );

/**
 * Compares two texts word by word.
 *
 * Whitespace between two changed words is attached to the change, so a replaced
 * phrase reads as one removed and one added run rather than alternating words.
 * When words are replaced one for one by similar words, only the letters that
 * differ are marked.
 *
 * Counts treat a removed word followed by an added one as one changed word.
 *
 * @param {string} fromText Text before.
 * @param {string} toText   Text after.
 * @return {{segments: Array<{type: 'equal'|'removed'|'added', text: string}>, changedWords: number, removedWords: number, addedWords: number}}
 *         Segments in reading order, and the number of words changed, only removed and only added.
 */
export const diffText = ( fromText, toText ) => {
	const fromTokens = tokenize( fromText );
	const toTokens = tokenize( toText );

	// Common leading and trailing tokens never need the quadratic comparison.
	let start = 0;
	while (
		start < fromTokens.length &&
		start < toTokens.length &&
		fromTokens[ start ] === toTokens[ start ]
	) {
		start += 1;
	}

	let fromEnd = fromTokens.length;
	let toEnd = toTokens.length;
	while (
		fromEnd > start &&
		toEnd > start &&
		fromTokens[ fromEnd - 1 ] === toTokens[ toEnd - 1 ]
	) {
		fromEnd -= 1;
		toEnd -= 1;
	}

	const steps = [
		...fromTokens
			.slice( 0, start )
			.map( ( text ) => ( { type: 'equal', text } ) ),
		...diffTokens(
			fromTokens.slice( start, fromEnd ),
			toTokens.slice( start, toEnd )
		),
		...fromTokens
			.slice( fromEnd )
			.map( ( text ) => ( { type: 'equal', text } ) ),
	];

	// A whitespace token kept between two changes belongs to the change on both
	// sides, so each changed stretch is handled as one.
	const removed = [];
	const added = [];
	const segments = [];
	const counts = { changedWords: 0, removedWords: 0, addedWords: 0 };

	const flushChanges = () => {
		const removedCount = countWords( removed.join( '' ) );
		const addedCount = countWords( added.join( '' ) );
		const changedCount = Math.min( removedCount, addedCount );
		counts.changedWords += changedCount;
		counts.removedWords += removedCount - changedCount;
		counts.addedWords += addedCount - changedCount;

		if ( changedCount && isWordForWordChange( removed, added ) ) {
			removed.forEach( ( fromToken, index ) =>
				isWhitespace( fromToken )
					? pushSegment( segments, 'equal', fromToken )
					: pushWordChange( segments, fromToken, added[ index ] )
			);
		} else {
			pushSegment( segments, 'removed', removed.join( '' ) );
			pushSegment( segments, 'added', added.join( '' ) );
		}

		removed.length = 0;
		added.length = 0;
	};

	steps.forEach( ( step, index ) => {
		if ( step.type === 'removed' ) {
			removed.push( step.text );
			return;
		}

		if ( step.type === 'added' ) {
			added.push( step.text );
			return;
		}

		const next = steps[ index + 1 ];
		const isInsideChange =
			isWhitespace( step.text ) &&
			( removed.length || added.length ) &&
			next &&
			next.type !== 'equal';

		if ( isInsideChange ) {
			removed.push( step.text );
			added.push( step.text );
			return;
		}

		flushChanges();
		pushSegment( segments, 'equal', step.text );
	} );

	flushChanges();
	return { segments, ...counts };
};

/**
 * Shortens long unchanged runs to a few words of context around each change.
 *
 * @param {Array<{type: string, text: string}>} segments Segments from diffText().
 * @param {number}                              context  Words kept next to a change.
 * @param {Set<number>}                         expanded Indexes of segments shown in full.
 * @return {Array<{type: string, text?: string, words?: number, index?: number}>} Segments,
 *         where shortened runs are replaced by `{ type: 'gap', words, index }`, `index`
 *         being the position of the shortened segment.
 */
export const collapseUnchanged = (
	segments,
	context = 8,
	expanded = new Set()
) => {
	const collapsed = [];

	segments.forEach( ( segment, index ) => {
		if ( segment.type !== 'equal' || expanded.has( index ) ) {
			collapsed.push( segment );
			return;
		}

		const tokens = tokenize( segment.text );
		const wordIndexes = tokens
			.map( ( token, tokenIndex ) =>
				isWhitespace( token ) ? -1 : tokenIndex
			)
			.filter( ( tokenIndex ) => tokenIndex !== -1 );

		const keepBefore = index > 0 ? context : 0;
		const keepAfter = index < segments.length - 1 ? context : 0;

		if ( wordIndexes.length <= keepBefore + keepAfter + context ) {
			collapsed.push( segment );
			return;
		}

		const headEnd = keepBefore ? wordIndexes[ keepBefore - 1 ] + 1 : 0;
		const tailStart = keepAfter
			? wordIndexes[ wordIndexes.length - keepAfter ]
			: tokens.length;
		const head = tokens.slice( 0, headEnd ).join( '' );
		const tail = tokens.slice( tailStart ).join( '' );

		if ( head ) {
			collapsed.push( { type: 'equal', text: `${ head } ` } );
		}
		collapsed.push( {
			type: 'gap',
			words: wordIndexes.length - keepBefore - keepAfter,
			index,
		} );
		if ( tail ) {
			collapsed.push( { type: 'equal', text: ` ${ tail }` } );
		}
	} );

	return collapsed;
};
