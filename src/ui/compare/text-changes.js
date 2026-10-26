import { Button } from '@wordpress/components';
import { useState } from '@wordpress/element';
import { __, _n, sprintf } from '@wordpress/i18n';

import { collapseUnchanged } from '../../diff/diff-words';

// Words of unchanged text kept on each side of a change when text is shortened.
const CONTEXT_WORDS = 10;

/**
 * Shows a word diff: text that restoring removes is struck through, text that it
 * brings back is underlined. Long unchanged runs collapse to buttons that show
 * that run in full.
 *
 * @param {Object}   props
 * @param {Object[]} props.segments     Segments from diffText( now, version ).
 * @param {number}   props.contextWords Words kept next to each change.
 */
export const TextDiff = ( { segments, contextWords = CONTEXT_WORDS } ) => {
	const [ expanded, setExpanded ] = useState( () => new Set() );
	const shown = collapseUnchanged( segments, contextWords, expanded );

	return (
		<div className="block-rewind-text-diff">
			{ shown.map( ( segment, index ) => {
				if ( segment.type === 'gap' ) {
					return (
						<Button
							key={ index }
							className="block-rewind-text-diff__gap"
							size="small"
							onClick={ () =>
								setExpanded(
									new Set( expanded ).add( segment.index )
								)
							}
						>
							{ sprintf(
								/* translators: %d: number of words. */
								_n(
									'%d unchanged word',
									'%d unchanged words',
									segment.words,
									'block-rewind'
								),
								segment.words
							) }
						</Button>
					);
				}

				if ( segment.type === 'removed' ) {
					return (
						<del
							key={ index }
							className="block-rewind-text-diff__removed"
						>
							{ segment.text }
						</del>
					);
				}

				if ( segment.type === 'added' ) {
					return (
						<ins
							key={ index }
							className="block-rewind-text-diff__added"
						>
							{ segment.text }
						</ins>
					);
				}

				return <span key={ index }>{ segment.text }</span>;
			} ) }
		</div>
	);
};

// Explains how removed and returning text is marked.
export const TextDiffLegend = () => (
	<ul className="block-rewind-text-diff__legend">
		<li>
			<ins className="block-rewind-text-diff__added" aria-hidden="true">
				abc
			</ins>
			{ __( 'Comes back if you restore', 'block-rewind' ) }
		</li>
		<li>
			<del className="block-rewind-text-diff__removed" aria-hidden="true">
				abc
			</del>
			{ __( 'Removed if you restore', 'block-rewind' ) }
		</li>
	</ul>
);
