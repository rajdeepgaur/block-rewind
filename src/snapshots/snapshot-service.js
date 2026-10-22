import {
	deleteExpiredSnapshots,
	getLatestSnapshotByPostAndBlock,
	getSnapshotsByPostAndBlock,
	putSnapshot,
} from '../db/indexeddb';
import {
	computeBlockHash,
	serializeBlockState,
} from '../serialization/serialize-block';
import { settings } from '../settings';
import { getStorageStatus } from '../state/storage-status';
import { generateSnapshotId } from '../utils/generate-id';

const changeListeners = new Set();

// Snapshot writes run one at a time so "compare with latest, then write" never races.
let writeQueue = Promise.resolve();

const enqueueWrite = ( task ) => {
	const result = writeQueue.then( task );
	writeQueue = result.catch( () => {} );
	return result;
};

const notifySnapshotChange = ( snapshot ) => {
	for ( const listener of changeListeners ) {
		listener( snapshot );
	}
};

// Registers a listener called after a snapshot is written. Returns an unsubscribe function.
export const subscribeToSnapshotChanges = ( listener ) => {
	changeListeners.add( listener );
	return () => changeListeners.delete( listener );
};

// Fetches all snapshots for a specific block in the current post.
export const listSnapshotsForBlock = ( postId, blockId ) =>
	getSnapshotsByPostAndBlock( postId, blockId );

// Fetches a persisted snapshot for a block by its content hash.
export const findSnapshotByHash = async ( postId, blockId, hash ) => {
	if ( ! postId || ! blockId || ! hash ) {
		return null;
	}

	const snapshots = await getSnapshotsByPostAndBlock( postId, blockId );
	return snapshots.find( ( snapshot ) => snapshot.hash === hash ) || null;
};

/**
 * Persists a block's state under a history ID unless it matches the latest snapshot.
 *
 * @param {string}        blockId  History ID of the block.
 * @param {Object}        block    Editor block (or block-shaped object) to save.
 * @param {number|string} postId   Current post ID.
 * @param {Object}        metadata Extra fields stored on the record, e.g. `restoredFrom`.
 * @return {Promise<boolean>} Whether a snapshot was written.
 */
export const persistSnapshotIfChanged = (
	blockId,
	block,
	postId,
	metadata = {}
) =>
	enqueueWrite( async () => {
		if (
			! postId ||
			! blockId ||
			! block ||
			getStorageStatus() !== 'ready'
		) {
			return false;
		}

		const hash = computeBlockHash( block );
		const latestSnapshot = await getLatestSnapshotByPostAndBlock(
			postId,
			blockId
		);

		if ( latestSnapshot?.hash === hash ) {
			return false;
		}

		const now = Date.now();
		const snapshot = {
			snapshotId: generateSnapshotId(),
			blockId,
			postId,
			...serializeBlockState( block ),
			...metadata,
			timestamp: now,
			expiresAt: now + settings.snapshotTtlMs,
			hash,
		};

		await putSnapshot( snapshot, settings.maxSnapshotsPerBlock );
		notifySnapshotChange( snapshot );
		return true;
	} );

// Removes expired snapshots using the current timestamp.
export const runSnapshotExpiryCleanup = async () => {
	await deleteExpiredSnapshots( Date.now() );
};
