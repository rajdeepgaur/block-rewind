import domReady from '@wordpress/dom-ready';

import { initializeHistoryRuntime } from './runtime/initialize';

// Boot the plugin runtime once the editor DOM is ready.
domReady( () => {
	initializeHistoryRuntime().catch( ( error ) => {
		// Keep failure visible in development while avoiding editor crash.
		// eslint-disable-next-line no-console
		console.error( 'LEHFG initialization error:', error );
	} );
} );
