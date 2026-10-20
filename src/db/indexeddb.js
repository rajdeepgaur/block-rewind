import {
	DB_NAME_PREFIX,
	DB_VERSION,
	LEGACY_DB_NAME,
	SNAPSHOT_STORE,
} from '../constants';
import { settings } from '../settings';

export const DB_NAME = `${ DB_NAME_PREFIX }${ settings.storageKey }`;

const BY_POST_BLOCK_TIME = 'byPostBlockTime';
const BY_EXPIRES_AT = 'byExpiresAt';

let dbPromise = null;

const getIndexedDB = () =>
	typeof window !== 'undefined' ? window.indexedDB : undefined;

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
				'LEHFG: waiting for other editor tabs to release the history database.'
			);
		};

		request.onsuccess = () => {
			const db = request.result;

			// Let a newer plugin version in another tab upgrade the database.
			db.onversionchange = () => {
				db.close();
				dbPromise = null;
			};
			db.onclose = () => {
				dbPromise = null;
			};

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

// Inserts a snapshot, then removes the oldest snapshots of that block beyond the limit.
export const putSnapshot = ( snapshot, maxSnapshotsPerBlock ) =>
	runTransaction( 'readwrite', ( store ) => {
		store.put( snapshot );

		const index = store.index( BY_POST_BLOCK_TIME );
		const range = blockRange( snapshot.postId, snapshot.blockId );
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
	} );

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

// Deletes all snapshots that have passed their expiration timestamp.
export const deleteExpiredSnapshots = ( now ) =>
	runTransaction( 'readwrite', ( store ) => {
		const request = store
			.index( BY_EXPIRES_AT )
			.openCursor( window.IDBKeyRange.upperBound( now ) );

		request.onsuccess = () => {
			const cursor = request.result;
			if ( cursor ) {
				cursor.delete();
				cursor.continue();
			}
		};
	} );

// Removes the pre-release database that was shared across sites and users. Best effort.
export const deleteLegacyDatabase = () => {
	try {
		getIndexedDB()?.deleteDatabase( LEGACY_DB_NAME );
	} catch ( error ) {
		// Nothing to clean up.
	}
};
