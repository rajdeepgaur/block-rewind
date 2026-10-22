const contentKey = ( blockName, hash ) => `${ blockName }\n${ hash }`;

/**
 * Pairs blocks that lost their history ID with orphaned histories of the same content.
 *
 * Block IDs only reach the database when the post is saved, so reloading an unsaved
 * post brings blocks back without their IDs while their history stays in the browser.
 * A block is re-linked when its type and content match a snapshot of exactly one
 * orphaned history, and that history matches no other block. Ambiguous cases are
 * left alone rather than risk attaching the wrong history.
 *
 * @param {Array<{clientId: string, name: string, hash: string}>}     untrackedBlocks Blocks without a history ID.
 * @param {Array<{blockId: string, blockName: string, hash: string}>} snapshots       All snapshots of the post.
 * @param {Set<string>}                                               presentBlockIds History IDs of blocks in the post.
 * @return {Map<string, string>} Client ID -> history ID to restore.
 */
export const matchOrphanedHistories = (
	untrackedBlocks,
	snapshots,
	presentBlockIds
) => {
	const orphanIdsByContent = new Map();

	for ( const snapshot of snapshots ) {
		if ( presentBlockIds.has( snapshot.blockId ) ) {
			continue;
		}

		const key = contentKey( snapshot.blockName, snapshot.hash );
		if ( ! orphanIdsByContent.has( key ) ) {
			orphanIdsByContent.set( key, new Set() );
		}
		orphanIdsByContent.get( key ).add( snapshot.blockId );
	}

	const candidatesByClientId = new Map();
	const clientIdsByBlockId = new Map();

	for ( const block of untrackedBlocks ) {
		const candidates = orphanIdsByContent.get(
			contentKey( block.name, block.hash )
		);
		if ( ! candidates ) {
			continue;
		}

		candidatesByClientId.set( block.clientId, candidates );
		for ( const blockId of candidates ) {
			if ( ! clientIdsByBlockId.has( blockId ) ) {
				clientIdsByBlockId.set( blockId, [] );
			}
			clientIdsByBlockId.get( blockId ).push( block.clientId );
		}
	}

	const matches = new Map();

	for ( const [ clientId, candidates ] of candidatesByClientId ) {
		if ( candidates.size !== 1 ) {
			continue;
		}

		const [ blockId ] = candidates;
		if ( clientIdsByBlockId.get( blockId ).length === 1 ) {
			matches.set( clientId, blockId );
		}
	}

	return matches;
};
