const formatClockTime = ( date ) =>
	new Intl.DateTimeFormat( undefined, {
		hour: 'numeric',
		minute: '2-digit',
		// Several versions can be saved within one minute (first edit, checkpoint, restore).
		second: '2-digit',
		hour12: true,
	} ).format( date );

const formatCalendarDate = ( date ) =>
	new Intl.DateTimeFormat( undefined, {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
	} ).format( date );

export const formatSnapshotTimestamp = ( timestamp ) => {
	if ( ! timestamp ) {
		return '';
	}

	const date = new Date( timestamp );
	const today = new Date();

	const isToday =
		date.getFullYear() === today.getFullYear() &&
		date.getMonth() === today.getMonth() &&
		date.getDate() === today.getDate();

	return isToday
		? `Today, ${ formatClockTime( date ) }`
		: `${ formatCalendarDate( date ) }, ${ formatClockTime( date ) }`;
};
