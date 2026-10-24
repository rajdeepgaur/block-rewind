// 'pending' until the database opens, then 'ready' or 'unavailable'
// (e.g. private browsing modes or blocked site data). 'full' while writes fail because
// the browser's storage quota is used up; the next successful write makes it 'ready'.
let storageStatus = 'pending';
const listeners = new Set();

export const getStorageStatus = () => storageStatus;

export const setStorageStatus = ( status ) => {
	if ( status === storageStatus ) {
		return;
	}

	storageStatus = status;
	listeners.forEach( ( listener ) => listener() );
};

// Whether snapshots can be written. While storage is full, writes are still tried.
export const canWriteSnapshots = () =>
	storageStatus === 'ready' || storageStatus === 'full';

export const isQuotaExceededError = ( error ) =>
	error?.name === 'QuotaExceededError';

export const subscribeToStorageStatus = ( listener ) => {
	listeners.add( listener );
	return () => listeners.delete( listener );
};
