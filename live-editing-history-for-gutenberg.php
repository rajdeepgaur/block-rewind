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
 * Registers the block ID attribute for every block type on the server.
 *
 * The block renderer REST endpoint rejects attributes that are not registered
 * server-side, which would break every block previewed with ServerSideRender.
 *
 * @param array $args Block type registration arguments.
 * @return array
 */
function lehfg_register_block_id_attribute( $args ) {
	if ( ! isset( $args['attributes'] ) || ! is_array( $args['attributes'] ) ) {
		$args['attributes'] = array();
	}

	if ( ! isset( $args['attributes']['lehfgBlockId'] ) ) {
		$args['attributes']['lehfgBlockId'] = array(
			'type' => 'string',
		);
	}

	return $args;
}

add_filter( 'register_block_type_args', 'lehfg_register_block_id_attribute' );

/**
 * Checks whether the current admin screen is the post editor.
 *
 * Block editor assets also load in the Site Editor, Widgets screen and
 * Customizer, which the history runtime does not support.
 *
 * @return bool
 */
function lehfg_is_post_editor_screen() {
	if ( ! function_exists( 'get_current_screen' ) ) {
		return false;
	}

	$screen = get_current_screen();

	return $screen && 'post' === $screen->base && $screen->is_block_editor();
}

/**
 * Returns the settings passed to the editor runtime.
 *
 * @return array
 */
function lehfg_get_editor_settings() {
	/**
	 * Filters how long block history is kept in the browser, in seconds.
	 *
	 * @param int $ttl Retention in seconds. Default 4 hours, minimum 5 minutes.
	 */
	$snapshot_ttl = (int) apply_filters( 'lehfg_snapshot_ttl', 4 * HOUR_IN_SECONDS );

	/**
	 * Filters the maximum number of snapshots kept per block; the oldest are removed first.
	 *
	 * @param int $max_snapshots Snapshots per block. Default 100, minimum 5.
	 */
	$max_snapshots = (int) apply_filters( 'lehfg_max_snapshots_per_block', 100 );

	return array(
		// History is stored per site and per user, as browsers share storage per origin.
		'storageKey'           => substr( md5( home_url() ), 0, 12 ) . '-' . get_current_user_id(),
		'snapshotTtl'          => max( 5 * MINUTE_IN_SECONDS, $snapshot_ttl ),
		'maxSnapshotsPerBlock' => max( 5, $max_snapshots ),
	);
}

/**
 * Enqueue editor assets for Gutenberg.
 */
function lehfg_enqueue_block_editor_assets() {
	if ( ! lehfg_is_post_editor_screen() ) {
		return;
	}

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

	wp_add_inline_script(
		'lehfg-editor-runtime',
		'window.lehfgSettings = ' . wp_json_encode( lehfg_get_editor_settings() ) . ';',
		'before'
	);

	wp_enqueue_style(
		'lehfg-editor-runtime',
		plugin_dir_url( __FILE__ ) . 'build/index.css',
		array( 'wp-components' ),
		$asset['version']
	);
	wp_style_add_data( 'lehfg-editor-runtime', 'rtl', 'replace' );
}

add_action( 'enqueue_block_editor_assets', 'lehfg_enqueue_block_editor_assets' );
