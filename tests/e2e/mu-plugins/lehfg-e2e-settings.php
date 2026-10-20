<?php
/**
 * Plugin Name: LEHFG e2e settings
 * Description: Test-only overrides for history settings, read from cookies set by e2e tests.
 *
 * @package LEHFG
 */

add_filter(
	'lehfg_snapshot_ttl',
	static function ( $ttl ) {
		return isset( $_COOKIE['lehfg_e2e_ttl'] ) ? absint( $_COOKIE['lehfg_e2e_ttl'] ) : $ttl;
	}
);

add_filter(
	'lehfg_max_snapshots_per_block',
	static function ( $max ) {
		return isset( $_COOKIE['lehfg_e2e_max'] ) ? absint( $_COOKIE['lehfg_e2e_max'] ) : $max;
	}
);
