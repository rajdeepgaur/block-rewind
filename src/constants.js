export const LEHFG_BLOCK_ID_ATTRIBUTE = 'lehfgBlockId';

export const DB_NAME_PREFIX = 'lehfg-history-';
// Pre-release database shared by every site and user on an origin; deleted on startup.
export const LEGACY_DB_NAME = 'lehfgHistoryDB';
export const DB_VERSION = 1;
export const SNAPSHOT_STORE = 'snapshots';

export const CHECKPOINT_INTERVAL_MS = 60 * 1000;
export const EXPIRY_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
export const SCAN_THROTTLE_MS = 200;
