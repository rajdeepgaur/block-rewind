import { Button, PanelBody, Spinner } from '@wordpress/components';
import { useSelect } from '@wordpress/data';
import { PluginSidebar, PluginSidebarMoreMenuItem } from '@wordpress/editor';
import { __ } from '@wordpress/i18n';
import { registerPlugin } from '@wordpress/plugins';

import { getLehfgBlockId } from '../../identity/block-identity';
import { restoreSnapshotToEditor } from '../../restore/restore-snapshot';
import { useSelectedBlockHistory } from './use-selected-block-history';

// Formats a snapshot timestamp for the history list.
const formatSnapshotTime = ( timestamp ) => new Date( timestamp ).toLocaleString();

// Renders the sidebar contents for the selected block history.
const SidebarContent = () => {
	const selectedBlock = useSelect( ( select ) => select( 'core/block-editor' ).getSelectedBlock(), [] );
	const postId = useSelect( ( select ) => select( 'core/editor' ).getCurrentPostId(), [] );
	const { snapshots, isLoading, error } = useSelectedBlockHistory( selectedBlock, postId );
	const blockId = getLehfgBlockId( selectedBlock );

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
		<div className="lehfg-sidebar__history">
			{ snapshots.map( ( snapshot ) => (
				<PanelBody
					key={ snapshot.snapshotId }
					title={ formatSnapshotTime( snapshot.timestamp ) }
					initialOpen={ false }
				>
					<p>{ snapshot.blockName }</p>
					<Button
						variant="secondary"
						onClick={ () => restoreSnapshotToEditor( snapshot ) }
					>
						{ __( 'Restore', 'lehfg' ) }
					</Button>
				</PanelBody>
			) ) }
		</div>
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
