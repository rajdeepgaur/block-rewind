<?php
/**
 * Plugin Name: Live Editing History for Gutenberg
 * Description: Session-based block history tracking for Gutenberg using IndexedDB.
 * Version: 0.1.0
 * Author: Rajdeep Singh Gaur
 * License: GPL-2.0-or-later
 *
 * @package LEHFG
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Enqueue editor assets for Gutenberg.
 */
function lehfg_enqueue_block_editor_assets() {
	$asset_path = plugin_dir_path( __FILE__ ) . 'build/index.asset.php';

	if ( ! file_exists( $asset_path ) ) {
		return;
	}

	$asset = include $asset_path;

	wp_enqueue_script(
		'lehfg-editor-runtime',
		plugin_dir_url( __FILE__ ) . 'build/index.js',
		$asset['dependencies'],
		$asset['version'],
		true
	);

	wp_enqueue_style(
		'lehfg-editor-runtime',
		plugin_dir_url( __FILE__ ) . 'build/index.css',
		array(),
		$asset['version']
	);
}

add_action( 'enqueue_block_editor_assets', 'lehfg_enqueue_block_editor_assets' );
