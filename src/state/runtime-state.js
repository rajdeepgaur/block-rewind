export const runtimeState = {
	previousSelectedClientId: null,
	isAssigningBlockId: false,
	isRestoringSnapshot: false,
	selectionInitInFlight: new Set(),
	storeChangeScheduled: false,
	storeUnsubscribe: null,
	checkpointTimerId: null,
	cleanupTimerId: null,
	checkpointInProgress: false,
	lastObservedHashes: new Map(),
};
