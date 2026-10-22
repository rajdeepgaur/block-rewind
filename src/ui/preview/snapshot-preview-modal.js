import { Component, useMemo } from '@wordpress/element';
import { Button, Modal, TabPanel } from '@wordpress/components';
import { BlockPreview } from '@wordpress/block-editor';
import { __ } from '@wordpress/i18n';

import './styles.css';

import { generateSemanticDiff } from '../../diff/generateSemanticDiff';
import { reconstructBlockTree } from './reconstruct-block-tree';

const PreviewUnavailable = () => (
	<div>
		{ __( 'Preview unavailable for this block type.', 'block-rewind' ) }
	</div>
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
		<div
			className={ `block-rewind-preview-modal__panel ${ className }`.trim() }
		>
			<h3 className="block-rewind-preview-modal__heading">{ title }</h3>
			<div className="block-rewind-preview-modal__viewport">
				<PreviewErrorBoundary>
					<BlockPreview blocks={ blocks } />
				</PreviewErrorBoundary>
			</div>
		</div>
	);
};

const ATTRIBUTE_LABELS = {
	align: __( 'Alignment', 'block-rewind' ),
	backgroundColor: __( 'Background color', 'block-rewind' ),
	textColor: __( 'Text color', 'block-rewind' ),
	content: __( 'Text content', 'block-rewind' ),
	title: __( 'Title text', 'block-rewind' ),
	caption: __( 'Caption text', 'block-rewind' ),
	label: __( 'Label text', 'block-rewind' ),
	placeholder: __( 'Placeholder text', 'block-rewind' ),
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
	if ( ! diff ) {
		return null;
	}

	if ( ! diff.hasChanges ) {
		return (
			<div className="block-rewind-preview-modal__summary">
				{ __(
					'This version is identical to the current block.',
					'block-rewind'
				) }
			</div>
		);
	}

	const summaryItems = [];

	if ( diff.blockTypeChanged ) {
		summaryItems.push( __( 'Block type', 'block-rewind' ) );
	}

	if ( diff.textChanged ) {
		summaryItems.push( __( 'Text content', 'block-rewind' ) );
	}

	diff.attributesChanged.forEach( ( path ) => {
		const label = humanizeAttributePath( path );
		if ( ! summaryItems.includes( label ) ) {
			summaryItems.push( label );
		}
	} );

	if ( diff.innerBlocksChanged ) {
		summaryItems.push( __( 'Nested content', 'block-rewind' ) );
	}

	return (
		<div className="block-rewind-preview-modal__summary">
			<div className="block-rewind-preview-modal__summary-title">
				{ __( 'Changed:', 'block-rewind' ) }
			</div>
			<ul className="block-rewind-preview-modal__summary-list">
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
			title={ __( 'Snapshot Preview', 'block-rewind' ) }
			onRequestClose={ onRequestClose }
			size="large"
			className="block-rewind-preview-modal"
			shouldCloseOnClickOutside
		>
			<ChangeSummary diff={ semanticDiff } />
			<TabPanel
				className="block-rewind-preview-modal__tabs"
				activeClass="block-rewind-preview-modal__tab--active"
				initialTabName="current-block"
				tabs={ [
					{
						name: 'current-block',
						title: __( 'Current Block', 'block-rewind' ),
					},
					{
						name: 'snapshot-version',
						title: __( 'Snapshot Version', 'block-rewind' ),
					},
				] }
			>
				{ ( tab ) => (
					<div className="block-rewind-preview-modal__content">
						{ tab.name === 'current-block' ? (
							<PreviewPane
								title={ __( 'Current Block', 'block-rewind' ) }
								blockData={ currentBlock }
								className={
									semanticDiff?.hasChanges
										? 'block-rewind-preview-modal__panel--current'
										: ''
								}
							/>
						) : (
							<PreviewPane
								title={ __(
									'Snapshot Version',
									'block-rewind'
								) }
								blockData={ snapshot }
								className={
									semanticDiff?.hasChanges
										? 'block-rewind-preview-modal__panel--snapshot'
										: ''
								}
							/>
						) }
					</div>
				) }
			</TabPanel>
			<div className="block-rewind-preview-modal__footer">
				<Button variant="tertiary" onClick={ onRequestClose }>
					{ __( 'Close', 'block-rewind' ) }
				</Button>
				<Button
					variant="primary"
					onClick={ () => onRestore( snapshot ) }
				>
					{ __( 'Restore this version', 'block-rewind' ) }
				</Button>
			</div>
		</Modal>
	);
};
