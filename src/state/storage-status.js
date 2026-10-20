// 'pending' until the database opens, then 'ready' or 'unavailable'
// (e.g. private browsing modes or blocked site data).
let storageStatus = 'pending';
const listeners = new Set();

export const getStorageStatus = () => storageStatus;

export const setStorageStatus = ( status ) => {
	storageStatus = status;
	listeners.forEach( ( listener ) => listener() );
};

export const subscribeToStorageStatus = ( listener ) => {
	listeners.add( listener );
	return () => listeners.delete( listener );
};
