import { Button, PanelBody, Spinner } from '@wordpress/components';
import { dispatch, useSelect } from '@wordpress/data';
import { PluginSidebar, PluginSidebarMoreMenuItem } from '@wordpress/editor';
import { __ } from '@wordpress/i18n';
import { useState } from '@wordpress/element';
import { registerPlugin } from '@wordpress/plugins';

import { getTrackedBlockId } from '../../identity/block-identity';
import { restoreSnapshotToEditor } from '../../restore/restore-snapshot';
import { computeBlockHash } from '../../serialization/serialize-block';
import { useSelectedBlockHistory } from './use-selected-block-history';
import { SnapshotPreviewModal } from '../preview/snapshot-preview-modal';
import { formatSnapshotTimestamp } from '../../utils/format-snapshot-timestamp';

// Renders the sidebar contents for the selected block history.
const SidebarContent = () => {
	const selectedBlock = useSelect(
		( select ) => select( 'core/block-editor' ).getSelectedBlock(),
		[]
	);
	const postId = useSelect(
		( select ) => select( 'core/editor' ).getCurrentPostId(),
		[]
	);
	const { snapshots, isLoading, error } = useSelectedBlockHistory(
		selectedBlock,
		postId
	);
	const blockId = getTrackedBlockId( selectedBlock );
	const [ activePreviewSnapshot, setActivePreviewSnapshot ] =
		useState( null );

	const handlePreviewSnapshot = ( snapshot ) => {
		if ( ! selectedBlock ) {
			return;
		}

		if ( computeBlockHash( selectedBlock ) === snapshot.hash ) {
			dispatch( 'core/notices' ).createNotice(
				'info',
				'This snapshot already matches the current block.',
				{
					dismissible: true,
				}
			);
			return;
		}

		setActivePreviewSnapshot( snapshot );
	};

	const closePreviewModal = () => setActivePreviewSnapshot( null );

	const handleRestoreSnapshot = ( snapshot ) => {
		closePreviewModal();
		window.setTimeout( () => {
			restoreSnapshotToEditor( snapshot );
		}, 0 );
	};

	if ( ! selectedBlock ) {
		return (
			<div className="lehfg-sidebar__empty">
				{ __( 'No block selected', 'lehfg' ) }
			</div>
		);
	}

	if ( ! blockId ) {
		return (
			<div className="lehfg-sidebar__empty">
				{ __(
					'No history yet. Edit this block to start recording its history.',
					'lehfg'
				) }
			</div>
		);
	}

	if ( isLoading ) {
		return <Spinner />;
	}

	if ( error ) {
		return (
			<div className="lehfg-sidebar__empty">
				{ __( 'No history available for this block', 'lehfg' ) }
			</div>
		);
	}

	if ( snapshots.length === 0 ) {
		return (
			<div className="lehfg-sidebar__empty">
				{ __( 'No history available for this block', 'lehfg' ) }
			</div>
		);
	}

	return (
		<>
			<div className="lehfg-sidebar__history">
				{ snapshots.map( ( snapshot ) => (
					<PanelBody
						key={ snapshot.snapshotId }
						title={ formatSnapshotTimestamp( snapshot.timestamp ) }
						initialOpen={ false }
					>
						<p>{ snapshot.blockName }</p>
						<div>
							<Button
								variant="secondary"
								onClick={ () =>
									handlePreviewSnapshot( snapshot )
								}
								style={ { marginRight: '4px' } }
							>
								{ __( 'Preview', 'lehfg' ) }
							</Button>
							<Button
								variant="secondary"
								onClick={ () =>
									restoreSnapshotToEditor( snapshot )
								}
							>
								{ __( 'Restore', 'lehfg' ) }
							</Button>
						</div>
					</PanelBody>
				) ) }
			</div>
			<SnapshotPreviewModal
				isOpen={ Boolean( activePreviewSnapshot ) }
				onRequestClose={ closePreviewModal }
				onRestore={ handleRestoreSnapshot }
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
