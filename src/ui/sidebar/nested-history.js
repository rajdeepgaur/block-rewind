import { BlockIcon, store as blockEditorStore } from '@wordpress/block-editor';
import { getBlockType } from '@wordpress/blocks';
import { Button } from '@wordpress/components';
import { useDispatch, useSelect } from '@wordpress/data';
import {
	useCallback,
	useEffect,
	useState,
	useSyncExternalStore,
} from '@wordpress/element';
import { __, _n, sprintf } from '@wordpress/i18n';

import {
	getTrackedBlockId,
	subscribeToTrackedIds,
} from '../../identity/block-identity';
import { getFullText } from '../../diff/describe-changes';
import { listSnapshotsForBlock } from '../../snapshots/snapshot-service';

// Returns the blocks inside a block that have a history, as { block, blockId }.
const useTrackedDescendants = ( clientId ) => {
	const descendants = useSelect(
		( select ) => {
			const blockEditor = select( blockEditorStore );
			return blockEditor.getBlocksByClientId(
				blockEditor.getClientIdsOfDescendants( [ clientId ] )
			);
		},
		[ clientId ]
	);

	const getTrackedKey = useCallback(
		() =>
			descendants
				.map( ( block ) => getTrackedBlockId( block ) || '' )
				.join( ',' ),
		[ descendants ]
	);
	// Re-renders when a scan starts or stops tracking one of the blocks.
	useSyncExternalStore( subscribeToTrackedIds, getTrackedKey );

	return descendants
		.filter( Boolean )
		.map( ( block ) => ( { block, blockId: getTrackedBlockId( block ) } ) )
		.filter( ( { blockId } ) => blockId );
};

// Loads how many versions each block has, keyed by history ID.
const useVersionCounts = ( postId, blockIds ) => {
	const [ counts, setCounts ] = useState( {} );
	const key = blockIds.join( ',' );

	useEffect( () => {
		let isMounted = true;

		Promise.all(
			blockIds.map( ( blockId ) =>
				listSnapshotsForBlock( postId, blockId )
					.then( ( snapshots ) => [ blockId, snapshots.length ] )
					.catch( () => [ blockId, null ] )
			)
		).then( ( entries ) => {
			if ( isMounted ) {
				setCounts( Object.fromEntries( entries ) );
			}
		} );

		return () => {
			isMounted = false;
		};
		// The key stands for the list of IDs.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ postId, key ] );

	return counts;
};

/**
 * Shown for a block without history of its own. When blocks inside it have history
 * (they were edited directly), lists them so they can be selected.
 *
 * @param {Object}        props
 * @param {string}        props.clientId Client ID of the selected block.
 * @param {number|string} props.postId   Current post ID.
 */
export const NestedHistory = ( { clientId, postId } ) => {
	const trackedDescendants = useTrackedDescendants( clientId );
	const counts = useVersionCounts(
		postId,
		trackedDescendants.map( ( { blockId } ) => blockId )
	);
	const { selectBlock } = useDispatch( blockEditorStore );

	if ( ! trackedDescendants.length ) {
		return (
			<div className="block-rewind-empty">
				<p className="block-rewind-empty__title">
					{ __(
						'History starts with your first edit',
						'block-rewind'
					) }
				</p>
				<p className="block-rewind-empty__text">
					{ __(
						'When you change this block, the way it looks now is saved first, so you can always return to it.',
						'block-rewind'
					) }
				</p>
			</div>
		);
	}

	return (
		<div className="block-rewind-nested">
			<div className="block-rewind-empty">
				<p className="block-rewind-empty__title">
					{ __( 'History is kept per block', 'block-rewind' ) }
				</p>
				<p className="block-rewind-empty__text">
					{ __(
						'You edited blocks inside this one. Select one to see and restore its versions.',
						'block-rewind'
					) }
				</p>
			</div>
			<h4 className="block-rewind-timeline__group-label">
				{ __( 'Blocks inside with history', 'block-rewind' ) }
			</h4>
			<ul className="block-rewind-nested__list">
				{ trackedDescendants.map( ( { block, blockId } ) => {
					const count = counts[ blockId ];
					const blockType = getBlockType( block.name );

					return (
						<li key={ block.clientId }>
							<Button
								className="block-rewind-nested__item"
								onClick={ () => selectBlock( block.clientId ) }
							>
								<BlockIcon icon={ blockType?.icon } />
								<span className="block-rewind-nested__text">
									<span className="block-rewind-nested__name">
										{ blockType?.title || block.name }
									</span>
									<span className="block-rewind-nested__excerpt">
										{ getFullText( block ) }
									</span>
								</span>
								{ typeof count === 'number' && (
									<span className="block-rewind-nested__count">
										{ count
											? sprintf(
													/* translators: %d: number of versions. */
													_n(
														'%d version',
														'%d versions',
														count,
														'block-rewind'
													),
													count
											  )
											: __(
													'No versions yet',
													'block-rewind'
											  ) }
									</span>
								) }
							</Button>
						</li>
					);
				} ) }
			</ul>
		</div>
	);
};
