import { forwardRef } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';

import { getAttributeGroup, getBlockTitle } from '../change-labels';
import { TextDiff } from './text-changes';

const describeNestedChange = ( change ) => {
	if ( ! change.fromName ) {
		return __( 'Comes back if you restore', 'block-rewind' );
	}

	if ( ! change.toName ) {
		return __( 'Removed if you restore', 'block-rewind' );
	}

	const labels = Array.from(
		new Set(
			change.attributes.map( ( path ) => getAttributeGroup( path ).label )
		)
	);

	if ( change.fromName !== change.toName ) {
		labels.unshift(
			sprintf(
				/* translators: %s: block type, e.g. "Heading". */
				__( 'Becomes a %s', 'block-rewind' ),
				getBlockTitle( change.toName )
			)
		);
	}

	if ( change.text?.formattingOnly ) {
		labels.push( __( 'Text formatting', 'block-rewind' ) );
	}

	return labels.join( ', ' );
};

/**
 * Lists the nested blocks that restoring changes, with their text changes.
 *
 * @param {Object} props
 * @param {Object} props.innerBlocks `innerBlocks` from describeChanges().
 */
export const NestedChanges = forwardRef( ( { innerBlocks }, ref ) => {
	const count = Math.max( innerBlocks.fromCount, innerBlocks.toCount );

	return (
		<section className="block-rewind-nested-changes" ref={ ref }>
			<h3 className="block-rewind-nested-changes__title">
				{ __( 'Nested blocks that change', 'block-rewind' ) }
			</h3>
			<ul className="block-rewind-nested-changes__list">
				{ innerBlocks.changed.map( ( change ) => {
					const summary = describeNestedChange( change );
					const hasWords =
						change.text && ! change.text.formattingOnly;

					return (
						<li key={ change.index }>
							<span className="block-rewind-nested-changes__name">
								{ sprintf(
									/* translators: 1: block type, e.g. "Paragraph". 2: position. 3: number of nested blocks. */
									__( '%1$s %2$d of %3$d', 'block-rewind' ),
									getBlockTitle(
										change.fromName || change.toName
									),
									change.index + 1,
									count
								) }
							</span>
							<span className="block-rewind-nested-changes__detail">
								{ hasWords && (
									<TextDiff
										segments={ change.text.segments }
										contextWords={ 6 }
									/>
								) }
								{ summary && (
									<span className="block-rewind-nested-changes__summary">
										{ summary }
									</span>
								) }
							</span>
						</li>
					);
				} ) }
			</ul>
		</section>
	);
} );
