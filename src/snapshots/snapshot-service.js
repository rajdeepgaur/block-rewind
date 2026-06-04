import { SNAPSHOT_TTL_MS } from '../constants';
import {
	deleteExpiredSnapshots,
	getLatestSnapshotByPostAndBlock,
	getSnapshotsByPostAndBlock,
	putSnapshot,
} from '../db/indexeddb';
import { getLehfgBlockId } from '../identity/block-identity';
import { computeSerializedHash, serializeBlockState } from '../serialization/serialize-block';
import { generateSnapshotId } from '../utils/generate-id';

// Fetches all snapshots for a specific block in the current post.
export const listSnapshotsForBlock = ( postId, blockId ) => getSnapshotsByPostAndBlock( postId, blockId );

// Fetches a persisted snapshot for a block by its stored hash.
export const getSnapshotByHashForBlock = async ( postId, blockId, hash ) => {
	if ( ! postId || ! blockId || ! hash ) {
		return null;
	}

	const snapshots = await getSnapshotsByPostAndBlock( postId, blockId );
	return snapshots.find( ( snapshot ) => snapshot.hash === hash ) || null;
};

// Fetches the latest persisted snapshot for a block in the current post.
export const getLatestSnapshotForBlock = ( postId, blockId ) => getLatestSnapshotByPostAndBlock( postId, blockId );

// Persists a snapshot only when serialized block state changed.
export const persistSnapshotForBlockIfChanged = async ( block, postId ) => {
	const blockId = getLehfgBlockId( block );

	if ( ! postId || ! blockId ) {
		return false;
	}

	const serializedState = serializeBlockState( block );
	const hash = computeSerializedHash( serializedState );
	const latestSnapshot = await getLatestSnapshotByPostAndBlock( postId, blockId );

	if ( latestSnapshot?.hash === hash ) {
		return false;
	}

	const now = Date.now();
	const snapshot = {
		snapshotId: generateSnapshotId(),
		blockId,
		postId,
		blockName: block.name,
		attributes: serializedState.attributes,
		innerBlocks: serializedState.innerBlocks,
		timestamp: now,
		expiresAt: now + SNAPSHOT_TTL_MS,
		hash,
	};

	await putSnapshot( snapshot );
	return true;
};

// Persists the current live block state as a recovery snapshot when it differs from the latest saved state.
export const persistRecoverySnapshotForBlockIfChanged = async ( block, postId ) =>
	persistSnapshotForBlockIfChanged( block, postId );

// Creates the first snapshot for a block if history is empty.
export const ensureInitialSnapshotForBlock = async ( block, postId ) => {
	const blockId = getLehfgBlockId( block );

	if ( ! postId || ! blockId ) {
		return false;
	}

	const existingSnapshots = await listSnapshotsForBlock( postId, blockId );

	if ( existingSnapshots.length ) {
		return false;
	}

	await persistSnapshotForBlockIfChanged( block, postId );
	return true;
};

// Removes expired snapshots using the current timestamp.
export const runSnapshotExpiryCleanup = async () => {
	await deleteExpiredSnapshots( Date.now() );
};
