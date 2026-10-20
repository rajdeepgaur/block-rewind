import { useEffect, useState } from '@wordpress/element';

import { getTrackedBlockId } from '../../identity/block-identity';
import {
	listSnapshotsForBlock,
	subscribeToSnapshotChanges,
} from '../../snapshots/snapshot-service';

// Loads snapshots for the currently selected block and reloads them when new ones are saved.
export const useSelectedBlockHistory = ( selectedBlock, postId ) => {
	const [ snapshots, setSnapshots ] = useState( [] );
	const [ isLoading, setIsLoading ] = useState( false );
	const [ error, setError ] = useState( null );
	const [ revision, setRevision ] = useState( 0 );
	const selectedBlockId = selectedBlock?.clientId;
	const lehfgBlockId = getTrackedBlockId( selectedBlock );

	useEffect( () => {
		if ( ! lehfgBlockId ) {
			return undefined;
		}

		return subscribeToSnapshotChanges( ( snapshot ) => {
			if ( snapshot.blockId === lehfgBlockId ) {
				setRevision( ( value ) => value + 1 );
			}
		} );
	}, [ lehfgBlockId ] );

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
	}, [ lehfgBlockId, postId, selectedBlockId, revision ] );

	return { snapshots, isLoading, error };
};
