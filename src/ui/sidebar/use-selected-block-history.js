import { useEffect, useState } from '@wordpress/element';

import {
	listSnapshotsForBlock,
	subscribeToSnapshotChanges,
} from '../../snapshots/snapshot-service';

// Loads snapshots for a tracked block and reloads them when new ones are saved.
export const useSelectedBlockHistory = ( blockRewindId, postId ) => {
	const [ snapshots, setSnapshots ] = useState( [] );
	const [ isLoading, setIsLoading ] = useState( false );
	const [ error, setError ] = useState( null );
	const [ revision, setRevision ] = useState( 0 );

	useEffect( () => {
		if ( ! blockRewindId ) {
			return undefined;
		}

		return subscribeToSnapshotChanges( ( snapshot ) => {
			if ( snapshot.blockId === blockRewindId ) {
				setRevision( ( value ) => value + 1 );
			}
		} );
	}, [ blockRewindId ] );

	useEffect( () => {
		let isMounted = true;

		if ( ! postId || ! blockRewindId ) {
			setSnapshots( [] );
			setIsLoading( false );
			setError( null );
			return () => {
				isMounted = false;
			};
		}

		setIsLoading( true );
		setError( null );

		listSnapshotsForBlock( postId, blockRewindId )
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
	}, [ blockRewindId, postId, revision ] );

	return { snapshots, isLoading, error };
};
