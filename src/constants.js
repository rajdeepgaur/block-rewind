export const LEHFG_BLOCK_ID_ATTRIBUTE = 'lehfgBlockId';

export const DB_NAME_PREFIX = 'lehfg-history-';
// Pre-release database shared by every site and user on an origin; deleted on startup.
export const LEGACY_DB_NAME = 'lehfgHistoryDB';
export const DB_VERSION = 1;
export const SNAPSHOT_STORE = 'snapshots';

// Minimum time between two automatic saves of the same block.
export const CHECKPOINT_INTERVAL_MS = 60 * 1000;
// How often edited blocks are checked for being due for a save.
export const CHECKPOINT_TICK_MS = 5 * 1000;
export const EXPIRY_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
export const SCAN_THROTTLE_MS = 200;
