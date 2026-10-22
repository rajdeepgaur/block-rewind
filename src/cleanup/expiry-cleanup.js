import { EXPIRY_CLEANUP_INTERVAL_MS } from '../constants';
import { runSnapshotExpiryCleanup } from '../snapshots/snapshot-service';
import { runtimeState } from '../state/runtime-state';

// Starts periodic cleanup for snapshots older than their expiry time.
export const startExpiryCleanupScheduler = () => {
	if ( runtimeState.cleanupTimerId ) {
		return;
	}

	runtimeState.cleanupTimerId = setInterval( () => {
		runSnapshotExpiryCleanup().catch( ( error ) => {
			// eslint-disable-next-line no-console
			console.error( 'Block Rewind cleanup error:', error );
		} );
	}, EXPIRY_CLEANUP_INTERVAL_MS );
};
