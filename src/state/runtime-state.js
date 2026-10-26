import { createIdentityState } from '../identity/resolve-block-identities';

export const runtimeState = {
	identity: createIdentityState(),
	// Results of the latest block scan.
	idByClientId: new Map(),
	blockByBlockId: new Map(),
	// blockId -> block object last seen by the scan, used to detect edits.
	observedByBlockId: new Map(),
	// blockId -> { blockName, hash } of the block when it was first tracked this session.
	initialStateByBlockId: new Map(),
	// Client IDs of all blocks in the latest scan.
	scannedClientIds: new Set(),
	// Block IDs whose pre-edit state was already saved this session.
	baselineCapturedIds: new Set(),
	// blockId -> pre-edit state whose save failed (e.g. storage full), saved again later.
	unsavedBaselines: new Map(),
	// clientId -> block state captured when an untracked block was selected.
	pendingBaselines: new Map(),
	previousSelectedClientId: null,
	// The post whose blocks are tracked. Kept while a template or pattern is shown, so
	// the post's edits are still saved under it.
	trackedPostId: null,
	// 'pending' until orphaned histories were matched against the loaded post once.
	relinkStatus: 'pending',
	isRestoringSnapshot: false,
	scanTimerId: null,
	storeUnsubscribe: null,
	checkpointTimerId: null,
	cleanupTimerId: null,
	checkpointInProgress: false,
	// A save of every edited block was asked for while a checkpoint was running.
	saveAllRequested: false,
};
