import { store as blockEditorStore } from '@wordpress/block-editor';
import { Button, Notice } from '@wordpress/components';
import { useSelect } from '@wordpress/data';
import { PluginSidebar, PluginSidebarMoreMenuItem } from '@wordpress/editor';
import { __, _n, sprintf } from '@wordpress/i18n';
import { useState, useSyncExternalStore } from '@wordpress/element';
import { registerPlugin } from '@wordpress/plugins';

import './styles.css';

import { restoreSnapshotToEditor } from '../../restore/restore-snapshot';
import { computeBlockHash } from '../../serialization/serialize-block';
import { settings } from '../../settings';
import {
	getStorageStatus,
	subscribeToStorageStatus,
} from '../../state/storage-status';
import { CompareModal } from '../compare/compare-modal';
import { useNow } from '../use-now';
import { BlockHeader } from './block-header';
import { NestedHistory } from './nested-history';
import { useSelectedBlockHistory } from './use-selected-block-history';
import { useTrackedBlockId } from './use-tracked-block-id';
import { VersionTimeline } from './version-timeline';

// Describes retention in hours or minutes, e.g. "4 hours".
const formatRetention = ( milliseconds ) => {
	const minutes = Math.round( milliseconds / 60000 );

	if ( minutes % 60 === 0 ) {
		const hours = minutes / 60;
		return sprintf(
			/* translators: %d: number of hours. */
			_n( '%d hour', '%d hours', hours, 'block-rewind' ),
			hours
		);
	}

	return sprintf(
		/* translators: %d: number of minutes. */
		_n( '%d minute', '%d minutes', minutes, 'block-rewind' ),
		minutes
	);
};

const HistoryIcon = () => (
	<svg
		width="32"
		height="32"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="1.4"
		aria-hidden="true"
		focusable="false"
	>
		<path d="M3.5 12a8.5 8.5 0 1 0 2.5-6" />
		<path d="M3.5 3.5V8H8" />
		<path d="M12 7.5V12l3 2" />
	</svg>
);

const EmptyState = ( { icon, title, children } ) => (
	<div className="block-rewind-empty">
		{ icon }
		<p className="block-rewind-empty__title">{ title }</p>
		{ children && <p className="block-rewind-empty__text">{ children }</p> }
	</div>
);

const LoadingState = () => (
	<div className="block-rewind-loading" aria-hidden="true">
		{ [ 1, 2, 3, 4 ].map( ( key ) => (
			<div key={ key } className="block-rewind-loading__row">
				<span className="block-rewind-loading__dot" />
				<span className="block-rewind-loading__lines">
					<span />
					<span />
					<span />
				</span>
			</div>
		) ) }
	</div>
);

const describeVersionCount = ( count ) =>
	sprintf(
		/* translators: 1: number of versions, e.g. "4 versions". 2: retention period, e.g. "4 hours". */
		__( '%1$s · kept in this browser for %2$s', 'block-rewind' ),
		count
			? sprintf(
					/* translators: %d: number of versions. */
					_n( '%d version', '%d versions', count, 'block-rewind' ),
					count
			  )
			: __( 'No versions yet', 'block-rewind' ),
		formatRetention( settings.snapshotTtlMs )
	);

// Renders the history of the selected block, or explains why there is none.
const SidebarContent = () => {
	const storageStatus = useSyncExternalStore(
		subscribeToStorageStatus,
		getStorageStatus
	);
	const { selectedBlock, selectedCount, postId } = useSelect( ( select ) => {
		const blockEditor = select( blockEditorStore );
		return {
			selectedBlock: blockEditor.getSelectedBlock(),
			selectedCount: blockEditor.getSelectedBlockClientIds().length,
			postId: select( 'core/editor' ).getCurrentPostId(),
		};
	}, [] );
	const blockId = useTrackedBlockId( selectedBlock );
	const { snapshots, isLoading, error, reload } = useSelectedBlockHistory(
		blockId,
		postId
	);
	const now = useNow();
	const [ comparedSnapshot, setComparedSnapshot ] = useState( null );

	const closeCompare = () => setComparedSnapshot( null );

	const restoreFromCompare = ( snapshot ) => {
		closeCompare();
		// Let the modal unmount before the block changes.
		window.setTimeout( () => {
			restoreSnapshotToEditor( snapshot );
		}, 0 );
	};

	if ( storageStatus === 'unavailable' ) {
		return (
			<div className="block-rewind-sidebar__notice">
				<Notice status="warning" isDismissible={ false }>
					<p>
						<strong>
							{ __(
								'Block history is off in this browser',
								'block-rewind'
							) }
						</strong>
					</p>
					<p>
						{ __(
							'This browser doesn’t let the editor store data. That happens in private windows or when site data is blocked. Your post isn’t affected.',
							'block-rewind'
						) }
					</p>
				</Notice>
			</div>
		);
	}

	if ( selectedCount > 1 ) {
		return (
			<EmptyState title={ __( 'Select a single block', 'block-rewind' ) }>
				{ sprintf(
					/* translators: %d: number of selected blocks. */
					_n(
						'History is shown for one block at a time. You have %d block selected.',
						'History is shown for one block at a time. You have %d blocks selected.',
						selectedCount,
						'block-rewind'
					),
					selectedCount
				) }
			</EmptyState>
		);
	}

	if ( ! selectedBlock ) {
		return (
			<EmptyState
				icon={ <HistoryIcon /> }
				title={ __(
					'Select a block to see its history',
					'block-rewind'
				) }
			>
				{ sprintf(
					/* translators: %s: retention period, e.g. "4 hours". */
					__(
						'Each block keeps its own versions while you edit. They are saved in this browser for %s.',
						'block-rewind'
					),
					formatRetention( settings.snapshotTtlMs )
				) }
			</EmptyState>
		);
	}

	if ( ! blockId ) {
		return (
			<>
				<BlockHeader
					clientId={ selectedBlock.clientId }
					details={ __( 'No versions yet', 'block-rewind' ) }
				/>
				<NestedHistory
					clientId={ selectedBlock.clientId }
					postId={ postId }
				/>
			</>
		);
	}

	const isFirstLoad = isLoading && ! snapshots.length;
	let details = describeVersionCount( snapshots.length );
	if ( isFirstLoad ) {
		details = __( 'Loading versions…', 'block-rewind' );
	} else if ( error ) {
		details = null;
	}

	// Snapshots are newest first, so this is the newest version matching the block;
	// older versions with identical content are not marked. When the block was edited
	// after its latest version, no version is current and a "Now" row says so.
	const currentHash = computeBlockHash( selectedBlock );
	const currentIndex = snapshots.findIndex(
		( snapshot ) => snapshot.hash === currentHash
	);

	let body;
	if ( error ) {
		body = (
			<div className="block-rewind-empty">
				<p className="block-rewind-empty__title">
					{ __(
						'Couldn’t load this block’s history',
						'block-rewind'
					) }
				</p>
				<p className="block-rewind-empty__text">
					{ __(
						'The browser’s storage didn’t respond. Your versions are still there. Try again, or reload the editor if this keeps happening.',
						'block-rewind'
					) }
				</p>
				<Button variant="secondary" size="compact" onClick={ reload }>
					{ __( 'Try again', 'block-rewind' ) }
				</Button>
			</div>
		);
	} else if ( isFirstLoad ) {
		body = <LoadingState />;
	} else {
		body = (
			<VersionTimeline
				snapshots={ snapshots }
				currentIndex={ currentIndex }
				now={ now }
				onCompare={ setComparedSnapshot }
				onRestore={ restoreSnapshotToEditor }
			/>
		);
	}

	return (
		<>
			<BlockHeader
				clientId={ selectedBlock.clientId }
				details={ details }
			/>
			{ body }
			<p className="block-rewind-sidebar__help">
				{ __(
					'Versions are saved about once a minute while you edit.',
					'block-rewind'
				) }
			</p>
			{ comparedSnapshot && (
				<CompareModal
					snapshot={ comparedSnapshot }
					currentBlock={ selectedBlock }
					now={ now }
					onClose={ closeCompare }
					onRestore={ restoreFromCompare }
				/>
			) }
		</>
	);
};

// Registers the Gutenberg sidebar and its toolbar menu item.
export const registerHistorySidebar = () => {
	registerPlugin( 'block-rewind', {
		render: () => (
			<>
				<PluginSidebarMoreMenuItem target="block-rewind-sidebar">
					{ __( 'Block Rewind', 'block-rewind' ) }
				</PluginSidebarMoreMenuItem>
				<PluginSidebar
					name="block-rewind-sidebar"
					title={ __( 'Block Rewind', 'block-rewind' ) }
					icon="backup"
				>
					<SidebarContent />
				</PluginSidebar>
			</>
		),
	} );
};
