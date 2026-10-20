import { useCallback, useSyncExternalStore } from '@wordpress/element';

import {
	getTrackedBlockId,
	subscribeToTrackedIds,
} from '../../identity/block-identity';

// Returns the history ID of a block and re-renders when the block scan changes it.
export const useTrackedBlockId = ( block ) => {
	const getSnapshot = useCallback(
		() => getTrackedBlockId( block ),
		[ block ]
	);

	return useSyncExternalStore( subscribeToTrackedIds, getSnapshot );
};
