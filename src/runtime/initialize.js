import { startStoreSubscription } from '../change-detection/subscribe-store';
import { startExpiryCleanupScheduler } from '../cleanup/expiry-cleanup';
import { deleteLegacyDatabase, openHistoryDatabase } from '../db/indexeddb';
import {
	startCheckpointPersistence,
	startFlushOnPageHide,
} from '../persistence/checkpoint-persistence';
import { runSnapshotExpiryCleanup } from '../snapshots/snapshot-service';
import { setStorageStatus } from '../state/storage-status';

let initialized = false;

// Initializes database, cleanup, and reactive schedulers exactly once.
// Without browser storage nothing is tracked, so no block IDs are written either.
export const initializeHistoryRuntime = async () => {
	if ( initialized ) {
		return;
	}

	initialized = true;

	try {
		await openHistoryDatabase();
	} catch ( error ) {
		setStorageStatus( 'unavailable' );
		// eslint-disable-next-line no-console
		console.warn(
			'LEHFG: block history is disabled because browser storage is unavailable.',
			error
		);
		return;
	}

	setStorageStatus( 'ready' );
	deleteLegacyDatabase();

	await runSnapshotExpiryCleanup().catch( ( error ) => {
		// eslint-disable-next-line no-console
		console.error( 'LEHFG cleanup error:', error );
	} );

	startStoreSubscription();
	startCheckpointPersistence();
	startExpiryCleanupScheduler();
	startFlushOnPageHide();
};
