import { createBlock } from '@wordpress/blocks';

// Recursively reconstructs a block tree from snapshot or editor block data.
export const reconstructBlockTree = ( blockData ) => {
	const buildBlock = ( node ) => {
		if ( ! node ) {
			return null;
		}

		const blockName = node.blockName || node.name;
		if ( ! blockName ) {
			return null;
		}

		try {
			return createBlock(
				blockName,
				node.attributes || {},
				( node.innerBlocks || [] )
					.map( ( innerBlock ) => buildBlock( innerBlock ) )
					.filter( Boolean )
			);
		} catch ( error ) {
			return null;
		}
	};

	const block = buildBlock( blockData );

	return block ? [ block ] : [];
};
