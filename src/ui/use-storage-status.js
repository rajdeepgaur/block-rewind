import { useSyncExternalStore } from '@wordpress/element';

import {
	getStorageStatus,
	subscribeToStorageStatus,
} from '../state/storage-status';

// Returns the storage status and re-renders when it changes.
export const useStorageStatus = () =>
	useSyncExternalStore( subscribeToStorageStatus, getStorageStatus );
