import { DB_NAME, DB_VERSION, SNAPSHOT_STORE } from '../constants';

let dbPromise;

// Runs an operation within a snapshot store transaction.
const withStore = async ( mode, callback ) => {
	const db = await openHistoryDatabase();

	return new Promise( ( resolve, reject ) => {
		const tx = db.transaction( SNAPSHOT_STORE, mode );
		const store = tx.objectStore( SNAPSHOT_STORE );

		let requestResult;

		try {
			requestResult = callback( store, tx );
		} catch ( error ) {
			reject( error );
			return;
		}

		tx.oncomplete = () => resolve( requestResult );
		tx.onerror = () => reject( tx.error );
		tx.onabort = () => reject( tx.error );
	} );
};

// Reads all records from a named index using the provided key range.
const readAllByIndex = ( store, indexName, keyRange ) =>
	new Promise( ( resolve, reject ) => {
		const index = store.index( indexName );
		const request = index.getAll( keyRange );

		request.onsuccess = () => resolve( request.result || [] );
		request.onerror = () => reject( request.error );
	} );

// Opens and memoizes the IndexedDB connection used by the plugin.
export const openHistoryDatabase = () => {
	if ( dbPromise ) {
		return dbPromise;
	}

	dbPromise = new Promise( ( resolve, reject ) => {
		const request = indexedDB.open( DB_NAME, DB_VERSION );

		request.onupgradeneeded = ( event ) => {
			const db = event.target.result;

			if ( ! db.objectStoreNames.contains( SNAPSHOT_STORE ) ) {
				const snapshotStore = db.createObjectStore( SNAPSHOT_STORE, {
					keyPath: 'snapshotId',
				} );

				snapshotStore.createIndex(
					'byPostBlock',
					[ 'postId', 'blockId' ],
					{
						unique: false,
					}
				);

				snapshotStore.createIndex( 'byExpiresAt', 'expiresAt', {
					unique: false,
				} );
			}
		};

		request.onsuccess = () => resolve( request.result );
		request.onerror = () => reject( request.error );
	} );

	return dbPromise;
};

// Inserts or updates a snapshot record.
export const putSnapshot = ( snapshot ) =>
	withStore( 'readwrite', ( store ) => {
		store.put( snapshot );
	} );

// Lists snapshots for one block in one post ordered by timestamp.
export const getSnapshotsByPostAndBlock = async ( postId, blockId ) => {
	if ( ! postId || ! blockId ) {
		return [];
	}

	return withStore( 'readonly', async ( store ) => {
		const keyRange = IDBKeyRange.only( [ postId, blockId ] );
		const snapshots = await readAllByIndex(
			store,
			'byPostBlock',
			keyRange
		);

		snapshots.sort( ( a, b ) => a.timestamp - b.timestamp );
		return snapshots;
	} );
};

// Returns the latest snapshot for one block in one post.
export const getLatestSnapshotByPostAndBlock = async ( postId, blockId ) => {
	const snapshots = await getSnapshotsByPostAndBlock( postId, blockId );
	return snapshots.length ? snapshots[ snapshots.length - 1 ] : null;
};

// Deletes all snapshots that have passed their expiration timestamp.
export const deleteExpiredSnapshots = ( now ) =>
	withStore( 'readwrite', ( store ) => {
		const index = store.index( 'byExpiresAt' );
		const range = IDBKeyRange.upperBound( now );
		const request = index.openCursor( range );

		request.onsuccess = ( event ) => {
			const cursor = event.target.result;
			if ( cursor ) {
				store.delete( cursor.primaryKey );
				cursor.continue();
			}
		};
	} );
