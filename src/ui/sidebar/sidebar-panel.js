import { Button, PanelBody, Spinner } from '@wordpress/components';
import { dispatch, useSelect } from '@wordpress/data';
import { PluginSidebar, PluginSidebarMoreMenuItem } from '@wordpress/editor';
import { __ } from '@wordpress/i18n';
import { useState } from '@wordpress/element';
import { registerPlugin } from '@wordpress/plugins';

import { getLehfgBlockId } from '../../identity/block-identity';
import { restoreSnapshotToEditor } from '../../restore/restore-snapshot';
import { computeSerializedHash, serializeBlockState } from '../../serialization/serialize-block';
import { useSelectedBlockHistory } from './use-selected-block-history';
import { SnapshotPreviewModal } from '../preview/snapshot-preview-modal';

// Formats a snapshot timestamp for the history list.
const formatSnapshotTime = ( timestamp ) => new Date( timestamp ).toLocaleString();

// Renders the sidebar contents for the selected block history.
const SidebarContent = () => {
	const selectedBlock = useSelect( ( select ) => select( 'core/block-editor' ).getSelectedBlock(), [] );
	const postId = useSelect( ( select ) => select( 'core/editor' ).getCurrentPostId(), [] );
	const { snapshots, isLoading, error } = useSelectedBlockHistory( selectedBlock, postId );
	const blockId = getLehfgBlockId( selectedBlock );
	const [ activePreviewSnapshot, setActivePreviewSnapshot ] = useState( null );

	const handlePreviewSnapshot = ( snapshot ) => {
		if ( ! selectedBlock ) {
			return;
		}

		const currentHash = computeSerializedHash( serializeBlockState( selectedBlock ) );

		if ( currentHash === snapshot.hash ) {
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

	if ( ! selectedBlock ) {
		return <div className="lehfg-sidebar__empty">{ __( 'No block selected', 'lehfg' ) }</div>;
	}

	if ( ! blockId ) {
		return <div className="lehfg-sidebar__empty">{ __( 'No history available for this block', 'lehfg' ) }</div>;
	}

	if ( isLoading ) {
		return <Spinner />;
	}

	if ( error ) {
		return <div className="lehfg-sidebar__empty">{ __( 'No history available for this block', 'lehfg' ) }</div>;
	}

	if ( snapshots.length === 0 ) {
		return <div className="lehfg-sidebar__empty">{ __( 'No history available for this block', 'lehfg' ) }</div>;
	}

	return (
		<>
			<div className="lehfg-sidebar__history">
				{ snapshots.map( ( snapshot ) => (
					<PanelBody
						key={ snapshot.snapshotId }
						title={ formatSnapshotTime( snapshot.timestamp ) }
						initialOpen={ false }
					>
						<p>{ snapshot.blockName }</p>
						<div>
							<Button
								variant="secondary"
								onClick={ () => handlePreviewSnapshot( snapshot ) }
							>
								{ __( 'Preview', 'lehfg' ) }
							</Button>
							<Button
								variant="secondary"
								onClick={ () => restoreSnapshotToEditor( snapshot ) }
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
				<PluginSidebar name="lehfg-sidebar" title={ __( 'Live Editing History', 'lehfg' ) } icon="backup">
					<SidebarContent />
				</PluginSidebar>
			</>
		),
	} );
};
