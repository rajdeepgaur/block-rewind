import { useEffect, useState } from '@wordpress/element';

// Returns the current time, updated every interval, so relative times stay correct.
export const useNow = ( intervalMs = 30 * 1000 ) => {
	const [ now, setNow ] = useState( () => Date.now() );

	useEffect( () => {
		const timerId = window.setInterval(
			() => setNow( Date.now() ),
			intervalMs
		);
		return () => window.clearInterval( timerId );
	}, [ intervalMs ] );

	return now;
};
