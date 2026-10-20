import { useEffect, useState } from '@wordpress/element';

import {
	listSnapshotsForBlock,
	subscribeToSnapshotChanges,
} from '../../snapshots/snapshot-service';

// Loads snapshots for a tracked block and reloads them when new ones are saved.
export const useSelectedBlockHistory = ( lehfgBlockId, postId ) => {
	const [ snapshots, setSnapshots ] = useState( [] );
	const [ isLoading, setIsLoading ] = useState( false );
	const [ error, setError ] = useState( null );
	const [ revision, setRevision ] = useState( 0 );

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

		if ( ! postId || ! lehfgBlockId ) {
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
	}, [ lehfgBlockId, postId, revision ] );

	return { snapshots, isLoading, error };
};
