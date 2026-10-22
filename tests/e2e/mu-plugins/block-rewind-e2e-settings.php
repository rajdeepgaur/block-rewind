<?php
/**
 * Plugin Name: Block Rewind e2e settings
 * Description: Test-only overrides for history settings, read from cookies set by e2e tests.
 *
 * @package BlockRewind
 */

add_filter(
	'block_rewind_snapshot_ttl',
	static function ( $ttl ) {
		return isset( $_COOKIE['block_rewind_e2e_ttl'] ) ? absint( $_COOKIE['block_rewind_e2e_ttl'] ) : $ttl;
	}
);

add_filter(
	'block_rewind_max_snapshots_per_block',
	static function ( $max ) {
		return isset( $_COOKIE['block_rewind_e2e_max'] ) ? absint( $_COOKIE['block_rewind_e2e_max'] ) : $max;
	}
);
