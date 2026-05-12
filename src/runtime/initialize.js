import { startStoreSubscription } from '../change-detection/subscribe-store';
import { startExpiryCleanupScheduler } from '../cleanup/expiry-cleanup';
import { openHistoryDatabase } from '../db/indexeddb';
import { startCheckpointPersistence } from '../persistence/checkpoint-persistence';
import { runSnapshotExpiryCleanup } from '../snapshots/snapshot-service';

let initialized = false;

// Initializes database, cleanup, and reactive schedulers exactly once.
export const initializeHistoryRuntime = async () => {
	if ( initialized ) {
		return;
	}

	initialized = true;

	await openHistoryDatabase();
	await runSnapshotExpiryCleanup();

	startStoreSubscription();
	startCheckpointPersistence();
	startExpiryCleanupScheduler();
};
