import { createIdentityState } from '../identity/resolve-block-identities';

export const runtimeState = {
	identity: createIdentityState(),
	// Results of the latest block scan.
	idByClientId: new Map(),
	blockByBlockId: new Map(),
	// blockId -> block object last seen by the scan, used to detect edits.
	observedByBlockId: new Map(),
	// Block IDs whose pre-edit state was already saved this session.
	baselineCapturedIds: new Set(),
	// clientId -> block state captured when an untracked block was selected.
	pendingBaselines: new Map(),
	previousSelectedClientId: null,
	// 'pending' until orphaned histories were matched against the loaded post once.
	relinkStatus: 'pending',
	isRestoringSnapshot: false,
	scanTimerId: null,
	storeUnsubscribe: null,
	checkpointTimerId: null,
	cleanupTimerId: null,
	checkpointInProgress: false,
};
