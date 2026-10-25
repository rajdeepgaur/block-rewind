import { STORAGE_OPEN_TIMEOUT_MS } from '../constants';
import { startStoreSubscription } from '../change-detection/subscribe-store';
import { startExpiryCleanupScheduler } from '../cleanup/expiry-cleanup';
import { openHistoryDatabase } from '../db/indexeddb';
import {
	startCheckpointPersistence,
	startFlushOnPageHide,
} from '../persistence/checkpoint-persistence';
import { runSnapshotExpiryCleanup } from '../snapshots/snapshot-service';
import { setStorageStatus } from '../state/storage-status';

let initialized = false;

// Rejects when the promise hasn't settled in time. Some browsers never answer when
// opening storage fails, which would otherwise leave history pending forever.
const withTimeout = ( promise, timeoutMs ) =>
	new Promise( ( resolve, reject ) => {
		const timerId = setTimeout(
			() => reject( new Error( 'Opening browser storage timed out.' ) ),
			timeoutMs
		);
		promise
			.then( resolve, reject )
			.finally( () => clearTimeout( timerId ) );
	} );

// Initializes database, cleanup, and reactive schedulers exactly once.
// Without browser storage nothing is tracked, so no block IDs are written either.
export const initializeHistoryRuntime = async () => {
	if ( initialized ) {
		return;
	}

	initialized = true;

	try {
		await withTimeout( openHistoryDatabase(), STORAGE_OPEN_TIMEOUT_MS );
	} catch ( error ) {
		setStorageStatus( 'unavailable' );
		// eslint-disable-next-line no-console
		console.warn(
			'Block Rewind: block history is disabled because browser storage is unavailable.',
			error
		);
		return;
	}

	setStorageStatus( 'ready' );

	startStoreSubscription();
	startCheckpointPersistence();
	startExpiryCleanupScheduler();
	startFlushOnPageHide();

	// Runs in the background: after a long absence there can be enough expired versions
	// to take seconds, and edits made meanwhile must already be tracked.
	runSnapshotExpiryCleanup().catch( ( error ) => {
		// eslint-disable-next-line no-console
		console.error( 'Block Rewind cleanup error:', error );
	} );
};
