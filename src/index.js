/**
 * Live Editing History for Gutenberg - Main Plugin Entry Point
 * 
 * This file:
 * 1. Initializes the plugin when the editor loads
 * 2. Sets up the change detection system
 * 3. Manages the overall lifecycle
 * 
 * Loaded in Gutenberg editor via wp-scripts build
 */

import { initChangeDetection } from './tracking/change-detector';
import { clearAllSnapshots } from './storage/database';

/**
 * Initialize the plugin
 * 
 * Called when the editor is ready
 */
async function initializePlugin() {
	console.log(
		'%c🕐 Live Editing History for Gutenberg',
		'color: #0073aa; font-size: 14px; font-weight: bold'
	);

	try {
		// Start tracking block changes
		await initChangeDetection();

		// Expose utility API globally for debugging in console
		window.LEH = {
			// Clear all stored history (useful for testing)
			clearHistory: clearAllSnapshots,
			
			// Get the version
			version: '1.0.0',
		};

		console.log('%c✓ Plugin initialized. Use window.LEH for utilities.', 'color: green');
	} catch (error) {
		console.error('Failed to initialize plugin:', error);
	}
}

/**
 * Wait for the editor to be ready, then initialize
 * 
 * The editor takes a moment to load, so we wait for the
 * block editor store to be available before starting
 */
function waitForEditor() {
	const checkEditor = () => {
		try {
			if (wp && wp.data && wp.data.select('core/block-editor')) {
				console.log('✓ Editor detected, starting plugin...');
				initializePlugin();
			} else {
				// Try again in 100ms
				setTimeout(checkEditor, 100);
			}
		} catch (error) {
			setTimeout(checkEditor, 100);
		}
	};

	checkEditor();
}

// Start when document is ready
if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', waitForEditor);
} else {
	waitForEditor();
}
