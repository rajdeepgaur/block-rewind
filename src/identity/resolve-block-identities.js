import { BLOCK_ID_ATTRIBUTE } from '../constants';

const readBlockIdAttribute = ( block ) =>
	block?.attributes?.[ BLOCK_ID_ATTRIBUTE ] || null;

// Creates the session state used to keep block identities stable.
export const createIdentityState = () => ( {
	// clientId -> blockId, so a block keeps its ID when undo removes the attribute.
	sessionIdByClientId: new Map(),
	// blockId -> clientId of the block that first owned it in this session.
	ownerClientIdByBlockId: new Map(),
} );

/**
 * Resolves which block owns each history ID and which attributes must be rewritten.
 *
 * Block IDs are stored in post content, so duplicating, copy/pasting, inserting
 * patterns or restoring snapshots can leave several blocks with the same ID.
 * The block that owned the ID first keeps it; every other copy loses it.
 *
 * @param {Object[]} blocks Flattened editor blocks in document order.
 * @param {Object}   state  Identity state from createIdentityState(); updated in place.
 * @return {{ idByClientId: Map<string, string>, writes: Map<string, string> }}
 *         Resolved IDs and the attribute values to write ('' clears a duplicate).
 */
export const resolveBlockIdentities = ( blocks, state ) => {
	const membersById = new Map();

	for ( const block of blocks ) {
		const blockId =
			readBlockIdAttribute( block ) ||
			state.sessionIdByClientId.get( block.clientId );

		if ( ! blockId ) {
			continue;
		}

		if ( ! membersById.has( blockId ) ) {
			membersById.set( blockId, [] );
		}
		membersById.get( blockId ).push( block );
	}

	const idByClientId = new Map();
	const writes = new Map();

	for ( const [ blockId, members ] of membersById ) {
		const preferredOwner = state.ownerClientIdByBlockId.get( blockId );
		const owner =
			members.find( ( block ) => block.clientId === preferredOwner ) ||
			members[ 0 ];

		if ( ! preferredOwner ) {
			state.ownerClientIdByBlockId.set( blockId, owner.clientId );
		}

		state.sessionIdByClientId.set( owner.clientId, blockId );
		idByClientId.set( owner.clientId, blockId );

		if ( readBlockIdAttribute( owner ) !== blockId ) {
			writes.set( owner.clientId, blockId );
		}

		for ( const member of members ) {
			if ( member === owner ) {
				continue;
			}

			if (
				state.sessionIdByClientId.get( member.clientId ) === blockId
			) {
				state.sessionIdByClientId.delete( member.clientId );
			}

			if ( readBlockIdAttribute( member ) === blockId ) {
				writes.set( member.clientId, '' );
			}
		}
	}

	return { idByClientId, writes };
};

// Assigns a new ID to a block and makes it that ID's owner.
export const claimBlockId = ( state, clientId, blockId ) => {
	state.sessionIdByClientId.set( clientId, blockId );
	state.ownerClientIdByBlockId.set( blockId, clientId );
};
