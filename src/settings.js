const DEFAULT_SNAPSHOT_TTL_SECONDS = 4 * 60 * 60;
const DEFAULT_MAX_SNAPSHOTS_PER_BLOCK = 100;

const readPositiveInteger = ( value, fallback ) => {
	const number = Number( value );
	return Number.isFinite( number ) && number > 0
		? Math.floor( number )
		: fallback;
};

// Settings printed by PHP before the runtime script (see block_rewind_get_editor_settings()).
const rawSettings =
	( typeof window !== 'undefined' && window.blockRewindSettings ) || {};

export const settings = {
	storageKey: String( rawSettings.storageKey || 'default' ),
	snapshotTtlMs:
		readPositiveInteger(
			rawSettings.snapshotTtl,
			DEFAULT_SNAPSHOT_TTL_SECONDS
		) * 1000,
	maxSnapshotsPerBlock: readPositiveInteger(
		rawSettings.maxSnapshotsPerBlock,
		DEFAULT_MAX_SNAPSHOTS_PER_BLOCK
	),
};
