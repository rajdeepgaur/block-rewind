import { getBlockType } from '@wordpress/blocks';
import { Button, Notice, PanelBody, Spinner } from '@wordpress/components';
import { useSelect } from '@wordpress/data';
import { PluginSidebar, PluginSidebarMoreMenuItem } from '@wordpress/editor';
import { __, _n, sprintf } from '@wordpress/i18n';
import { useState, useSyncExternalStore } from '@wordpress/element';
import { registerPlugin } from '@wordpress/plugins';

import { restoreSnapshotToEditor } from '../../restore/restore-snapshot';
import { computeBlockHash } from '../../serialization/serialize-block';
import { settings } from '../../settings';
import {
	getStorageStatus,
	subscribeToStorageStatus,
} from '../../state/storage-status';
import { useSelectedBlockHistory } from './use-selected-block-history';
import { useTrackedBlockId } from './use-tracked-block-id';
import { SnapshotPreviewModal } from '../preview/snapshot-preview-modal';
import { formatSnapshotTimestamp } from '../../utils/format-snapshot-timestamp';

const EmptyState = ( { children } ) => (
	<div className="block-rewind-sidebar__empty">{ children }</div>
);

const getBlockTitle = ( blockName ) =>
	getBlockType( blockName )?.title || blockName;

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

// Renders one saved version with its preview and restore actions.
const SnapshotItem = ( {
	snapshot,
	isCurrent,
	isEditedSince,
	onPreview,
	onRestore,
} ) => {
	const isRestore = Boolean( snapshot.restoredFrom );
	const title = [
		formatSnapshotTimestamp( snapshot.timestamp ),
		isRestore && __( 'Restored', 'block-rewind' ),
		isCurrent && __( 'Current', 'block-rewind' ),
		isEditedSince && __( 'Edited since', 'block-rewind' ),
	]
		.filter( Boolean )
		.join( ' · ' );

	return (
		<PanelBody
			title={ title }
			className={
				isCurrent ? 'block-rewind-sidebar__entry--current' : undefined
			}
			initialOpen={ false }
		>
			<p className="block-rewind-sidebar__block-type">
				{ getBlockTitle( snapshot.blockName ) }
			</p>
			{ isRestore && (
				<p className="block-rewind-sidebar__restored-from">
					{ sprintf(
						/* translators: %s: date and time of the restored version. */
						__(
							'Restored from the version of %s.',
							'block-rewind'
						),
						formatSnapshotTimestamp( snapshot.restoredFrom )
					) }
				</p>
			) }
			{ isEditedSince && (
				<p className="block-rewind-sidebar__current-note">
					{ __(
						'The block has been edited since this version was saved.',
						'block-rewind'
					) }
				</p>
			) }
			{ isCurrent ? (
				<p className="block-rewind-sidebar__current-note">
					{ __( 'This is how the block looks now.', 'block-rewind' ) }
				</p>
			) : (
				<div className="block-rewind-sidebar__actions">
					<Button variant="secondary" onClick={ onPreview }>
						{ __( 'Preview', 'block-rewind' ) }
					</Button>
					<Button variant="secondary" onClick={ onRestore }>
						{ __( 'Restore', 'block-rewind' ) }
					</Button>
				</div>
			) }
		</PanelBody>
	);
};

// Renders the sidebar contents for the selected block history.
const SidebarContent = () => {
	const storageStatus = useSyncExternalStore(
		subscribeToStorageStatus,
		getStorageStatus
	);
	const selectedBlock = useSelect(
		( select ) => select( 'core/block-editor' ).getSelectedBlock(),
		[]
	);
	const postId = useSelect(
		( select ) => select( 'core/editor' ).getCurrentPostId(),
		[]
	);
	const blockId = useTrackedBlockId( selectedBlock );
	const { snapshots, isLoading, error } = useSelectedBlockHistory(
		blockId,
		postId
	);
	const [ activePreviewSnapshot, setActivePreviewSnapshot ] =
		useState( null );

	const closePreviewModal = () => setActivePreviewSnapshot( null );

	const handleRestoreFromPreview = ( snapshot ) => {
		closePreviewModal();
		// Let the modal unmount before the block changes.
		window.setTimeout( () => {
			restoreSnapshotToEditor( snapshot );
		}, 0 );
	};

	if ( storageStatus === 'unavailable' ) {
		return (
			<Notice status="warning" isDismissible={ false }>
				{ __(
					'Block history is unavailable because this browser does not allow the editor to store data (IndexedDB). This can happen in private browsing windows or when site data is blocked.',
					'block-rewind'
				) }
			</Notice>
		);
	}

	if ( ! selectedBlock ) {
		return (
			<EmptyState>
				{ __( 'Select a block to see its history.', 'block-rewind' ) }
			</EmptyState>
		);
	}

	if ( ! blockId ) {
		return (
			<EmptyState>
				{ __(
					'No history yet. Edit this block to start recording its history.',
					'block-rewind'
				) }
			</EmptyState>
		);
	}

	if ( isLoading && ! snapshots.length ) {
		return <Spinner />;
	}

	if ( error ) {
		return (
			<EmptyState>
				{ __(
					'The history of this block could not be loaded.',
					'block-rewind'
				) }
			</EmptyState>
		);
	}

	if ( snapshots.length === 0 ) {
		return (
			<EmptyState>
				{ __(
					'No versions saved yet. Versions are saved about once a minute while you edit.',
					'block-rewind'
				) }
			</EmptyState>
		);
	}

	// Snapshots are newest first, so this is the newest version matching the block;
	// older versions with identical content are not marked. When the block was edited
	// after its latest version, no version is current and the latest says so.
	const currentHash = computeBlockHash( selectedBlock );
	const currentIndex = snapshots.findIndex(
		( snapshot ) => snapshot.hash === currentHash
	);

	return (
		<>
			<div className="block-rewind-sidebar__history">
				{ snapshots.map( ( snapshot, index ) => (
					<SnapshotItem
						key={ snapshot.snapshotId }
						snapshot={ snapshot }
						isCurrent={ index === currentIndex }
						isEditedSince={ currentIndex === -1 && index === 0 }
						onPreview={ () => setActivePreviewSnapshot( snapshot ) }
						onRestore={ () => restoreSnapshotToEditor( snapshot ) }
					/>
				) ) }
			</div>
			<p className="block-rewind-sidebar__help">
				{ sprintf(
					/* translators: %s: retention period, e.g. "4 hours". */
					__(
						'Versions are saved automatically about once a minute while you edit, and kept in this browser for %s.',
						'block-rewind'
					),
					formatRetention( settings.snapshotTtlMs )
				) }
			</p>
			<SnapshotPreviewModal
				isOpen={ Boolean( activePreviewSnapshot ) }
				onRequestClose={ closePreviewModal }
				onRestore={ handleRestoreFromPreview }
				currentBlock={ selectedBlock }
				snapshot={ activePreviewSnapshot }
			/>
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
