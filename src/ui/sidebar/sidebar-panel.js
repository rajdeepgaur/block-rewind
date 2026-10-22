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
	<div className="lehfg-sidebar__empty">{ children }</div>
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
			_n( '%d hour', '%d hours', hours, 'lehfg' ),
			hours
		);
	}

	return sprintf(
		/* translators: %d: number of minutes. */
		_n( '%d minute', '%d minutes', minutes, 'lehfg' ),
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
		isRestore && __( 'Restored', 'lehfg' ),
		isCurrent && __( 'Current', 'lehfg' ),
		isEditedSince && __( 'Edited since', 'lehfg' ),
	]
		.filter( Boolean )
		.join( ' · ' );

	return (
		<PanelBody
			title={ title }
			className={
				isCurrent ? 'lehfg-sidebar__entry--current' : undefined
			}
			initialOpen={ false }
		>
			<p className="lehfg-sidebar__block-type">
				{ getBlockTitle( snapshot.blockName ) }
			</p>
			{ isRestore && (
				<p className="lehfg-sidebar__restored-from">
					{ sprintf(
						/* translators: %s: date and time of the restored version. */
						__( 'Restored from the version of %s.', 'lehfg' ),
						formatSnapshotTimestamp( snapshot.restoredFrom )
					) }
				</p>
			) }
			{ isEditedSince && (
				<p className="lehfg-sidebar__current-note">
					{ __(
						'The block has been edited since this version was saved.',
						'lehfg'
					) }
				</p>
			) }
			{ isCurrent ? (
				<p className="lehfg-sidebar__current-note">
					{ __( 'This is how the block looks now.', 'lehfg' ) }
				</p>
			) : (
				<div className="lehfg-sidebar__actions">
					<Button variant="secondary" onClick={ onPreview }>
						{ __( 'Preview', 'lehfg' ) }
					</Button>
					<Button variant="secondary" onClick={ onRestore }>
						{ __( 'Restore', 'lehfg' ) }
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
					'lehfg'
				) }
			</Notice>
		);
	}

	if ( ! selectedBlock ) {
		return (
			<EmptyState>
				{ __( 'Select a block to see its history.', 'lehfg' ) }
			</EmptyState>
		);
	}

	if ( ! blockId ) {
		return (
			<EmptyState>
				{ __(
					'No history yet. Edit this block to start recording its history.',
					'lehfg'
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
					'lehfg'
				) }
			</EmptyState>
		);
	}

	if ( snapshots.length === 0 ) {
		return (
			<EmptyState>
				{ __( 'No history available for this block.', 'lehfg' ) }
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
			<div className="lehfg-sidebar__history">
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
			<p className="lehfg-sidebar__help">
				{ sprintf(
					/* translators: %s: retention period, e.g. "4 hours". */
					__(
						'Versions are saved automatically about once a minute while you edit, and kept in this browser for %s.',
						'lehfg'
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
	registerPlugin( 'lehfg-sidebar', {
		render: () => (
			<>
				<PluginSidebarMoreMenuItem target="lehfg-sidebar">
					{ __( 'Live Editing History', 'lehfg' ) }
				</PluginSidebarMoreMenuItem>
				<PluginSidebar
					name="lehfg-sidebar"
					title={ __( 'Live Editing History', 'lehfg' ) }
					icon="backup"
				>
					<SidebarContent />
				</PluginSidebar>
			</>
		),
	} );
};
