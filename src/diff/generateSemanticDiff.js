import { extractComparableData } from './extractComparableData';

const isPlainObject = ( value ) => Boolean( value ) && typeof value === 'object' && ! Array.isArray( value );

const areValuesEqual = ( leftValue, rightValue ) => JSON.stringify( leftValue ) === JSON.stringify( rightValue );

const diffAttributePaths = ( currentAttributes, snapshotAttributes, prefix = '' ) => {
	const keys = new Set( [ ...Object.keys( currentAttributes || {} ), ...Object.keys( snapshotAttributes || {} ) ] );
	const changedPaths = [];

	for ( const key of keys ) {
		if ( key === 'clientId' || key === 'lehfgBlockId' ) {
			continue;
		}

		const currentValue = currentAttributes?.[ key ];
		const snapshotValue = snapshotAttributes?.[ key ];
		const path = prefix ? `${ prefix }.${ key }` : key;

		if ( isPlainObject( currentValue ) && isPlainObject( snapshotValue ) ) {
			changedPaths.push( ...diffAttributePaths( currentValue, snapshotValue, path ) );
			continue;
		}

		if ( Array.isArray( currentValue ) && Array.isArray( snapshotValue ) ) {
			if ( ! areValuesEqual( currentValue, snapshotValue ) ) {
				changedPaths.push( path );
			}
			continue;
		}

		if ( ! areValuesEqual( currentValue, snapshotValue ) ) {
			changedPaths.push( path );
		}
	}

	return changedPaths;
};

const compareInnerBlocks = ( currentInnerBlocks, snapshotInnerBlocks ) => {
	if ( currentInnerBlocks.length !== snapshotInnerBlocks.length ) {
		return true;
	}

	for ( let index = 0; index < currentInnerBlocks.length; index += 1 ) {
		const currentInnerBlock = currentInnerBlocks[ index ];
		const snapshotInnerBlock = snapshotInnerBlocks[ index ];

		if ( ! currentInnerBlock || ! snapshotInnerBlock ) {
			return true;
		}

		if ( currentInnerBlock.blockName !== snapshotInnerBlock.blockName ) {
			return true;
		}

		if ( currentInnerBlock.textContent !== snapshotInnerBlock.textContent ) {
			return true;
		}

		if ( ! areValuesEqual( currentInnerBlock.attributes, snapshotInnerBlock.attributes ) ) {
			return true;
		}

		if ( compareInnerBlocks( currentInnerBlock.innerBlocks || [], snapshotInnerBlock.innerBlocks || [] ) ) {
			return true;
		}
	}

	return false;
};

// Generates lightweight semantic diff metadata for current block vs snapshot.
export const generateSemanticDiff = ( currentBlock, snapshotBlock ) => {
	const currentComparableData = extractComparableData( currentBlock );
	const snapshotComparableData = extractComparableData( snapshotBlock );

	if ( ! currentComparableData || ! snapshotComparableData ) {
		return {
			hasChanges: true,
			blockTypeChanged: true,
			textChanged: true,
			attributesChanged: [],
			innerBlocksChanged: true,
		};
	}

	const blockTypeChanged = currentComparableData.blockName !== snapshotComparableData.blockName;
	const textChanged = currentComparableData.textContent !== snapshotComparableData.textContent;
	const attributesChanged = diffAttributePaths( currentComparableData.attributes, snapshotComparableData.attributes );
	const innerBlocksChanged = compareInnerBlocks(
		currentComparableData.innerBlocks || [],
		snapshotComparableData.innerBlocks || []
	);

	return {
		hasChanges: blockTypeChanged || textChanged || attributesChanged.length > 0 || innerBlocksChanged,
		blockTypeChanged,
		textChanged,
		attributesChanged,
		innerBlocksChanged,
	};
};
