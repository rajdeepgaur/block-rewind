import { BlockPreview } from '@wordpress/block-editor';
import { createBlock } from '@wordpress/blocks';
import { useViewportMatch } from '@wordpress/compose';
import { Component, useMemo } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

// Width the content is laid out at before being scaled to the pane, when the theme
// sets no content width.
const DEFAULT_VIEWPORT_WIDTH = 720;
// Room around the content, like the editor canvas padding.
const VIEWPORT_PADDING = 64;
// On phones the content is laid out at phone width, so text stays readable.
const SMALL_SCREEN_VIEWPORT_WIDTH = 400;

// Rebuilds a block tree from editor block data or a stored snapshot.
const buildBlock = ( node ) => {
	const blockName = node?.blockName || node?.name;
	if ( ! blockName ) {
		return null;
	}

	try {
		return createBlock(
			blockName,
			node.attributes || {},
			( node.innerBlocks || [] ).map( buildBlock ).filter( Boolean )
		);
	} catch ( error ) {
		return null;
	}
};

const PreviewUnavailable = () => (
	<p className="block-rewind-preview__unavailable">
		{ __( 'A preview isn’t available for this block.', 'block-rewind' ) }
	</p>
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

/**
 * Renders a read-only preview of a block state, laid out at the theme's content
 * width so text has the same size whatever the window width (phone width on phones).
 *
 * @param {Object} props
 * @param {Object} props.blockData   Editor block or stored snapshot.
 * @param {string} props.contentSize Theme content width, e.g. "645px".
 */
export const VersionPreview = ( { blockData, contentSize } ) => {
	const isSmallScreen = useViewportMatch( 'small', '<' );
	const blocks = useMemo( () => {
		const block = buildBlock( blockData );
		return block ? [ block ] : [];
	}, [ blockData ] );

	const viewportWidth = isSmallScreen
		? SMALL_SCREEN_VIEWPORT_WIDTH
		: ( parseInt( contentSize, 10 ) || DEFAULT_VIEWPORT_WIDTH ) +
		  VIEWPORT_PADDING;

	if ( ! blocks.length ) {
		return <PreviewUnavailable />;
	}

	return (
		<div className="block-rewind-preview">
			<PreviewErrorBoundary>
				<BlockPreview
					blocks={ blocks }
					viewportWidth={ viewportWidth }
				/>
			</PreviewErrorBoundary>
		</div>
	);
};
