import { BLOCK_ID_ATTRIBUTE } from '../constants';
import {
	computeBlockHash,
	stableStringify,
} from '../serialization/serialize-block';
import { hasExternalInnerBlocks } from '../utils/external-content';
import { countSegmentWords, diffWords } from './diff-words';

// Attributes whose string values are the block's readable text.
const TEXT_KEY_PATTERN =
	/(content|text|title|caption|label|alt|placeholder|description|heading|subheading|body|value|citation)$/i;

const ENTITIES = {
	amp: '&',
	lt: '<',
	gt: '>',
	quot: '"',
	apos: "'",
	nbsp: ' ',
};

const decodeEntities = ( text ) =>
	text.replace( /&(#x?[0-9a-f]+|[a-z]+);/gi, ( match, entity ) => {
		if ( entity[ 0 ] === '#' ) {
			const code =
				entity[ 1 ].toLowerCase() === 'x'
					? parseInt( entity.slice( 2 ), 16 )
					: parseInt( entity.slice( 1 ), 10 );
			return Number.isFinite( code )
				? String.fromCodePoint( code )
				: match;
		}

		return ENTITIES[ entity.toLowerCase() ] ?? match;
	} );

// Converts rich text (HTML) to plain text, keeping line breaks.
export const htmlToText = ( html ) =>
	decodeEntities(
		String( html || '' )
			.replace( /<br\s*\/?>/gi, '\n' )
			.replace( /<[^>]*>/g, '' )
	)
		.replace( /[^\S\n]+/g, ' ' )
		.replace( / ?\n ?/g, '\n' )
		.trim();

// Rich text attributes of editor blocks are RichTextData objects; stored ones are strings.
const toTextValue = ( value ) => {
	if ( typeof value === 'string' ) {
		return value;
	}

	if ( value && typeof value.toHTMLString === 'function' ) {
		return value.toHTMLString();
	}

	return null;
};

const getBlockName = ( block ) => block?.name || block?.blockName || '';

const getOwnInnerBlocks = ( block ) =>
	! block || hasExternalInnerBlocks( block ) ? [] : block.innerBlocks || [];

const isTextAttribute = ( key, value ) =>
	TEXT_KEY_PATTERN.test( key ) && toTextValue( value ) !== null;

/**
 * Returns a block's own readable text (not that of its inner blocks).
 *
 * Text attributes are joined with blank lines, in alphabetical key order so the
 * result does not depend on how the attributes object was built.
 *
 * @param {Object} block Editor block or stored snapshot.
 * @return {string} Plain text.
 */
export const getOwnText = ( block ) =>
	getOwnRichText( block ).map( htmlToText ).filter( Boolean ).join( '\n\n' );

// The block's text attributes as rich text (HTML), in alphabetical key order.
const getOwnRichText = ( block ) =>
	Object.keys( block?.attributes || {} )
		.filter( ( key ) => isTextAttribute( key, block.attributes[ key ] ) )
		.sort()
		.map( ( key ) => toTextValue( block.attributes[ key ] ) );

// Returns the readable text of a block and all its inner blocks.
export const getFullText = ( block ) =>
	[ getOwnText( block ), ...getOwnInnerBlocks( block ).map( getFullText ) ]
		.filter( Boolean )
		.join( '\n\n' );

// Plain JSON copy of the non-text attributes, without the plugin's own ID.
const getSettingAttributes = ( block ) => {
	const settings = {};

	Object.entries( block?.attributes || {} ).forEach( ( [ key, value ] ) => {
		if (
			key === BLOCK_ID_ATTRIBUTE ||
			key === 'clientId' ||
			isTextAttribute( key, value ) ||
			value === undefined
		) {
			return;
		}

		settings[ key ] = JSON.parse( stableStringify( value ) );
	} );

	return settings;
};

const isPlainObject = ( value ) =>
	Boolean( value ) && typeof value === 'object' && ! Array.isArray( value );

// Lists the dotted paths of attributes that differ; objects are compared key by key.
const diffAttributePaths = ( fromValue, toValue, prefix = '' ) => {
	const keys = new Set( [
		...Object.keys( fromValue || {} ),
		...Object.keys( toValue || {} ),
	] );
	const paths = [];

	Array.from( keys )
		.sort()
		.forEach( ( key ) => {
			const from = fromValue?.[ key ];
			const to = toValue?.[ key ];
			const path = prefix ? `${ prefix }.${ key }` : key;

			// An object added or removed is compared with an empty one, so the
			// change is reported at its leaves ("style.typography.fontStyle").
			const isObjectChange =
				( isPlainObject( from ) || from === undefined ) &&
				( isPlainObject( to ) || to === undefined );

			if ( isObjectChange ) {
				paths.push( ...diffAttributePaths( from, to, path ) );
				return;
			}

			if ( stableStringify( from ) !== stableStringify( to ) ) {
				paths.push( path );
			}
		} );

	return paths;
};

const getPath = ( object, path ) =>
	path
		.split( '.' )
		.reduce(
			( value, key ) =>
				isPlainObject( value ) ? value[ key ] : undefined,
			object
		);

// Compares the text of two blocks; null when the text is the same. When only the
// formatting differs (bold, links), the words are equal and `formattingOnly` is set.
const describeText = ( fromText, toText, isFormattingChanged = false ) => {
	if ( fromText === toText && ! isFormattingChanged ) {
		return null;
	}

	const segments = diffWords( fromText, toText );

	return {
		from: fromText,
		to: toText,
		segments,
		removedWords: countSegmentWords( segments, 'removed' ),
		addedWords: countSegmentWords( segments, 'added' ),
		formattingOnly: fromText === toText,
	};
};

const describeOwnText = ( fromBlock, toBlock ) =>
	describeText(
		getOwnText( fromBlock ),
		getOwnText( toBlock ),
		stableStringify( getOwnRichText( fromBlock ) ) !==
			stableStringify( getOwnRichText( toBlock ) )
	);

// Compares inner blocks position by position; null when they are the same.
const describeInnerBlocks = ( fromBlocks, toBlocks ) => {
	const changed = [];
	const length = Math.max( fromBlocks.length, toBlocks.length );

	for ( let index = 0; index < length; index += 1 ) {
		const from = fromBlocks[ index ];
		const to = toBlocks[ index ];

		if (
			from &&
			to &&
			computeBlockHash( from ) === computeBlockHash( to )
		) {
			continue;
		}

		changed.push( {
			index,
			fromName: from ? getBlockName( from ) : null,
			toName: to ? getBlockName( to ) : null,
			text:
				from && to
					? describeOwnText( from, to )
					: describeText(
							from ? getFullText( from ) : '',
							to ? getFullText( to ) : ''
					  ),
			attributes:
				from && to
					? diffAttributePaths(
							getSettingAttributes( from ),
							getSettingAttributes( to )
					  )
					: [],
		} );
	}

	if ( ! changed.length ) {
		return null;
	}

	return {
		fromCount: fromBlocks.length,
		toCount: toBlocks.length,
		changed,
	};
};

/**
 * Describes what changes when a block goes from one state to another.
 *
 * Text is compared word by word and reported once, separately from settings, so an
 * edit is never counted twice. Inner blocks are compared by position and reported on
 * their own; the block's text covers only its own attributes.
 *
 * @param {Object} fromBlock Block state before (editor block or stored snapshot).
 * @param {Object} toBlock   Block state after.
 * @return {Object} `{ hasChanges, blockType, text, attributes, innerBlocks, settings }`,
 *                  where `blockType` is `{ from, to }` or null, `text` is a word diff
 *                  or null, `attributes` lists `{ path, from, to }`, `innerBlocks` is
 *                  `{ fromCount, toCount, changed }` or null, and `settings` holds the
 *                  compared non-text attributes as `{ from, to }`.
 */
export const describeChanges = ( fromBlock, toBlock ) => {
	const fromName = getBlockName( fromBlock );
	const toName = getBlockName( toBlock );
	const fromSettings = getSettingAttributes( fromBlock );
	const toSettings = getSettingAttributes( toBlock );

	const blockType =
		fromName === toName ? null : { from: fromName, to: toName };
	const text = describeOwnText( fromBlock, toBlock );
	const attributes = diffAttributePaths( fromSettings, toSettings ).map(
		( path ) => ( {
			path,
			from: getPath( fromSettings, path ),
			to: getPath( toSettings, path ),
		} )
	);
	const innerBlocks = describeInnerBlocks(
		getOwnInnerBlocks( fromBlock ),
		getOwnInnerBlocks( toBlock )
	);

	return {
		hasChanges: Boolean(
			blockType || text || attributes.length || innerBlocks
		),
		blockType,
		text,
		attributes,
		innerBlocks,
		settings: { from: fromSettings, to: toSettings },
	};
};
