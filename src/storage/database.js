/**
 * IndexedDB Storage Module
 * 
 * Handles all database operations for block snapshots
 * Database: live-editing-history
 * Object Store: blockSnapshots
 */

import { openDB } from 'idb';

const DB_NAME = 'live-editing-history';
const DB_VERSION = 1;
const STORE_NAME = 'blockSnapshots';

/**
 * Get or create the database instance
 * 
 * This function initializes IndexedDB with our schema:
 * - Creates the database if it doesn't exist
 * - Sets up the object store with indexes for efficient queries
 * - Runs once per browser session
 */
async function getDatabase() {
	return openDB(DB_NAME, DB_VERSION, {
		upgrade(db) {
			// Create object store with auto-incrementing id as key
			// This is like creating a table with an auto-increment primary key
			if (!db.objectStoreNames.contains(STORE_NAME)) {
				const store = db.createObjectStore(STORE_NAME, {
					keyPath: 'id',
					autoIncrement: true,
				});

				// Create indexes for efficient querying
				// Indexes are like database indexes - they speed up lookups
				store.createIndex('blockId', 'blockId'); // Find snapshots by block ID
				store.createIndex('expiresAt', 'expiresAt'); // Find expired snapshots
				store.createIndex('postId', 'postId'); // Find snapshots by post
			}
		},
	});
}

/**
 * Save a block snapshot to IndexedDB
 * 
 * @param {Object} snapshot - The snapshot data to save
 * @param {string} snapshot.blockId - Unique block identifier (clientId)
 * @param {number} snapshot.postId - ID of the WordPress post
 * @param {number} snapshot.timestamp - When snapshot was taken
 * @param {Object} snapshot.attributes - Block attributes at this point
 * @param {Array} snapshot.innerBlocks - Child blocks (if any)
 * @param {number} snapshot.expiresAt - Unix timestamp when to auto-delete
 * @returns {Promise<number>} The auto-generated ID of the saved record
 */
export async function saveSnapshot(snapshot) {
	try {
		const db = await getDatabase();
		
		// Validate required fields
		if (!snapshot.blockId || !snapshot.postId) {
			console.error('Snapshot missing required fields:', snapshot);
			return null;
		}

		// Transaction: a batch of operations treated as atomic
		// 'readwrite' means we can modify data in this transaction
		const tx = db.transaction(STORE_NAME, 'readwrite');
		const store = tx.objectStore(STORE_NAME);

		// Add the snapshot and get back its auto-generated ID
		const id = await store.add(snapshot);

		// Wait for transaction to complete
		await tx.done;

		console.log(`✓ Snapshot saved (ID: ${id})`, snapshot);
		return id;
	} catch (error) {
		console.error('Error saving snapshot:', error);
		return null;
	}
}

/**
 * Get all snapshots for a specific block
 * 
 * This retrieves the entire history of a block by querying
 * the blockId index we created earlier.
 * 
 * @param {string} blockId - The block's clientId
 * @returns {Promise<Array>} Array of snapshots in order
 */
export async function getSnapshotsByBlockId(blockId) {
	try {
		const db = await getDatabase();
		
		// Transaction: read-only since we're just fetching
		const tx = db.transaction(STORE_NAME, 'readonly');
		const store = tx.objectStore(STORE_NAME);
		
		// Get the index and find all records matching this blockId
		const index = store.index('blockId');
		const snapshots = await index.getAll(blockId);

		await tx.done;

		return snapshots;
	} catch (error) {
		console.error(`Error fetching snapshots for block ${blockId}:`, error);
		return [];
	}
}

/**
 * Get all snapshots for a post
 * 
 * Useful for seeing all changes across a post
 * 
 * @param {number} postId - The WordPress post ID
 * @returns {Promise<Array>} Array of all snapshots for this post
 */
export async function getSnapshotsByPostId(postId) {
	try {
		const db = await getDatabase();
		const tx = db.transaction(STORE_NAME, 'readonly');
		const store = tx.objectStore(STORE_NAME);
		const index = store.index('postId');
		const snapshots = await index.getAll(postId);

		await tx.done;

		return snapshots;
	} catch (error) {
		console.error(`Error fetching snapshots for post ${postId}:`, error);
		return [];
	}
}

/**
 * Delete all expired snapshots
 * 
 * This removes snapshots where expiresAt is in the past.
 * Can be called periodically (e.g., every minute) to clean up old data.
 * 
 * @returns {Promise<number>} Number of records deleted
 */
export async function deleteExpiredSnapshots() {
	try {
		const db = await getDatabase();
		const now = Date.now();
		let deleted = 0;

		// We need to manually iterate because IndexedDB doesn't have
		// a built-in way to delete by condition
		const tx = db.transaction(STORE_NAME, 'readwrite');
		const store = tx.objectStore(STORE_NAME);
		const index = store.index('expiresAt');

		// Get all snapshots where expiresAt is less than current time
		const expiredSnapshots = await index.getAll(
			IDBKeyRange.upperBound(now)
		);

		// Delete each expired snapshot
		for (const snapshot of expiredSnapshots) {
			await store.delete(snapshot.id);
			deleted++;
		}

		await tx.done;

		if (deleted > 0) {
			console.log(`✓ Cleaned up ${deleted} expired snapshots`);
		}

		return deleted;
	} catch (error) {
		console.error('Error deleting expired snapshots:', error);
		return 0;
	}
}

/**
 * Clear all snapshots (useful for testing/debugging)
 * 
 * @returns {Promise<void>}
 */
export async function clearAllSnapshots() {
	try {
		const db = await getDatabase();
		const tx = db.transaction(STORE_NAME, 'readwrite');
		const store = tx.objectStore(STORE_NAME);

		await store.clear();
		await tx.done;

		console.log('✓ All snapshots cleared');
	} catch (error) {
		console.error('Error clearing snapshots:', error);
	}
}
