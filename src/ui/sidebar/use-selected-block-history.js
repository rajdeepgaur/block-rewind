import { useEffect, useState } from '@wordpress/element';

import { getLehfgBlockId } from '../../identity/block-identity';
import { listSnapshotsForBlock } from '../../snapshots/snapshot-service';

// Loads snapshots for the currently selected block.
export const useSelectedBlockHistory = ( selectedBlock, postId ) => {
	const [ snapshots, setSnapshots ] = useState( [] );
	const [ isLoading, setIsLoading ] = useState( false );
	const [ error, setError ] = useState( null );
	const selectedBlockId = selectedBlock?.clientId;
	const lehfgBlockId = getLehfgBlockId( selectedBlock );

	useEffect( () => {
		let isMounted = true;

		if ( ! selectedBlockId || ! postId || ! lehfgBlockId ) {
			setSnapshots( [] );
			setIsLoading( false );
			setError( null );
			return () => {
				isMounted = false;
			};
		}

		setIsLoading( true );
		setError( null );

		listSnapshotsForBlock( postId, lehfgBlockId )
			.then( ( loadedSnapshots ) => {
				if ( ! isMounted ) {
					return;
				}

				setSnapshots(
					loadedSnapshots
						.slice()
						.sort(
							( left, right ) => right.timestamp - left.timestamp
						)
				);
			} )
			.catch( ( loadError ) => {
				if ( ! isMounted ) {
					return;
				}

				setSnapshots( [] );
				setError( loadError );
			} )
			.finally( () => {
				if ( isMounted ) {
					setIsLoading( false );
				}
			} );

		return () => {
			isMounted = false;
		};
	}, [ lehfgBlockId, postId, selectedBlockId ] );

	return { snapshots, isLoading, error };
};
