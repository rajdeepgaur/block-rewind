import { getSettings } from '@wordpress/date';
import { __, _n, sprintf } from '@wordpress/i18n';

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

// The editor's language as a BCP 47 tag (en_US -> en-US), so dates follow the
// user's WordPress language rather than the browser's.
const getLocale = () => {
	const locale = getSettings()?.l10n?.locale;
	return locale ? locale.replace( '_', '-' ) : undefined;
};

const formatWith = ( timestamp, options ) => {
	try {
		return new Intl.DateTimeFormat( getLocale(), options ).format(
			new Date( timestamp )
		);
	} catch ( error ) {
		// An unsupported locale falls back to the browser's.
		return new Intl.DateTimeFormat( undefined, options ).format(
			new Date( timestamp )
		);
	}
};

const isSameDay = ( left, right ) =>
	new Date( left ).toDateString() === new Date( right ).toDateString();

/**
 * Formats a time of day with seconds, e.g. "Today, 10:50:57 PM" or
 * "Oct 21, 2026, 10:50:57 PM". The clock follows the locale (12 or 24 hours).
 *
 * @param {number} timestamp Time in milliseconds.
 * @param {number} now       Current time in milliseconds.
 * @return {string} Formatted date and time.
 */
export const formatSnapshotTimestamp = ( timestamp, now = Date.now() ) => {
	if ( ! timestamp ) {
		return '';
	}

	const time = formatWith( timestamp, {
		hour: 'numeric',
		minute: '2-digit',
		second: '2-digit',
	} );

	if ( isSameDay( timestamp, now ) ) {
		/* translators: %s: time of day, e.g. "10:50:57 PM". */
		return sprintf( __( 'Today, %s', 'block-rewind' ), time );
	}

	return sprintf(
		/* translators: 1: date, e.g. "Oct 21, 2026". 2: time of day. */
		__( '%1$s, %2$s', 'block-rewind' ),
		formatWith( timestamp, {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
		} ),
		time
	);
};

/**
 * Formats a short time for lists, e.g. "10:50 PM", or "Oct 21, 10:50 PM" when the
 * time is not today.
 *
 * @param {number} timestamp Time in milliseconds.
 * @param {number} now       Current time in milliseconds.
 * @return {string} Formatted time.
 */
export const formatShortTime = ( timestamp, now = Date.now() ) =>
	formatWith(
		timestamp,
		isSameDay( timestamp, now )
			? { hour: 'numeric', minute: '2-digit' }
			: {
					month: 'short',
					day: 'numeric',
					hour: 'numeric',
					minute: '2-digit',
			  }
	);

/**
 * Describes how long ago a time was, e.g. "Just now", "5 min ago", "2 hours ago".
 *
 * @param {number} timestamp Time in milliseconds.
 * @param {number} now       Current time in milliseconds.
 * @return {string} Relative time.
 */
export const formatRelativeTime = ( timestamp, now = Date.now() ) => {
	const elapsed = Math.max( 0, now - timestamp );

	if ( elapsed < MINUTE_MS ) {
		return __( 'Just now', 'block-rewind' );
	}

	if ( elapsed < HOUR_MS ) {
		const minutes = Math.floor( elapsed / MINUTE_MS );
		return sprintf(
			/* translators: %d: number of minutes. */
			_n( '%d min ago', '%d min ago', minutes, 'block-rewind' ),
			minutes
		);
	}

	if ( elapsed < 24 * HOUR_MS ) {
		const hours = Math.floor( elapsed / HOUR_MS );
		return sprintf(
			/* translators: %d: number of hours. */
			_n( '%d hour ago', '%d hours ago', hours, 'block-rewind' ),
			hours
		);
	}

	return formatWith( timestamp, { month: 'short', day: 'numeric' } );
};

/**
 * Returns the label of the time group a version belongs to in the history list.
 *
 * @param {number} timestamp Time in milliseconds.
 * @param {number} now       Current time in milliseconds.
 * @return {string} Group label.
 */
export const getTimeGroupLabel = ( timestamp, now = Date.now() ) => {
	const elapsed = now - timestamp;

	if ( elapsed < 10 * MINUTE_MS ) {
		return __( 'Last 10 minutes', 'block-rewind' );
	}

	if ( elapsed < HOUR_MS ) {
		return __( 'Last hour', 'block-rewind' );
	}

	if ( isSameDay( timestamp, now ) ) {
		return __( 'Earlier today', 'block-rewind' );
	}

	return __( 'Older', 'block-rewind' );
};
