<?php
/**
 * Plugin Name: Live Editing History for Gutenberg
 * Description: Session-based block history with time travel for Gutenberg
 * Version: 1.0.0
 * Author: Rajdeep Singh Gaur
 * License: GPL-2.0-or-later
 * Text Domain: live-editing-history-for-gutenberg
 * Domain Path: /languages
 *
 * @package LiveEditingHistoryForGutenberg
 */

namespace LiveEditingHistoryForGutenberg;

// Prevent direct access
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

// Define plugin constants
define( 'LEHFG_VERSION', '1.0.0' );
define( 'LEHFG_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
define( 'LEHFG_PLUGIN_URL', plugin_dir_url( __FILE__ ) );

/**
 * Initialize plugin
 */
function init() {
	// Enqueue scripts for editor
	add_action( 'enqueue_block_editor_assets', __NAMESPACE__ . '\\enqueue_editor_assets' );
}

/**
 * Enqueue editor scripts and styles
 */
function enqueue_editor_assets() {
	// Enqueue the main script built from src/main.js
	wp_enqueue_script(
		'lehfg-editor',
		LEHFG_PLUGIN_URL . 'build/index.js',
		array( 'wp-blocks', 'wp-element', 'wp-editor', 'wp-data', 'wp-plugins' ),
		LEHFG_VERSION,
		false
	);
}

// Initialize plugin
add_action( 'plugins_loaded', __NAMESPACE__ . '\\init' );
