import { DB_NAME_PREFIX, DB_VERSION, SNAPSHOT_STORE } from '../constants';
import { settings } from '../settings';

const DB_NAME = `${ DB_NAME_PREFIX }${ settings.storageKey }`;

const BY_POST_BLOCK_TIME = 'byPostBlockTime';
const BY_EXPIRES_AT = 'byExpiresAt';

let dbPromise = null;
// The open connection, kept so the page-exit save can write without awaiting.
let connectedDatabase = null;

const getIndexedDB = () =>
	typeof window !== 'undefined' ? window.indexedDB : undefined;

// Key range covering every snapshot of one post: [ postId ] sorts before all of its
// keys and [ postId, [] ] after them, as arrays sort after strings and numbers.
const postRange = ( postId ) =>
	window.IDBKeyRange.bound( [ postId ], [ postId, [] ] );

// Key range covering every snapshot of one block, ordered by timestamp.
const blockRange = ( postId, blockId ) =>
	window.IDBKeyRange.bound(
		[ postId, blockId, -Infinity ],
		[ postId, blockId, Infinity ]
	);

// Opens and memoizes the IndexedDB connection used by the plugin.
// A failed open is not cached, so a later call can retry.
export const openHistoryDatabase = () => {
	if ( dbPromise ) {
		return dbPromise;
	}

	dbPromise = new Promise( ( resolve, reject ) => {
		const indexedDB = getIndexedDB();
		if ( ! indexedDB ) {
			reject( new Error( 'IndexedDB is not available.' ) );
			return;
		}

		let request;
		try {
			request = indexedDB.open( DB_NAME, DB_VERSION );
		} catch ( error ) {
			reject( error );
			return;
		}

		request.onupgradeneeded = () => {
			const db = request.result;

			if ( ! db.objectStoreNames.contains( SNAPSHOT_STORE ) ) {
				const store = db.createObjectStore( SNAPSHOT_STORE, {
					keyPath: 'snapshotId',
				} );
				store.createIndex( BY_POST_BLOCK_TIME, [
					'postId',
					'blockId',
					'timestamp',
				] );
				store.createIndex( BY_EXPIRES_AT, 'expiresAt' );
			}
		};

		request.onblocked = () => {
			// eslint-disable-next-line no-console
			console.warn(
				'Block Rewind: waiting for other editor tabs to release the history database.'
			);
		};

		request.onsuccess = () => {
			const db = request.result;

			// Let a newer plugin version in another tab upgrade the database.
			db.onversionchange = () => {
				db.close();
				dbPromise = null;
				connectedDatabase = null;
			};
			db.onclose = () => {
				dbPromise = null;
				connectedDatabase = null;
			};

			connectedDatabase = db;
			resolve( db );
		};

		request.onerror = () => reject( request.error );
	} );

	dbPromise.catch( () => {
		dbPromise = null;
	} );

	return dbPromise;
};

/**
 * Runs work inside one snapshot store transaction and resolves when it commits.
 *
 * `work` must issue its requests synchronously or from request callbacks:
 * awaiting other promises would let the transaction auto-commit early.
 *
 * @param {string}   mode 'readonly' or 'readwrite'.
 * @param {Function} work Receives the object store and a setter for the resolved value.
 * @return {Promise<*>} The value passed to the setter.
 */
const runTransaction = async ( mode, work ) => {
	const db = await openHistoryDatabase();

	return new Promise( ( resolve, reject ) => {
		const transaction = db.transaction( SNAPSHOT_STORE, mode );
		let result;

		transaction.oncomplete = () => resolve( result );
		transaction.onerror = () => reject( transaction.error );
		transaction.onabort = () =>
			reject( transaction.error || new Error( 'Transaction aborted.' ) );

		try {
			work( transaction.objectStore( SNAPSHOT_STORE ), ( value ) => {
				result = value;
			} );
		} catch ( error ) {
			reject( error );
			try {
				transaction.abort();
			} catch ( abortError ) {
				// The transaction already finished.
			}
		}
	} );
};

// Removes the oldest snapshots of a block beyond the limit, within a transaction.
const pruneBlockSnapshots = (
	store,
	postId,
	blockId,
	maxSnapshotsPerBlock
) => {
	const index = store.index( BY_POST_BLOCK_TIME );
	const range = blockRange( postId, blockId );
	const countRequest = index.count( range );

	countRequest.onsuccess = () => {
		let excess = countRequest.result - maxSnapshotsPerBlock;
		if ( excess <= 0 ) {
			return;
		}

		const cursorRequest = index.openCursor( range );
		cursorRequest.onsuccess = () => {
			const cursor = cursorRequest.result;
			if ( cursor && excess > 0 ) {
				cursor.delete();
				excess -= 1;
				cursor.continue();
			}
		};
	};
};

// Inserts a snapshot, then removes the oldest snapshots of that block beyond the limit.
export const putSnapshot = ( snapshot, maxSnapshotsPerBlock ) =>
	runTransaction( 'readwrite', ( store ) => {
		store.put( snapshot );
		pruneBlockSnapshots(
			store,
			snapshot.postId,
			snapshot.blockId,
			maxSnapshotsPerBlock
		);
	} );

/**
 * Writes snapshots in one transaction started synchronously, for use while the page unloads.
 *
 * Browsers finish a transaction that was started before the page went away far more
 * reliably than work queued behind promises. Nothing is pruned here, since extra steps
 * would delay the commit; the next regular write prunes the block.
 *
 * @param {Object[]} snapshots            Snapshot records to store.
 * @param {Object}   callbacks            Optional callbacks.
 * @param {Function} callbacks.onComplete Called when the write commits.
 * @param {Function} callbacks.onAbort    Called with the error when a started write fails.
 * @return {boolean} Whether the write was started.
 */
export const putSnapshotsNow = ( snapshots, { onComplete, onAbort } = {} ) => {
	if ( ! connectedDatabase || ! snapshots.length ) {
		return false;
	}

	try {
		const transaction = connectedDatabase.transaction(
			SNAPSHOT_STORE,
			'readwrite'
		);
		transaction.oncomplete = () => onComplete?.();
		transaction.onabort = () => onAbort?.( transaction.error );

		const store = transaction.objectStore( SNAPSHOT_STORE );
		snapshots.forEach( ( snapshot ) => store.put( snapshot ) );
		return true;
	} catch ( error ) {
		return false;
	}
};

// Lists every snapshot of one post, ordered by block and then by time.
export const getSnapshotsByPost = ( postId ) => {
	if ( ! postId ) {
		return Promise.resolve( [] );
	}

	return runTransaction( 'readonly', ( store, setResult ) => {
		const request = store
			.index( BY_POST_BLOCK_TIME )
			.getAll( postRange( postId ) );
		request.onsuccess = () => setResult( request.result || [] );
	} );
};

// Lists snapshots for one block in one post, oldest first.
export const getSnapshotsByPostAndBlock = ( postId, blockId ) => {
	if ( ! postId || ! blockId ) {
		return Promise.resolve( [] );
	}

	return runTransaction( 'readonly', ( store, setResult ) => {
		const request = store
			.index( BY_POST_BLOCK_TIME )
			.getAll( blockRange( postId, blockId ) );
		request.onsuccess = () => setResult( request.result || [] );
	} );
};

// Returns the latest snapshot for one block in one post without loading the others.
export const getLatestSnapshotByPostAndBlock = ( postId, blockId ) => {
	if ( ! postId || ! blockId ) {
		return Promise.resolve( null );
	}

	return runTransaction( 'readonly', ( store, setResult ) => {
		const request = store
			.index( BY_POST_BLOCK_TIME )
			.openCursor( blockRange( postId, blockId ), 'prev' );
		request.onsuccess = () => setResult( request.result?.value || null );
	} );
};

// Expired snapshots deleted per transaction, so other writes can run in between.
const EXPIRED_DELETE_CHUNK_SIZE = 2000;

// Deletes up to `limit` expired snapshots in one transaction and resolves with the count.
// A key cursor walks the index without reading the records themselves.
const deleteExpiredChunk = ( now, limit ) =>
	runTransaction( 'readwrite', ( store, setResult ) => {
		let deleted = 0;
		setResult( deleted );

		const request = store
			.index( BY_EXPIRES_AT )
			.openKeyCursor( window.IDBKeyRange.upperBound( now ) );

		request.onsuccess = () => {
			const cursor = request.result;
			if ( cursor && deleted < limit ) {
				store.delete( cursor.primaryKey );
				deleted += 1;
				setResult( deleted );
				cursor.continue();
			}
		};
	} );

// Deletes all snapshots that have passed their expiration timestamp, in chunks.
// Resolves with the number of snapshots deleted.
export const deleteExpiredSnapshots = async ( now ) => {
	let total = 0;
	let deleted;

	do {
		deleted = await deleteExpiredChunk( now, EXPIRED_DELETE_CHUNK_SIZE );
		total += deleted;
	} while ( deleted === EXPIRED_DELETE_CHUNK_SIZE );

	return total;
};
