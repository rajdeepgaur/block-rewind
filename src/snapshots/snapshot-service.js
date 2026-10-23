import {
	deleteExpiredSnapshots,
	getLatestSnapshotByPostAndBlock,
	getSnapshotsByPost,
	getSnapshotsByPostAndBlock,
	putSnapshot,
	putSnapshotsNow,
} from '../db/indexeddb';
import {
	computeBlockHash,
	serializeBlockState,
} from '../serialization/serialize-block';
import { settings } from '../settings';
import { getStorageStatus } from '../state/storage-status';
import { generateId } from '../utils/generate-id';

const changeListeners = new Set();

// blockId -> { hash, timestamp } of the block's latest known saved version.
const lastSavedByBlockId = new Map();

const recordLastSaved = ( snapshot ) => {
	const known = lastSavedByBlockId.get( snapshot.blockId );
	if ( ! known || snapshot.timestamp >= known.timestamp ) {
		lastSavedByBlockId.set( snapshot.blockId, {
			hash: snapshot.hash,
			timestamp: snapshot.timestamp,
		} );
	}
};

// Returns the hash and time of a block's latest known saved version, or null.
export const getLastSaved = ( blockId ) =>
	lastSavedByBlockId.get( blockId ) || null;

const buildSnapshot = ( blockId, block, postId, metadata, timestamp ) => ( {
	snapshotId: generateId(),
	blockId,
	postId,
	...serializeBlockState( block ),
	...metadata,
	timestamp,
	expiresAt: timestamp + settings.snapshotTtlMs,
	hash: computeBlockHash( block ),
} );

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

// Fetches all snapshots of a post and remembers each block's latest saved version.
export const listSnapshotsForPost = async ( postId ) => {
	const snapshots = await getSnapshotsByPost( postId );
	snapshots.forEach( recordLastSaved );
	return snapshots;
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

		const snapshot = buildSnapshot(
			blockId,
			block,
			postId,
			metadata,
			Date.now()
		);

		await putSnapshot( snapshot, settings.maxSnapshotsPerBlock );
		recordLastSaved( snapshot );
		notifySnapshotChange( snapshot );
		return true;
	} );

/**
 * Saves blocks immediately in one synchronous write, for when the page is unloading.
 *
 * Blocks whose content matches their latest known version are skipped. Entries are
 * stored in the given order, one millisecond apart, so a baseline stays older than
 * the edit that follows it.
 *
 * @param {Array<{blockId: string, block: Object, metadata?: Object}>} entries Blocks to save,
 *                                                                             with optional
 *                                                                             extra fields.
 * @param {number|string}                                              postId  Current post ID.
 * @return {boolean} Whether the write was started (true when nothing needed saving).
 */
export const persistSnapshotsNow = ( entries, postId ) => {
	if ( ! postId || getStorageStatus() !== 'ready' ) {
		return false;
	}

	const now = Date.now();
	const snapshots = [];
	const latestHashes = new Map();

	entries.forEach( ( { blockId, block, metadata = {} } ) => {
		if ( ! block ) {
			return;
		}

		const snapshot = buildSnapshot(
			blockId,
			block,
			postId,
			metadata,
			now + snapshots.length
		);
		const previousHash = latestHashes.has( blockId )
			? latestHashes.get( blockId )
			: getLastSaved( blockId )?.hash;

		if ( snapshot.hash !== previousHash ) {
			snapshots.push( snapshot );
			latestHashes.set( blockId, snapshot.hash );
		}
	} );

	if ( ! snapshots.length ) {
		return true;
	}

	const started = putSnapshotsNow( snapshots );
	if ( started ) {
		snapshots.forEach( recordLastSaved );
	}
	return started;
};

// Removes expired snapshots using the current timestamp.
export const runSnapshotExpiryCleanup = async () => {
	await deleteExpiredSnapshots( Date.now() );
};
