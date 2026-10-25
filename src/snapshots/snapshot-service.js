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
import {
	canWriteSnapshots,
	getStorageStatus,
	isQuotaExceededError,
	setStorageStatus,
} from '../state/storage-status';
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

// Forgets a version whose write failed, if it is still the latest known one.
const forgetLastSaved = ( snapshot ) => {
	if (
		lastSavedByBlockId.get( snapshot.blockId )?.timestamp ===
		snapshot.timestamp
	) {
		lastSavedByBlockId.delete( snapshot.blockId );
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

/**
 * Writes a snapshot, freeing space once when the browser's storage is full.
 *
 * On the first quota error, expired versions are removed and the write is tried
 * again. If it still fails, storage is marked as full; later writes are tried as
 * they are, and the first one that succeeds marks storage as ready again.
 *
 * @param {Object} snapshot Snapshot record.
 */
const writeSnapshot = async ( snapshot ) => {
	try {
		await putSnapshot( snapshot, settings.maxSnapshotsPerBlock );
	} catch ( error ) {
		if (
			! isQuotaExceededError( error ) ||
			getStorageStatus() === 'full'
		) {
			throw error;
		}

		try {
			await runSnapshotExpiryCleanup();
			await putSnapshot( snapshot, settings.maxSnapshotsPerBlock );
		} catch ( retryError ) {
			if ( isQuotaExceededError( retryError ) ) {
				setStorageStatus( 'full' );
			}
			throw retryError;
		}
	}

	setStorageStatus( 'ready' );
};

// Registers a listener called with each snapshot written, or with null after expired
// snapshots of any block were removed. Returns an unsubscribe function.
export const subscribeToSnapshotChanges = ( listener ) => {
	changeListeners.add( listener );
	return () => changeListeners.delete( listener );
};

// Fetches all unexpired snapshots of a post and remembers each block's latest saved
// version. Expired ones may still be stored while the start-up cleanup runs.
export const listSnapshotsForPost = async ( postId ) => {
	const now = Date.now();
	const snapshots = ( await getSnapshotsByPost( postId ) ).filter(
		( snapshot ) => snapshot.expiresAt > now
	);
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
 * The version is timed when the save is requested, not when the queued write runs, so
 * a write that waited (e.g. behind expiry cleanup) never ends up newer than the
 * page-exit save of a later edit. It is still always newer than the block's latest
 * known version, even one saved in the same millisecond.
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
) => {
	const timestamp = Math.max(
		Date.now(),
		( getLastSaved( blockId )?.timestamp ?? -Infinity ) + 1
	);

	return enqueueWrite( async () => {
		if ( ! postId || ! blockId || ! block || ! canWriteSnapshots() ) {
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
			timestamp
		);

		await writeSnapshot( snapshot );
		recordLastSaved( snapshot );
		notifySnapshotChange( snapshot );
		return true;
	} );
};

/**
 * Saves blocks immediately in one synchronous write, for when the page is unloading.
 *
 * Blocks whose content matches their latest known version are skipped. Entries are
 * stored in the given order, one millisecond apart, so a baseline stays older than
 * the edit that follows it.
 *
 * @param {Array<{blockId: string, block: Object, metadata?: Object}>} entries          Blocks to save,
 *                                                                                      with optional
 *                                                                                      extra fields.
 * @param {number|string}                                              postId           Current post ID.
 * @param {Object}                                                     options          Options.
 * @param {Function}                                                   options.onFailed Called if the
 *                                                                                      started write
 *                                                                                      fails.
 * @return {boolean} Whether the write was started (true when nothing needed saving).
 */
export const persistSnapshotsNow = ( entries, postId, { onFailed } = {} ) => {
	if ( ! postId || ! canWriteSnapshots() ) {
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

	const started = putSnapshotsNow( snapshots, {
		onComplete: () => {
			setStorageStatus( 'ready' );
			snapshots.forEach( notifySnapshotChange );
		},
		onAbort: ( error ) => {
			snapshots.forEach( forgetLastSaved );
			if ( isQuotaExceededError( error ) ) {
				setStorageStatus( 'full' );
			}
			onFailed?.( error );
		},
	} );
	if ( started ) {
		snapshots.forEach( recordLastSaved );
	}
	return started;
};

let runningCleanup = null;

// Forgets latest known versions that have expired, so they aren't taken as saved.
const forgetExpiredLastSaved = ( now ) => {
	for ( const [ blockId, { timestamp } ] of lastSavedByBlockId ) {
		if ( timestamp + settings.snapshotTtlMs <= now ) {
			lastSavedByBlockId.delete( blockId );
		}
	}
};

// Removes expired snapshots using the current timestamp. A call made while a cleanup
// is running shares it instead of starting another. Listeners are told when anything
// was removed, so an open history list drops those versions.
export const runSnapshotExpiryCleanup = () => {
	if ( ! runningCleanup ) {
		const now = Date.now();

		runningCleanup = deleteExpiredSnapshots( now )
			.then( ( deletedCount ) => {
				if ( deletedCount ) {
					forgetExpiredLastSaved( now );
					notifySnapshotChange( null );
				}
				return deletedCount;
			} )
			.finally( () => {
				runningCleanup = null;
			} );
	}

	return runningCleanup;
};
