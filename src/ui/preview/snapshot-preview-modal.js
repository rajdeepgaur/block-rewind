import { Component } from '@wordpress/element';
import { Modal } from '@wordpress/components';
import { BlockPreview } from '@wordpress/block-editor';

import './styles.css';

import { reconstructBlockTree } from './reconstruct-block-tree';

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
			return <div>Preview unavailable for this block type.</div>;
		}

		return this.props.children;
	}
}

const PreviewPane = ( { title, blockData } ) => {
	const blocks = reconstructBlockTree( blockData );

	if ( ! blocks.length ) {
		return <div>Preview unavailable for this block type.</div>;
	}

	return (
		<div className="lehfg-preview-modal__panel">
			<h3>{ title }</h3>
			<div className="lehfg-preview-modal__viewport">
				<PreviewErrorBoundary>
					<BlockPreview blocks={ blocks } />
				</PreviewErrorBoundary>
			</div>
		</div>
	);
};

// Renders the snapshot comparison modal.
export const SnapshotPreviewModal = ( { isOpen, onRequestClose, currentBlock, snapshot } ) => {
	if ( ! isOpen || ! snapshot ) {
		return null;
	}

	return (
		<Modal
			title="Snapshot Preview"
			onRequestClose={ onRequestClose }
			size="large"
			className="lehfg-preview-modal"
			shouldCloseOnClickOutside
		>
			<div className="lehfg-preview-modal__grid">
				<PreviewPane title="Current Block" blockData={ currentBlock } />
				<PreviewPane title="Snapshot Version" blockData={ snapshot } />
			</div>
		</Modal>
	);
};
