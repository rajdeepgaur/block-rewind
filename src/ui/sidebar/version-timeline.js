import { Button } from '@wordpress/components';
import { useInstanceId } from '@wordpress/compose';
import { useEffect, useMemo, useRef, useState } from '@wordpress/element';
import { __, _n, sprintf } from '@wordpress/i18n';

import { describeChanges, getFullText } from '../../diff/describe-changes';
import {
	formatRelativeTime,
	formatShortTime,
	getTimeGroupLabel,
} from '../../utils/format-snapshot-timestamp';
import { getBlockTitle, summarizeChanges } from '../change-labels';
import { useStorageStatus } from '../use-storage-status';

// Versions listed before "Show older versions".
const INITIAL_VISIBLE_COUNT = 10;
const EXCERPT_LENGTH = 160;

const getExcerpt = ( snapshot ) => {
	const text = getFullText( snapshot ).replace( /\s+/g, ' ' );
	return text.length > EXCERPT_LENGTH
		? `${ text.slice( 0, EXCERPT_LENGTH - 1 ) }…`
		: text;
};

const getNowNote = ( hasVersions, storageStatus ) => {
	if ( storageStatus === 'full' ) {
		return __(
			'Not saved to history yet: the browser’s storage is full.',
			'block-rewind'
		);
	}

	return hasVersions
		? __(
				'Edited since the last version. It is saved to history within a minute.',
				'block-rewind'
		  )
		: __(
				'This block’s first version is saved within a minute. Empty starting states are not kept.',
				'block-rewind'
		  );
};

// The current state of the block when it differs from every saved version.
const NowRow = ( { hasVersions } ) => {
	const storageStatus = useStorageStatus();

	return (
		<div className="block-rewind-timeline__now">
			<span
				className="block-rewind-timeline__dot is-current"
				aria-hidden="true"
			/>
			<div className="block-rewind-timeline__body">
				<p className="block-rewind-timeline__title">
					{ __( 'Now', 'block-rewind' ) }
				</p>
				<p className="block-rewind-timeline__note">
					{ getNowNote( hasVersions, storageStatus ) }
				</p>
			</div>
		</div>
	);
};

// Whether a row is the version recorded by the restore that requested focus.
const isRequestedForFocus = ( version, focusRequest ) =>
	Boolean(
		focusRequest &&
			version.isCurrent &&
			version.snapshot.restoredFrom === focusRequest.restoredFrom &&
			version.snapshot.timestamp >= focusRequest.savedAfter
	);

// One saved version, with Compare and Restore (shown on hover or keyboard focus).
// The current version's heading can take focus, e.g. after a restore.
const VersionRow = ( {
	version,
	now,
	onCompare,
	onRestore,
	shouldFocus,
	onFocusHandled,
} ) => {
	const titleId = useInstanceId( VersionRow, 'block-rewind-version-title' );
	const headingRef = useRef();
	const { snapshot, isCurrent, changeLabels, excerpt } = version;

	// Takes focus only if it was lost, so typing in the canvas is never interrupted.
	useEffect( () => {
		if ( ! shouldFocus ) {
			return;
		}

		const { activeElement, body } = headingRef.current.ownerDocument;
		if ( ! activeElement || activeElement === body ) {
			headingRef.current.focus();
		}
		onFocusHandled();
	}, [ shouldFocus, onFocusHandled ] );
	const { restoredWithParent } = snapshot;
	const parentTitle =
		restoredWithParent && getBlockTitle( restoredWithParent.blockName );

	return (
		<li
			className={ `block-rewind-timeline__version${
				isCurrent ? ' is-current' : ''
			}` }
		>
			<span
				className={ `block-rewind-timeline__dot${
					isCurrent ? ' is-current' : ''
				}` }
				aria-hidden="true"
			/>
			<div className="block-rewind-timeline__body">
				<div
					ref={ headingRef }
					className="block-rewind-timeline__heading"
					tabIndex={ isCurrent ? -1 : undefined }
				>
					<span
						id={ titleId }
						className="block-rewind-timeline__title"
					>
						{ snapshot.isBaseline
							? __( 'Before editing', 'block-rewind' )
							: formatRelativeTime( snapshot.timestamp, now ) }
					</span>
					{ isCurrent && (
						<span className="block-rewind-badge is-current">
							{ __( 'Current', 'block-rewind' ) }
						</span>
					) }
					{ snapshot.restoredFrom && (
						<span className="block-rewind-badge">
							{ __( 'Restored', 'block-rewind' ) }
						</span>
					) }
					{ restoredWithParent && (
						<span className="block-rewind-badge">
							{ sprintf(
								/* translators: %s: block type of the restored parent block, e.g. "Group". */
								__( 'Restored with %s', 'block-rewind' ),
								parentTitle
							) }
						</span>
					) }
					<span className="block-rewind-timeline__time">
						{ formatShortTime( snapshot.timestamp, now ) }
					</span>
				</div>
				{ snapshot.restoredFrom && (
					<p className="block-rewind-timeline__note">
						{ sprintf(
							/* translators: %s: time of the restored version, e.g. "10:47 PM". */
							__(
								'Restored from the %s version.',
								'block-rewind'
							),
							formatShortTime( snapshot.restoredFrom, now )
						) }
					</p>
				) }
				{ restoredWithParent && (
					<p className="block-rewind-timeline__note">
						{ sprintf(
							/* translators: 1: block type of the parent block, e.g. "Group". 2: time of the version it was restored to, e.g. "10:47 PM". */
							__(
								'Changed when the %1$s around it was restored to its %2$s version.',
								'block-rewind'
							),
							parentTitle,
							formatShortTime( restoredWithParent.timestamp, now )
						) }
					</p>
				) }
				<p className="block-rewind-timeline__excerpt">
					{ excerpt || (
						<span className="block-rewind-timeline__empty-text">
							{ __( 'No text', 'block-rewind' ) }
						</span>
					) }
				</p>
				{ changeLabels.length > 0 && (
					<ul
						className="block-rewind-timeline__changes"
						aria-label={ __(
							'Changes in this version',
							'block-rewind'
						) }
					>
						{ changeLabels.map( ( label ) => (
							<li key={ label } className="block-rewind-chip">
								{ label }
							</li>
						) ) }
					</ul>
				) }
				{ ! isCurrent && (
					<div className="block-rewind-timeline__actions">
						<Button
							variant="primary"
							size="compact"
							aria-describedby={ titleId }
							onClick={ () => onCompare( snapshot ) }
						>
							{ __( 'Compare', 'block-rewind' ) }
						</Button>
						<Button
							variant="secondary"
							size="compact"
							aria-describedby={ titleId }
							onClick={ () => onRestore( snapshot ) }
						>
							{ __( 'Restore', 'block-rewind' ) }
						</Button>
					</div>
				) }
			</div>
		</li>
	);
};

/**
 * Lists a block's saved versions, newest first, grouped by time.
 *
 * @param {Object}   props
 * @param {Object[]} props.snapshots      Versions, newest first.
 * @param {number}   props.currentIndex   Index of the version matching the block, or -1.
 * @param {number}   props.now            Current time in milliseconds.
 * @param {Function} props.onCompare      Called with a version to compare.
 * @param {Function} props.onRestore      Called with a version to restore.
 * @param {?Object}  props.focusRequest   `restoredFrom` and `savedAfter` of a version
 *                                        recorded by a restore, to focus once listed.
 * @param {Function} props.onFocusHandled Called once that version was listed.
 */
export const VersionTimeline = ( {
	snapshots,
	currentIndex,
	now,
	onCompare,
	onRestore,
	focusRequest,
	onFocusHandled,
} ) => {
	const [ showAll, setShowAll ] = useState( false );

	// Each version is summarized against the version saved before it.
	const versions = useMemo(
		() =>
			snapshots.map( ( snapshot, index ) => {
				const previous = snapshots[ index + 1 ];

				return {
					snapshot,
					isCurrent: index === currentIndex,
					excerpt: getExcerpt( snapshot ),
					changeLabels: previous
						? summarizeChanges(
								describeChanges( previous, snapshot )
						  )
						: [],
				};
			} ),
		[ snapshots, currentIndex ]
	);

	const visibleVersions = showAll
		? versions
		: versions.slice( 0, INITIAL_VISIBLE_COUNT );
	const hiddenCount = versions.length - visibleVersions.length;

	const groups = [];
	visibleVersions.forEach( ( version ) => {
		const label = getTimeGroupLabel( version.snapshot.timestamp, now );
		const lastGroup = groups[ groups.length - 1 ];

		if ( lastGroup?.label === label ) {
			lastGroup.versions.push( version );
		} else {
			groups.push( { label, versions: [ version ] } );
		}
	} );

	return (
		<div className="block-rewind-timeline">
			{ currentIndex === -1 && (
				<NowRow hasVersions={ snapshots.length > 0 } />
			) }
			{ groups.map( ( group ) => (
				<section
					key={ group.label }
					className="block-rewind-timeline__group"
				>
					<h4 className="block-rewind-timeline__group-label">
						{ group.label }
					</h4>
					<ol
						className="block-rewind-timeline__list"
						aria-label={ group.label }
					>
						{ group.versions.map( ( version ) => (
							<VersionRow
								key={ version.snapshot.snapshotId }
								version={ version }
								now={ now }
								onCompare={ onCompare }
								onRestore={ onRestore }
								shouldFocus={ isRequestedForFocus(
									version,
									focusRequest
								) }
								onFocusHandled={ onFocusHandled }
							/>
						) ) }
					</ol>
				</section>
			) ) }
			{ hiddenCount > 0 && (
				<div className="block-rewind-timeline__more">
					<Button
						variant="secondary"
						size="compact"
						onClick={ () => setShowAll( true ) }
					>
						{ sprintf(
							/* translators: %d: number of older versions. */
							_n(
								'Show %d older version',
								'Show %d older versions',
								hiddenCount,
								'block-rewind'
							),
							hiddenCount
						) }
					</Button>
				</div>
			) }
		</div>
	);
};
