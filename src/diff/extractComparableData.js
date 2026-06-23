const cloneSerializable = ( value ) => JSON.parse( JSON.stringify( value ?? null ) );

const textLikeKeyPattern = /(content|text|title|caption|label|alt|placeholder|description|heading|subheading|body)$/i;

const normalizeText = ( value ) => String( value || '' ).replace( /\s+/g, ' ' ).trim();

const collectTextFragments = ( value, key = '' ) => {
	if ( value == null ) {
		return [];
	}

	if ( typeof value === 'string' ) {
		return textLikeKeyPattern.test( key ) || ! key ? [ value ] : [];
	}

	if ( Array.isArray( value ) ) {
		return value.flatMap( ( item ) => collectTextFragments( item, key ) );
	}

	if ( typeof value === 'object' ) {
		return Object.entries( value ).flatMap( ( [ childKey, childValue ] ) => {
			if ( childKey === 'clientId' || childKey === 'lehfgBlockId' ) {
				return [];
			}

			return collectTextFragments( childValue, childKey );
		} );
	}

	return [];
};

const extractTextContent = ( blockData, innerBlocks ) => {
	const fragments = [
		...( collectTextFragments( blockData.attributes || {} ) ),
		...( typeof blockData.textContent === 'string' ? [ blockData.textContent ] : [] ),
		...( typeof blockData.content === 'string' ? [ blockData.content ] : [] ),
		...( typeof blockData.innerHTML === 'string' ? [ blockData.innerHTML ] : [] ),
		...( innerBlocks.map( ( innerBlock ) => innerBlock.textContent || '' ) ),
	];

	return normalizeText( fragments.join( ' ' ) );
};

// Normalizes a block into comparison-safe data for semantic diffing.
export const extractComparableData = ( blockData ) => {
	if ( ! blockData ) {
		return null;
	}

	const blockName = blockData.blockName || blockData.name || '';
	const attributes = cloneSerializable( blockData.attributes || {} );
	delete attributes.clientId;
	delete attributes.lehfgBlockId;

	const innerBlocks = ( blockData.innerBlocks || [] )
		.map( ( innerBlock ) => extractComparableData( innerBlock ) )
		.filter( Boolean );

	return {
		blockName,
		textContent: extractTextContent( blockData, innerBlocks ),
		attributes,
		innerBlocks,
	};
};
