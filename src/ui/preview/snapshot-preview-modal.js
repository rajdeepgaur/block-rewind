import { Component, useMemo } from '@wordpress/element';
import { Button, Modal, TabPanel } from '@wordpress/components';
import { BlockPreview } from '@wordpress/block-editor';
import { __ } from '@wordpress/i18n';

import './styles.css';

import { generateSemanticDiff } from '../../diff/generateSemanticDiff';
import { reconstructBlockTree } from './reconstruct-block-tree';

const PreviewUnavailable = () => (
	<div>{ __( 'Preview unavailable for this block type.', 'lehfg' ) }</div>
);

class PreviewErrorBoundary extends Component {
	constructor( props ) {
		super( props );
		this.state = { hasError: false };
	}

	static getDerivedStateFromError() {
		return { hasError: true };
	}

	render() {
		if ( this.state.hasError ) {
			return <PreviewUnavailable />;
		}

		return this.props.children;
	}
}

const PreviewPane = ( { title, blockData, className = '' } ) => {
	const blocks = useMemo(
		() => reconstructBlockTree( blockData ),
		[ blockData ]
	);

	if ( ! blocks.length ) {
		return <PreviewUnavailable />;
	}

	return (
		<div className={ `lehfg-preview-modal__panel ${ className }`.trim() }>
			<h3 className="lehfg-preview-modal__heading">{ title }</h3>
			<div className="lehfg-preview-modal__viewport">
				<PreviewErrorBoundary>
					<BlockPreview blocks={ blocks } />
				</PreviewErrorBoundary>
			</div>
		</div>
	);
};

const ATTRIBUTE_LABELS = {
	align: __( 'Alignment', 'lehfg' ),
	backgroundColor: __( 'Background color', 'lehfg' ),
	textColor: __( 'Text color', 'lehfg' ),
	content: __( 'Text content', 'lehfg' ),
	title: __( 'Title text', 'lehfg' ),
	caption: __( 'Caption text', 'lehfg' ),
	label: __( 'Label text', 'lehfg' ),
	placeholder: __( 'Placeholder text', 'lehfg' ),
};

const humanizeAttributePath = ( path ) => {
	const leafKey = path.split( '.' ).pop();

	if ( ATTRIBUTE_LABELS[ leafKey ] ) {
		return ATTRIBUTE_LABELS[ leafKey ];
	}

	return leafKey
		.replace( /([a-z0-9])([A-Z])/g, '$1 $2' )
		.replace( /_/g, ' ' )
		.replace( /^./, ( character ) => character.toUpperCase() );
};

const ChangeSummary = ( { diff } ) => {
	if ( ! diff?.hasChanges ) {
		return null;
	}

	const summaryItems = [];

	if ( diff.blockTypeChanged ) {
		summaryItems.push( __( 'Block type', 'lehfg' ) );
	}

	if ( diff.textChanged ) {
		summaryItems.push( __( 'Text content', 'lehfg' ) );
	}

	diff.attributesChanged.forEach( ( path ) => {
		const label = humanizeAttributePath( path );
		if ( ! summaryItems.includes( label ) ) {
			summaryItems.push( label );
		}
	} );

	if ( diff.innerBlocksChanged ) {
		summaryItems.push( __( 'Nested content', 'lehfg' ) );
	}

	return (
		<div className="lehfg-preview-modal__summary">
			<div className="lehfg-preview-modal__summary-title">
				{ __( 'Changed:', 'lehfg' ) }
			</div>
			<ul className="lehfg-preview-modal__summary-list">
				{ summaryItems.map( ( item ) => (
					<li key={ item }>{ item }</li>
				) ) }
			</ul>
		</div>
	);
};

// Renders the snapshot comparison modal.
export const SnapshotPreviewModal = ( {
	isOpen,
	onRequestClose,
	onRestore,
	currentBlock,
	snapshot,
} ) => {
	const semanticDiff = useMemo(
		() =>
			isOpen && snapshot
				? generateSemanticDiff( currentBlock, snapshot )
				: null,
		[ currentBlock, isOpen, snapshot ]
	);

	if ( ! isOpen || ! snapshot ) {
		return null;
	}

	return (
		<Modal
			title={ __( 'Snapshot Preview', 'lehfg' ) }
			onRequestClose={ onRequestClose }
			size="large"
			className="lehfg-preview-modal"
			shouldCloseOnClickOutside
		>
			<ChangeSummary diff={ semanticDiff } />
			<TabPanel
				className="lehfg-preview-modal__tabs"
				activeClass="lehfg-preview-modal__tab--active"
				initialTabName="current-block"
				tabs={ [
					{
						name: 'current-block',
						title: __( 'Current Block', 'lehfg' ),
					},
					{
						name: 'snapshot-version',
						title: __( 'Snapshot Version', 'lehfg' ),
					},
				] }
			>
				{ ( tab ) => (
					<div className="lehfg-preview-modal__content">
						{ tab.name === 'current-block' ? (
							<PreviewPane
								title={ __( 'Current Block', 'lehfg' ) }
								blockData={ currentBlock }
								className={
									semanticDiff?.hasChanges
										? 'lehfg-preview-modal__panel--current'
										: ''
								}
							/>
						) : (
							<PreviewPane
								title={ __( 'Snapshot Version', 'lehfg' ) }
								blockData={ snapshot }
								className={
									semanticDiff?.hasChanges
										? 'lehfg-preview-modal__panel--snapshot'
										: ''
								}
							/>
						) }
					</div>
				) }
			</TabPanel>
			<div className="lehfg-preview-modal__footer">
				<Button variant="tertiary" onClick={ onRequestClose }>
					{ __( 'Close', 'lehfg' ) }
				</Button>
				<Button
					variant="primary"
					onClick={ () => onRestore( snapshot ) }
				>
					{ __( 'Restore this version', 'lehfg' ) }
				</Button>
			</div>
		</Modal>
	);
};
