// Creates a deep-cloned JSON-safe value for deterministic persistence.
const cloneSerializable = ( value ) => JSON.parse( JSON.stringify( value ?? null ) );

// Recursively serializes inner blocks into a persistence-friendly shape.
const serializeInnerBlocks = ( innerBlocks = [] ) =>
	innerBlocks.map( ( block ) => ( {
		blockName: block.name,
		attributes: cloneSerializable( block.attributes || {} ),
		innerBlocks: serializeInnerBlocks( block.innerBlocks || [] ),
	} ) );

// Serializes block state used for snapshot storage and equality checks.
export const serializeBlockState = ( block ) => {
	const attributes = cloneSerializable( block.attributes || {} );
	const innerBlocks = serializeInnerBlocks( block.innerBlocks || [] );

	return {
		attributes,
		innerBlocks,
	};
};

// Produces a stable string fingerprint for change detection.
export const computeSerializedHash = ( serializedState ) => JSON.stringify( serializedState );
