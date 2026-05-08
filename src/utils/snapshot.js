/**
 * Snapshot Utilities
 * 
 * Helper functions for creating and working with block snapshots
 */

/**
 * Create a snapshot object from a block
 * 
 * This extracts relevant data from a Gutenberg block and packages it
 * into a snapshot that can be stored in IndexedDB
 * 
 * @param {Object} block - The block object from wp.data.select('core/block-editor').getBlocks()
 * @param {number} postId - The currently edited post ID
 * @param {number} expiryHours - How many hours until this snapshot expires (default: 1)
 * @returns {Object} A snapshot object ready to save
 */
export function createSnapshot(block, postId, expiryHours = 1) {
	const now = Date.now();
	const expiresAt = now + (expiryHours * 60 * 60 * 1000);

	return {
		blockId: block.clientId,
		postId,
		timestamp: now,
		// Store block attributes (content, styling, custom properties, etc.)
		attributes: block.attributes || {},
		// Store inner blocks if this is a container block
		innerBlocks: block.innerBlocks || [],
		// Auto-delete timestamp
		expiresAt,
	};
}

/**
 * Check if two blocks are meaningfully different
 * 
 * This prevents saving duplicate snapshots when nothing actually changed.
 * Compare attributes and inner block count.
 * 
 * Why? If a user just clicks around without changing anything,
 * we shouldn't spam the database with identical snapshots.
 * 
 * @param {Object} block1 - First block
 * @param {Object} block2 - Second block
 * @returns {boolean} True if blocks are different
 */
export function hasBlockChanged(block1, block2) {
	// If either block doesn't exist, it's a change
	if (!block1 || !block2) {
		return true;
	}

	// Compare attributes
	const attrs1 = JSON.stringify(block1.attributes || {});
	const attrs2 = JSON.stringify(block2.attributes || {});

	if (attrs1 !== attrs2) {
		return true;
	}

	// Compare inner block count (indicates structure change)
	const innerCount1 = (block1.innerBlocks || []).length;
	const innerCount2 = (block2.innerBlocks || []).length;

	if (innerCount1 !== innerCount2) {
		return true;
	}

	// Recursively check inner blocks for deep changes
	const innerBlocks1 = block1.innerBlocks || [];
	const innerBlocks2 = block2.innerBlocks || [];

	for (let i = 0; i < innerCount1; i++) {
		if (hasBlockChanged(innerBlocks1[i], innerBlocks2[i])) {
			return true;
		}
	}

	return false;
}

/**
 * Format a snapshot for display
 * 
 * Converts timestamps to readable dates and formats data for UI
 * (We'll use this in Phase 2 for the history panel)
 * 
 * @param {Object} snapshot - Raw snapshot from IndexedDB
 * @returns {Object} Formatted snapshot for display
 */
export function formatSnapshotForDisplay(snapshot) {
	const date = new Date(snapshot.timestamp);

	return {
		...snapshot,
		timeago: getTimeAgo(snapshot.timestamp),
		displayTime: date.toLocaleTimeString(),
		displayDate: date.toLocaleDateString(),
	};
}

/**
 * Get time difference from now in human-readable format
 * 
 * Examples: "2 minutes ago", "1 hour ago"
 * 
 * @param {number} timestamp - Unix timestamp
 * @returns {string} Human-readable time difference
 */
export function getTimeAgo(timestamp) {
	const now = Date.now();
	const diffMs = now - timestamp;
	const diffSecs = Math.floor(diffMs / 1000);
	const diffMins = Math.floor(diffSecs / 60);
	const diffHours = Math.floor(diffMins / 60);

	if (diffSecs < 60) {
		return 'just now';
	}
	if (diffMins < 60) {
		return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
	}
	if (diffHours < 24) {
		return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
	}

	return '>24 hours ago';
}
