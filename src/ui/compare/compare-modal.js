import { Button, Modal } from '@wordpress/components';
import { useInstanceId, useViewportMatch } from '@wordpress/compose';
import { useEffect, useMemo, useRef, useState } from '@wordpress/element';
import { __, _n, sprintf } from '@wordpress/i18n';

import './styles.css';

import { describeChanges } from '../../diff/describe-changes';
import {
	formatRelativeTime,
	formatShortTime,
	formatSnapshotTimestamp,
} from '../../utils/format-snapshot-timestamp';
import { getBlockTitle, getChangeRows } from '../change-labels';
import { useEditorPresets } from '../use-editor-presets';
import { ChangeTable } from './change-table';
import { NestedChanges } from './nested-changes';
import { TextDiff, TextDiffLegend } from './text-changes';
import { VersionPreview } from './version-preview';

// Warns that restoring also changes blocks inside, e.g. "Also changes 2 blocks
// inside: Paragraph, Image."
const getNestedWarning = ( innerBlocks ) => {
	const changed = innerBlocks?.changed || [];
	if ( ! changed.length ) {
		return null;
	}

	const titles = Array.from(
		new Set(
			changed.map( ( change ) =>
				getBlockTitle( change.fromName || change.toName )
			)
		)
	);

	return sprintf(
		/* translators: 1: number of nested blocks. 2: comma-separated block types, e.g. "Paragraph, Image". */
		_n(
			'Also changes %1$d block inside: %2$s.',
			'Also changes %1$d blocks inside: %2$s.',
			changed.length,
			'block-rewind'
		),
		changed.length,
		titles.join( ', ' )
	);
};

const getModalTitle = ( snapshot, now ) => {
	if ( snapshot.isBaseline ) {
		return __( 'Version from before editing', 'block-rewind' );
	}

	if ( now - snapshot.timestamp < 60 * 1000 ) {
		return __( 'Version from just now', 'block-rewind' );
	}

	return sprintf(
		/* translators: %s: how long ago the version was saved, e.g. "2 min ago". */
		__( 'Version from %s', 'block-rewind' ),
		formatRelativeTime( snapshot.timestamp, now )
	);
};

// Tabs for the comparison views; arrow keys move between tabs.
const ViewTabs = ( { tabs, selected, onSelect, idPrefix } ) => {
	const onKeyDown = ( event ) => {
		const offset = { ArrowRight: 1, ArrowLeft: -1 }[ event.key ];

		if ( ! offset ) {
			return;
		}

		event.preventDefault();
		const index = tabs.findIndex( ( tab ) => tab.name === selected );
		const next = tabs[ ( index + offset + tabs.length ) % tabs.length ];
		onSelect( next.name );
		event.currentTarget.ownerDocument
			.getElementById( `${ idPrefix }-tab-${ next.name }` )
			?.focus();
	};

	return (
		<div
			className="block-rewind-compare__tabs"
			role="tablist"
			aria-label={ __( 'Comparison view', 'block-rewind' ) }
		>
			{ tabs.map( ( tab ) => (
				<button
					key={ tab.name }
					id={ `${ idPrefix }-tab-${ tab.name }` }
					type="button"
					role="tab"
					aria-selected={ tab.name === selected }
					aria-controls={ `${ idPrefix }-panel` }
					tabIndex={ tab.name === selected ? 0 : -1 }
					className="block-rewind-compare__tab"
					onClick={ () => onSelect( tab.name ) }
					onKeyDown={ onKeyDown }
				>
					{ tab.title }
				</button>
			) ) }
		</div>
	);
};

const Pane = ( { title, blockData, contentSize } ) => (
	<div className="block-rewind-compare__pane">
		<h2 className="block-rewind-compare__pane-title">{ title }</h2>
		<VersionPreview blockData={ blockData } contentSize={ contentSize } />
	</div>
);

/**
 * Compares a saved version with the block as it is now, and restores it.
 *
 * Wide screens show both side by side; narrower ones show one at a time in tabs.
 * A "Text changes" view shows the words restoring removes or brings back.
 *
 * @param {Object}   props
 * @param {Object}   props.snapshot     Version to compare.
 * @param {Object}   props.currentBlock The block in the editor.
 * @param {number}   props.now          Current time in milliseconds.
 * @param {Function} props.onClose      Closes the modal.
 * @param {Function} props.onRestore    Called with the version to restore.
 */
export const CompareModal = ( {
	snapshot,
	currentBlock,
	now,
	onClose,
	onRestore,
} ) => {
	const presets = useEditorPresets();
	const isWide = useViewportMatch( 'large' );
	const idPrefix = useInstanceId( CompareModal, 'block-rewind-compare' );
	const nestedRef = useRef();
	const [ view, setView ] = useState( 'version' );

	const changes = useMemo(
		() => describeChanges( currentBlock, snapshot ),
		[ currentBlock, snapshot ]
	);
	const rows = useMemo(
		() => getChangeRows( changes, presets ),
		[ changes, presets ]
	);

	const hasTextChanges =
		Boolean( changes.text && ! changes.text.formattingOnly ) ||
		Boolean(
			changes.innerBlocks?.changed.some(
				( change ) => change.text && ! change.text.formattingOnly
			)
		);

	const nowTitle = __( 'Now', 'block-rewind' );
	const versionTitle = __( 'After restoring', 'block-rewind' );
	const nestedWarning = getNestedWarning( changes.innerBlocks );

	const tabs = isWide
		? [
				{
					name: 'version',
					title: __( 'Side by side', 'block-rewind' ),
				},
		  ]
		: [
				// Same order as the table; the version still opens first.
				{ name: 'now', title: nowTitle },
				{ name: 'version', title: versionTitle },
		  ];
	if ( hasTextChanges ) {
		tabs.push( {
			name: 'text',
			title: __( 'Text changes', 'block-rewind' ),
		} );
	}

	// Switching to a wide window has no separate "Now" tab.
	useEffect( () => {
		if ( isWide && view === 'now' ) {
			setView( 'version' );
		}
	}, [ isWide, view ] );

	// The only link is "See details" on the nested blocks row.
	const onLink = () => {
		setView( 'version' );
		window.requestAnimationFrame( () =>
			nestedRef.current?.scrollIntoView( { block: 'start' } )
		);
	};

	const nestedChanges = changes.innerBlocks && (
		<NestedChanges ref={ nestedRef } innerBlocks={ changes.innerBlocks } />
	);

	let panel;
	if ( view === 'text' ) {
		panel = (
			<div className="block-rewind-compare__text">
				<TextDiffLegend />
				{ changes.text && ! changes.text.formattingOnly && (
					<TextDiff segments={ changes.text.segments } />
				) }
				{ nestedChanges }
			</div>
		);
	} else if ( isWide ) {
		panel = (
			<>
				<div className="block-rewind-compare__panes">
					<Pane
						title={ nowTitle }
						blockData={ currentBlock }
						contentSize={ presets.contentSize }
					/>
					<Pane
						title={ versionTitle }
						blockData={ snapshot }
						contentSize={ presets.contentSize }
					/>
				</div>
				{ nestedChanges }
			</>
		);
	} else {
		panel = (
			<>
				<VersionPreview
					blockData={ view === 'now' ? currentBlock : snapshot }
					contentSize={ presets.contentSize }
				/>
				{ nestedChanges }
			</>
		);
	}

	return (
		<Modal
			title={ getModalTitle( snapshot, now ) }
			onRequestClose={ onClose }
			size="large"
			className="block-rewind-compare"
		>
			<div className="block-rewind-compare__body">
				<p className="block-rewind-compare__meta">
					{ [
						getBlockTitle( snapshot.blockName ),
						formatSnapshotTimestamp( snapshot.timestamp, now ),
						snapshot.restoredFrom &&
							sprintf(
								/* translators: %s: time of the restored version, e.g. "10:47 PM". */
								__(
									'restored from the %s version',
									'block-rewind'
								),
								formatShortTime( snapshot.restoredFrom, now )
							),
						snapshot.restoredWithParent &&
							sprintf(
								/* translators: 1: block type of the parent block, e.g. "Group". 2: time of the version it was restored to, e.g. "10:47 PM". */
								__(
									'changed when the %1$s around it was restored to its %2$s version',
									'block-rewind'
								),
								getBlockTitle(
									snapshot.restoredWithParent.blockName
								),
								formatShortTime(
									snapshot.restoredWithParent.timestamp,
									now
								)
							),
					]
						.filter( Boolean )
						.join( ' · ' ) }
				</p>

				{ changes.hasChanges ? (
					<ChangeTable rows={ rows } onLink={ onLink } />
				) : (
					<p className="block-rewind-compare__identical">
						{ __(
							'This version matches the block as it is now, so there is nothing to restore.',
							'block-rewind'
						) }
					</p>
				) }

				{ tabs.length > 1 ? (
					<>
						<ViewTabs
							tabs={ tabs }
							selected={ view }
							onSelect={ setView }
							idPrefix={ idPrefix }
						/>
						<div
							id={ `${ idPrefix }-panel` }
							role="tabpanel"
							aria-labelledby={ `${ idPrefix }-tab-${ view }` }
							className="block-rewind-compare__panel"
						>
							{ panel }
						</div>
					</>
				) : (
					<div className="block-rewind-compare__panel">{ panel }</div>
				) }
			</div>

			<div className="block-rewind-compare__footer">
				<div className="block-rewind-compare__footer-note">
					{ nestedWarning && (
						<p className="block-rewind-compare__footer-warning">
							{ nestedWarning }
						</p>
					) }
					<p>
						{ __(
							'Your current block is saved to history first, and you can undo the restore.',
							'block-rewind'
						) }
					</p>
				</div>
				<Button variant="tertiary" onClick={ onClose }>
					{ __( 'Cancel', 'block-rewind' ) }
				</Button>
				<Button
					variant="primary"
					disabled={ ! changes.hasChanges }
					accessibleWhenDisabled
					onClick={ () => onRestore( snapshot ) }
				>
					{ __( 'Restore this version', 'block-rewind' ) }
				</Button>
			</div>
		</Modal>
	);
};
