/**
 * Block Change Detection System
 *
 * Selection-aware tracking to avoid snapshot spam during editor bootstrap,
 * passive scrolling, and unrelated store updates.
 */

import { hasBlockChanged, createSnapshot } from '../utils/snapshot';
import { saveSnapshot, deleteExpiredSnapshots } from '../storage/database';

// Store previous state to detect changes
let previousBlocks = [];
let previousPostId = null;
let isInitialized = false;

// Selection-aware tracking state
let trackedSelectionIds = new Set();
let trackedSelectionKey = '';
let initialSnapshotSavedIds = new Set();
let lastSavedStateHashByBlockId = new Map();

// Intent/bootstrap guards
let bootstrapReady = false;
let hasSelectionIntent = false;
let lastObservedSelectionKey = '';

// Debounce and overlap guards
const SELECTION_DEBOUNCE_MS = 300;
const CHANGE_DEBOUNCE_MS = 400;
let selectionDebounceTimer = null;
let changeDebounceTimer = null;
let selectionInFlight = false;
let selectionNeedsRerun = false;
let changeInFlight = false;
let changeNeedsRerun = false;

// Latest contexts used by debounced handlers
let latestSelectionContext = null;
let latestChangeContext = null;

/**
 * Flatten the block tree into a single array for easier comparison
 *
 * @param {Array} blocks - Block tree
 * @param {Array} flat - Accumulator (optional)
 * @returns {Array} Flat array of all blocks
 */
function flattenBlocks(blocks, flat = []) {
	for (const block of blocks) {
		flat.push(block);
		if (block.innerBlocks && block.innerBlocks.length > 0) {
			flattenBlocks(block.innerBlocks, flat);
		}
	}
	return flat;
}

/**
 * Build a map of clientId => block for quick lookups
 *
 * @param {Array} blocks - Block tree
 * @returns {Map<string, Object>} Block map
 */
function buildBlockMap(blocks) {
	const map = new Map();
	const flat = flattenBlocks(blocks);
	for (const block of flat) {
		map.set(block.clientId, block);
	}
	return map;
}

/**
 * Build a stable key for selected IDs
 *
 * @param {Array<string>} ids - Selected IDs
 * @returns {string} Stable key
 */
function getSelectionKey(ids) {
	return [...ids].sort().join('|');
}

/**
 * Return selected top-level block IDs
 *
 * @param {Object} blockEditor - core/block-editor selector
 * @returns {Array<string>} Selected IDs
 */
function getSelectedClientIds(blockEditor) {
	const multiSelected = blockEditor.getMultiSelectedBlockClientIds?.() || [];
	if (multiSelected.length > 0) {
		return multiSelected;
	}

	const singleSelected = blockEditor.getSelectedBlockClientId?.();
	return singleSelected ? [singleSelected] : [];
}

/**
 * Expand selected IDs to include all descendants
 *
 * @param {Array<string>} selectedIds - Top-level selected IDs
 * @param {Map<string, Object>} blockMap - clientId => block map
 * @returns {Array<string>} Expanded and de-duplicated IDs
 */
function expandSelectionWithDescendants(selectedIds, blockMap) {
	const expanded = new Set();

	const walk = (block) => {
		if (!block || expanded.has(block.clientId)) {
			return;
		}

		expanded.add(block.clientId);
		const children = block.innerBlocks || [];
		for (const child of children) {
			walk(child);
		}
	};

	for (const id of selectedIds) {
		walk(blockMap.get(id));
	}

	return [...expanded];
}

/**
 * Validate multi-select type constraint
 *
 * @param {Array<string>} selectedIds - Top-level selected IDs
 * @param {Map<string, Object>} blockMap - clientId => block map
 * @returns {boolean} True when selection is trackable
 */
function isTrackableMultiSelect(selectedIds, blockMap) {
	if (selectedIds.length <= 1) {
		return true;
	}

	const names = selectedIds
		.map((id) => blockMap.get(id)?.name)
		.filter(Boolean);

	if (names.length !== selectedIds.length) {
		return false;
	}

	return names.every((name) => name === names[0]);
}

/**
 * Build a lightweight, stable hash for block state
 *
 * @param {Object} block - Block object
 * @returns {string} State hash
 */
function getBlockStateHash(block) {
	if (!block) {
		return '';
	}

	const payload = {
		attributes: block.attributes || {},
		innerBlocks: (block.innerBlocks || []).map(getBlockStateHash),
	};

	return JSON.stringify(payload);
}

/**
 * Find all blocks that changed between two states
 *
 * @param {Array} oldBlocks - Previous blocks
 * @param {Array} newBlocks - Current blocks
 * @returns {Array} Array of changed block IDs
 */
function findChangedBlocks(oldBlocks, newBlocks) {
	const changed = [];

	const oldFlat = flattenBlocks(oldBlocks);
	const newFlat = flattenBlocks(newBlocks);

	for (const oldBlock of oldFlat) {
		const newBlock = newFlat.find((b) => b.clientId === oldBlock.clientId);

		if (!newBlock) {
			changed.push(oldBlock.clientId);
		} else if (hasBlockChanged(oldBlock, newBlock)) {
			changed.push(newBlock.clientId);
		}
	}

	for (const newBlock of newFlat) {
		const oldBlock = oldFlat.find((b) => b.clientId === newBlock.clientId);
		if (!oldBlock) {
			changed.push(newBlock.clientId);
		}
	}

	return changed;
}

/**
 * Reset per-post tracking caches
 *
 * @param {number|null} postId - Current post ID
 * @param {Array} currentBlocks - Current block tree
 */
function resetTrackingState(postId, currentBlocks) {
	trackedSelectionIds = new Set();
	trackedSelectionKey = '';
	initialSnapshotSavedIds = new Set();
	lastSavedStateHashByBlockId = new Map();
	hasSelectionIntent = false;
	lastObservedSelectionKey = '';
	previousPostId = postId;
	previousBlocks = currentBlocks || [];
	console.log(`Tracking reset for post ${postId}`);
}

/**
 * Handle block changes and save snapshots
 *
 * @param {number} postId - The current post ID
 * @param {Array} currentBlocks - The current block tree
 */
async function handleBlockChanges(postId, currentBlocks) {
	if (!postId) {
		return;
	}

	if (!bootstrapReady) {
		previousBlocks = currentBlocks;
		return;
	}

	if (postId !== previousPostId) {
		resetTrackingState(postId, currentBlocks);
		return;
	}

	const previousSnapshot = previousBlocks;
	const changedBlockIds = findChangedBlocks(previousSnapshot, currentBlocks);
	previousBlocks = currentBlocks;

	if (changedBlockIds.length === 0 || trackedSelectionIds.size === 0) {
		return;
	}

	const currentBlockMap = buildBlockMap(currentBlocks);
	const previousBlockMap = buildBlockMap(previousSnapshot);
	const changedTrackedIds = changedBlockIds.filter((id) => trackedSelectionIds.has(id));

	if (changedTrackedIds.length === 0) {
		return;
	}

	let savedCount = 0;

	for (const blockId of changedTrackedIds) {
		const block = currentBlockMap.get(blockId);
		const previousBlock = previousBlockMap.get(blockId);

		if (!block) {
			continue;
		}

		if (previousBlock && !hasBlockChanged(previousBlock, block)) {
			continue;
		}

		const stateHash = getBlockStateHash(block);
		if (lastSavedStateHashByBlockId.get(blockId) === stateHash) {
			continue;
		}

		const snapshot = createSnapshot(block, postId);
		const savedId = await saveSnapshot(snapshot);
		if (savedId) {
			savedCount++;
			lastSavedStateHashByBlockId.set(blockId, stateHash);
		}
	}

	if (savedCount > 0) {
		console.log(`Saved ${savedCount} change snapshot(s) for tracked selection`);
	}
}

/**
 * Handle selection updates and save initial snapshots for valid selections
 *
 * @param {number} postId - Current post ID
 * @param {Array} currentBlocks - Current block tree
 * @param {Object} blockEditor - core/block-editor selector
 */
async function handleSelection(postId, currentBlocks, blockEditor) {
	if (!postId || !bootstrapReady) {
		return;
	}

	if (postId !== previousPostId) {
		resetTrackingState(postId, currentBlocks);
		return;
	}

	const selectedIds = getSelectedClientIds(blockEditor);
	const selectionKey = getSelectionKey(selectedIds);

	if (!hasSelectionIntent) {
		if (selectionKey && selectionKey !== lastObservedSelectionKey) {
			hasSelectionIntent = true;
		} else {
			lastObservedSelectionKey = selectionKey;
			return;
		}
	}

	lastObservedSelectionKey = selectionKey;

	if (!selectionKey) {
		trackedSelectionIds = new Set();
		trackedSelectionKey = '';
		return;
	}

	const blockMap = buildBlockMap(currentBlocks);

	if (!isTrackableMultiSelect(selectedIds, blockMap)) {
		trackedSelectionIds = new Set();
		trackedSelectionKey = '';
		console.log('Skipping mixed-type multi-select');
		return;
	}

	const expandedIds = expandSelectionWithDescendants(selectedIds, blockMap);
	trackedSelectionIds = new Set(expandedIds);
	trackedSelectionKey = getSelectionKey(expandedIds);

	let savedInitialCount = 0;

	for (const blockId of expandedIds) {
		if (initialSnapshotSavedIds.has(blockId)) {
			continue;
		}

		const block = blockMap.get(blockId);
		if (!block) {
			continue;
		}

		const snapshot = createSnapshot(block, postId);
		const savedId = await saveSnapshot(snapshot);
		if (savedId) {
			savedInitialCount++;
			initialSnapshotSavedIds.add(blockId);
			lastSavedStateHashByBlockId.set(blockId, getBlockStateHash(block));
		}
	}

	if (savedInitialCount > 0) {
		console.log(`Saved ${savedInitialCount} initial snapshot(s) for selection ${trackedSelectionKey}`);
	}
}

/**
 * Run debounced selection handler with in-flight overlap protection
 */
function runSelectionHandler() {
	if (selectionInFlight) {
		selectionNeedsRerun = true;
		return;
	}

	if (!latestSelectionContext) {
		return;
	}

	selectionInFlight = true;
	const context = latestSelectionContext;

	handleSelection(context.postId, context.currentBlocks, context.blockEditor)
		.catch((error) => {
			console.error('Error in selection handler:', error);
		})
		.finally(() => {
			selectionInFlight = false;
			if (selectionNeedsRerun) {
				selectionNeedsRerun = false;
				runSelectionHandler();
			}
		});
}

/**
 * Run debounced change handler with in-flight overlap protection
 */
function runChangeHandler() {
	if (changeInFlight) {
		changeNeedsRerun = true;
		return;
	}

	if (!latestChangeContext) {
		return;
	}

	changeInFlight = true;
	const context = latestChangeContext;

	handleBlockChanges(context.postId, context.currentBlocks)
		.catch((error) => {
			console.error('Error handling block changes:', error);
		})
		.finally(() => {
			changeInFlight = false;
			if (changeNeedsRerun) {
				changeNeedsRerun = false;
				runChangeHandler();
			}
		});
}

/**
 * Debounce selection processing
 *
 * @param {Object} context - Selection context
 */
function scheduleSelectionProcessing(context) {
	latestSelectionContext = context;
	if (selectionDebounceTimer) {
		clearTimeout(selectionDebounceTimer);
	}

	selectionDebounceTimer = setTimeout(() => {
		runSelectionHandler();
	}, SELECTION_DEBOUNCE_MS);
}

/**
 * Debounce block-change processing
 *
 * @param {Object} context - Change context
 */
function scheduleChangeProcessing(context) {
	latestChangeContext = context;
	if (changeDebounceTimer) {
		clearTimeout(changeDebounceTimer);
	}

	changeDebounceTimer = setTimeout(() => {
		runChangeHandler();
	}, CHANGE_DEBOUNCE_MS);
}

/**
 * Initialize the change detection system
 *
 * This sets up the subscription to the block editor store.
 */
export async function initChangeDetection() {
	if (isInitialized) {
		return;
	}

	console.log('Initializing block change detection...');

	try {
		const blockEditor = wp.data.select('core/block-editor');
		const editorStore = wp.data.select('core/editor');

		if (!blockEditor || !editorStore) {
			console.error('Block editor store not available');
			return;
		}

		previousBlocks = blockEditor.getBlocks() || [];
		previousPostId = editorStore.getCurrentPostId();
		lastObservedSelectionKey = getSelectionKey(getSelectedClientIds(blockEditor));

		console.log(`Initial state: ${previousBlocks.length} blocks in post ${previousPostId}`);
		console.log('Waiting for user selection intent before tracking snapshots');

		setTimeout(() => {
			bootstrapReady = true;
			console.log('Editor bootstrap completed; tracking active');
		}, 1200);

		const unsubscribe = wp.data.subscribe(() => {
			try {
				const currentBlocks = blockEditor.getBlocks() || [];
				const postId = editorStore.getCurrentPostId();

				scheduleSelectionProcessing({
					postId,
					currentBlocks,
					blockEditor,
				});

				scheduleChangeProcessing({
					postId,
					currentBlocks,
				});
			} catch (error) {
				console.error('Error in change detection:', error);
			}
		});

		setInterval(() => {
			deleteExpiredSnapshots().catch((error) => {
				console.error('Error cleaning expired snapshots:', error);
			});
		}, 5 * 60 * 1000);

		isInitialized = true;
		console.log('Block change detection ready');

		return unsubscribe;
	} catch (error) {
		console.error('Failed to initialize change detection:', error);
	}
}