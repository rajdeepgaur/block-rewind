import domReady from '@wordpress/dom-ready';

import './identity/register-block-attributes';
import { registerHistorySidebar } from './ui/sidebar/sidebar-panel';
import { startStorageFullSnackbar } from './ui/storage-full-snackbar';
import { initializeHistoryRuntime } from './runtime/initialize';

// Boot the plugin runtime once the editor DOM is ready.
domReady( () => {
	registerHistorySidebar();
	startStorageFullSnackbar();
	initializeHistoryRuntime().catch( ( error ) => {
		// Keep failure visible in development while avoiding editor crash.
		// eslint-disable-next-line no-console
		console.error( 'Block Rewind initialization error:', error );
	} );
} );
