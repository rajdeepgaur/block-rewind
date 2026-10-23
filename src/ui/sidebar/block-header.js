import { BlockIcon, useBlockDisplayInformation } from '@wordpress/block-editor';

// Names the selected block (as the editor shows it, e.g. "Row" for a flex group)
// above its history, with a line of details such as the number of versions.
export const BlockHeader = ( { clientId, details } ) => {
	const blockInformation = useBlockDisplayInformation( clientId );

	return (
		<div className="block-rewind-block-header">
			<BlockIcon icon={ blockInformation?.icon } showColors />
			<div className="block-rewind-block-header__text">
				<h3 className="block-rewind-block-header__title">
					{ blockInformation?.title }
				</h3>
				{ details && (
					<p className="block-rewind-block-header__details">
						{ details }
					</p>
				) }
			</div>
		</div>
	);
};
