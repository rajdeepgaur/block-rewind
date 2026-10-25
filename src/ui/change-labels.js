import { getBlockType } from '@wordpress/blocks';
import { __, _n, sprintf } from '@wordpress/i18n';

import { getPath } from '../diff/describe-changes';
import { countWords } from '../diff/diff-words';
import { truncateText } from '../utils/truncate-text';

// Readable names of common block attributes, keyed by attribute name.
const ATTRIBUTE_LABELS = {
	align: __( 'Alignment', 'block-rewind' ),
	anchor: __( 'HTML anchor', 'block-rewind' ),
	aspectRatio: __( 'Aspect ratio', 'block-rewind' ),
	backgroundColor: __( 'Background color', 'block-rewind' ),
	borderColor: __( 'Border color', 'block-rewind' ),
	className: __( 'Additional CSS classes', 'block-rewind' ),
	dropCap: __( 'Drop cap', 'block-rewind' ),
	fontFamily: __( 'Font', 'block-rewind' ),
	fontSize: __( 'Font size', 'block-rewind' ),
	gradient: __( 'Background gradient', 'block-rewind' ),
	height: __( 'Height', 'block-rewind' ),
	href: __( 'Link', 'block-rewind' ),
	id: __( 'Media', 'block-rewind' ),
	layout: __( 'Layout', 'block-rewind' ),
	level: __( 'Heading level', 'block-rewind' ),
	linkDestination: __( 'Link to', 'block-rewind' ),
	linkTarget: __( 'Open in new tab', 'block-rewind' ),
	lock: __( 'Lock', 'block-rewind' ),
	mediaId: __( 'Media', 'block-rewind' ),
	minHeight: __( 'Minimum height', 'block-rewind' ),
	ordered: __( 'List type', 'block-rewind' ),
	rel: __( 'Link relationship', 'block-rewind' ),
	reversed: __( 'Reverse order', 'block-rewind' ),
	scale: __( 'Scale', 'block-rewind' ),
	sizeSlug: __( 'Image size', 'block-rewind' ),
	start: __( 'Start value', 'block-rewind' ),
	tagName: __( 'HTML element', 'block-rewind' ),
	textAlign: __( 'Text alignment', 'block-rewind' ),
	textColor: __( 'Text color', 'block-rewind' ),
	url: __( 'URL', 'block-rewind' ),
	verticalAlignment: __( 'Vertical alignment', 'block-rewind' ),
	width: __( 'Width', 'block-rewind' ),
};

// Readable names of block style settings, keyed by the path below `style`.
const STYLE_LABELS = {
	'border.color': __( 'Border color', 'block-rewind' ),
	'border.radius': __( 'Corner radius', 'block-rewind' ),
	'border.style': __( 'Border style', 'block-rewind' ),
	'border.width': __( 'Border width', 'block-rewind' ),
	'color.background': __( 'Background color', 'block-rewind' ),
	'color.gradient': __( 'Background gradient', 'block-rewind' ),
	'color.text': __( 'Text color', 'block-rewind' ),
	'dimensions.aspectRatio': __( 'Aspect ratio', 'block-rewind' ),
	'dimensions.minHeight': __( 'Minimum height', 'block-rewind' ),
	'elements.link.color.text': __( 'Link color', 'block-rewind' ),
	shadow: __( 'Shadow', 'block-rewind' ),
	'spacing.blockGap': __( 'Block spacing', 'block-rewind' ),
	'spacing.margin': __( 'Margin', 'block-rewind' ),
	'spacing.padding': __( 'Padding', 'block-rewind' ),
	'typography.fontFamily': __( 'Font', 'block-rewind' ),
	'typography.fontSize': __( 'Font size', 'block-rewind' ),
	'typography.fontStyle': __( 'Font style', 'block-rewind' ),
	'typography.fontWeight': __( 'Font weight', 'block-rewind' ),
	'typography.letterSpacing': __( 'Letter spacing', 'block-rewind' ),
	'typography.lineHeight': __( 'Line height', 'block-rewind' ),
	'typography.textDecoration': __( 'Decoration', 'block-rewind' ),
	'typography.textTransform': __( 'Letter case', 'block-rewind' ),
	'typography.writingMode': __( 'Orientation', 'block-rewind' ),
};

// Attributes whose values are color slugs from the palette.
const COLOR_SLUG_ATTRIBUTES = new Set( [
	'backgroundColor',
	'textColor',
	'borderColor',
] );

const MAX_VALUE_LENGTH = 40;

// "fontStyle" -> "Font style", "is_stacked" -> "Is stacked".
const humanize = ( key ) => {
	const words = key
		.replace( /([a-z0-9])([A-Z])/g, '$1 $2' )
		.replace( /[_-]+/g, ' ' )
		.toLowerCase();
	return words.charAt( 0 ).toUpperCase() + words.slice( 1 );
};

/**
 * Returns the key that groups a changed attribute path into one row, and its label.
 *
 * Paths below `layout` form one "Layout" row; style paths group at the level users
 * see in the editor ("Padding" for every side), so a change is one readable row.
 *
 * @param {string} path Dotted attribute path, e.g. "style.spacing.padding.top".
 * @return {{key: string, label: string}} Group key and label.
 */
export const getAttributeGroup = ( path ) => {
	const [ root ] = path.split( '.' );

	if ( root === 'layout' ) {
		return { key: 'layout', label: ATTRIBUTE_LABELS.layout };
	}

	if ( root === 'style' ) {
		const stylePath = path.slice( 'style.'.length );
		const match = Object.keys( STYLE_LABELS ).find(
			( key ) => stylePath === key || stylePath.startsWith( `${ key }.` )
		);

		if ( match ) {
			return { key: `style.${ match }`, label: STYLE_LABELS[ match ] };
		}

		return {
			key: path,
			label: humanize( path.split( '.' ).pop() ),
		};
	}

	if ( root === 'metadata' ) {
		return { key: 'metadata', label: __( 'Block name', 'block-rewind' ) };
	}

	return {
		key: root,
		label: ATTRIBUTE_LABELS[ root ] || humanize( root ),
	};
};

// The title of a block type, e.g. "Paragraph", or its name when not registered.
export const getBlockTitle = ( blockName ) =>
	getBlockType( blockName )?.title || blockName;

const truncate = ( text ) => truncateText( text, MAX_VALUE_LENGTH );

// Finds a preset by slug, including "var:preset|color|accent-1" references.
const findPreset = ( presets, value ) => {
	if ( typeof value !== 'string' ) {
		return null;
	}

	const slug = value.startsWith( 'var:preset|' )
		? value.split( '|' ).pop()
		: value;

	return ( presets || [] ).find( ( preset ) => preset.slug === slug ) || null;
};

const describeLayout = ( layout ) => {
	if ( ! layout?.type || layout.type === 'default' ) {
		return __( 'Flow', 'block-rewind' );
	}

	if ( layout.type === 'flex' ) {
		return layout.orientation === 'vertical'
			? __( 'Stack', 'block-rewind' )
			: __( 'Row', 'block-rewind' );
	}

	if ( layout.type === 'grid' ) {
		return __( 'Grid', 'block-rewind' );
	}

	if ( layout.type === 'constrained' ) {
		return __( 'Constrained', 'block-rewind' );
	}

	return humanize( layout.type );
};

const describePlainValue = ( value ) => {
	if ( value === undefined || value === null || value === '' ) {
		return __( 'Default', 'block-rewind' );
	}

	if ( typeof value === 'boolean' ) {
		return value ? __( 'On', 'block-rewind' ) : __( 'Off', 'block-rewind' );
	}

	if ( typeof value === 'number' ) {
		return String( value );
	}

	if ( typeof value === 'string' ) {
		const text = value.startsWith( 'var:preset|' )
			? value.split( '|' ).pop()
			: value;

		// Keywords such as "italic" or "center" read as words: "Italic", "Center".
		return truncate(
			/^[a-z][a-z-]*$/.test( text ) ? humanize( text ) : text
		);
	}

	if ( typeof value === 'object' ) {
		const leaves = Object.entries( value ).filter(
			( [ , leaf ] ) => leaf !== undefined && typeof leaf !== 'object'
		);

		if ( leaves.length && leaves.length === Object.keys( value ).length ) {
			return truncate(
				leaves
					.map(
						( [ key, leaf ] ) =>
							`${ humanize( key ) }: ${ describePlainValue(
								leaf
							) }`
					)
					.join( ', ' )
			);
		}
	}

	return __( 'Custom', 'block-rewind' );
};

/**
 * Formats the value of an attribute group for display.
 *
 * @param {string} key      Group key from getAttributeGroup().
 * @param {Object} settings The block's non-text attributes.
 * @param {Object} presets  Editor presets: `{ colors, fontSizes, gradients }`.
 * @return {{text: string, swatch?: string}} Display text and an optional color.
 */
const formatAttributeValue = ( key, settings, presets = {} ) => {
	const value = getPath( settings, key );

	if ( key === 'layout' ) {
		return { text: describeLayout( value ) };
	}

	if ( key === 'level' && typeof value === 'number' ) {
		return { text: `H${ value }` };
	}

	if ( key === 'ordered' ) {
		return {
			text: value
				? __( 'Numbered', 'block-rewind' )
				: __( 'Bulleted', 'block-rewind' ),
		};
	}

	const isColor =
		COLOR_SLUG_ATTRIBUTES.has( key ) ||
		/^style\.(color|border\.color|elements\.link\.color)/.test( key );

	if ( isColor ) {
		const preset = findPreset( presets.colors, value );
		if ( preset ) {
			return { text: preset.name, swatch: preset.color };
		}

		if ( typeof value === 'string' && /^#|^rgb|^hsl/.test( value ) ) {
			return { text: value, swatch: value };
		}
	}

	if ( key === 'gradient' || key === 'style.color.gradient' ) {
		const preset = findPreset( presets.gradients, value );
		if ( preset ) {
			return { text: preset.name, swatch: preset.gradient };
		}
	}

	if ( key === 'fontSize' || key === 'style.typography.fontSize' ) {
		const preset = findPreset( presets.fontSizes, value );
		if ( preset ) {
			return { text: preset.name };
		}
	}

	return { text: describePlainValue( value ) };
};

const formatWordCount = ( count ) =>
	sprintf(
		/* translators: %d: number of words. */
		_n( '%d word', '%d words', count, 'block-rewind' ),
		count
	);

const formatBlockCount = ( count ) =>
	sprintf(
		/* translators: %d: number of blocks. */
		_n( '%d block', '%d blocks', count, 'block-rewind' ),
		count
	);

/**
 * Builds the rows of the "Restoring will change" table.
 *
 * @param {Object} changes Result of describeChanges( currentBlock, version ).
 * @param {Object} presets Editor presets: `{ colors, fontSizes, gradients }`.
 * @return {Array<Object>} Rows of `{ key, label, now, after, note?, link? }`, where
 *                         `now` and `after` are `{ text, swatch? }`.
 */
export const getChangeRows = ( changes, presets ) => {
	const rows = [];

	if ( changes.blockType ) {
		rows.push( {
			key: 'blockType',
			label: __( 'Block type', 'block-rewind' ),
			now: { text: getBlockTitle( changes.blockType.from ) },
			after: { text: getBlockTitle( changes.blockType.to ) },
		} );
	}

	if ( changes.text ) {
		const { from, to, removedWords, addedWords, formattingOnly } =
			changes.text;
		const notes = [];

		if ( removedWords ) {
			notes.push(
				sprintf(
					/* translators: %d: number of words. */
					_n(
						'%d removed',
						'%d removed',
						removedWords,
						'block-rewind'
					),
					removedWords
				)
			);
		}

		if ( addedWords ) {
			notes.push(
				sprintf(
					/* translators: %d: number of words. */
					_n(
						'%d brought back',
						'%d brought back',
						addedWords,
						'block-rewind'
					),
					addedWords
				)
			);
		}

		rows.push( {
			key: 'text',
			label: __( 'Text', 'block-rewind' ),
			now: { text: formatWordCount( countWords( from ) ) },
			after: { text: formatWordCount( countWords( to ) ) },
			note: formattingOnly
				? __( 'Formatting only', 'block-rewind' )
				: notes.join( ', ' ),
		} );
	}

	const groups = new Map();
	changes.attributes.forEach( ( { path } ) => {
		const group = getAttributeGroup( path );
		if ( ! groups.has( group.key ) ) {
			groups.set( group.key, group );
		}
	} );

	groups.forEach( ( { key, label } ) => {
		rows.push( {
			key,
			label,
			now: formatAttributeValue( key, changes.settings.from, presets ),
			after: formatAttributeValue( key, changes.settings.to, presets ),
		} );
	} );

	if ( changes.innerBlocks ) {
		const changedCount = changes.innerBlocks.changed.length;
		rows.push( {
			key: 'innerBlocks',
			label: __( 'Nested blocks', 'block-rewind' ),
			now: { text: formatBlockCount( changes.innerBlocks.fromCount ) },
			after: { text: formatBlockCount( changes.innerBlocks.toCount ) },
			note: sprintf(
				/* translators: %d: number of nested blocks that change. */
				_n( '%d changed', '%d changed', changedCount, 'block-rewind' ),
				changedCount
			),
			link: 'innerBlocks',
		} );
	}

	return rows;
};

/**
 * Summarizes what a version changed compared with the version before it, as short
 * labels for the history list, e.g. "Text: 5 words added", "Font size".
 *
 * @param {Object} changes  Result of describeChanges( previousVersion, version ).
 * @param {number} maxItems Labels shown before "+N more".
 * @return {string[]} Labels.
 */
export const summarizeChanges = ( changes, maxItems = 3 ) => {
	const labels = [];

	if ( changes.blockType ) {
		labels.push(
			sprintf(
				/* translators: %s: block type, e.g. "Heading". */
				__( 'Changed to %s', 'block-rewind' ),
				getBlockTitle( changes.blockType.to )
			)
		);
	}

	if ( changes.text ) {
		const { addedWords, removedWords, formattingOnly } = changes.text;

		if ( formattingOnly ) {
			labels.push( __( 'Text formatting', 'block-rewind' ) );
		} else if ( addedWords && removedWords ) {
			labels.push(
				sprintf(
					/* translators: 1: words added. 2: words removed. */
					__( 'Text: %1$d added, %2$d removed', 'block-rewind' ),
					addedWords,
					removedWords
				)
			);
		} else if ( addedWords ) {
			labels.push(
				sprintf(
					/* translators: %d: number of words. */
					_n(
						'Text: %d word added',
						'Text: %d words added',
						addedWords,
						'block-rewind'
					),
					addedWords
				)
			);
		} else {
			labels.push(
				sprintf(
					/* translators: %d: number of words. */
					_n(
						'Text: %d word removed',
						'Text: %d words removed',
						removedWords,
						'block-rewind'
					),
					removedWords
				)
			);
		}
	}

	changes.attributes.forEach( ( { path } ) => {
		const { label } = getAttributeGroup( path );
		if ( ! labels.includes( label ) ) {
			labels.push( label );
		}
	} );

	if ( changes.innerBlocks ) {
		const count = changes.innerBlocks.changed.length;
		labels.push(
			sprintf(
				/* translators: %d: number of nested blocks. */
				_n(
					'%d nested block',
					'%d nested blocks',
					count,
					'block-rewind'
				),
				count
			)
		);
	}

	if ( labels.length <= maxItems ) {
		return labels;
	}

	return [
		...labels.slice( 0, maxItems ),
		sprintf(
			/* translators: %d: number of further changes. */
			__( '+%d more', 'block-rewind' ),
			labels.length - maxItems
		),
	];
};
