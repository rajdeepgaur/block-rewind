import { dispatch } from '@wordpress/data';
import { __ } from '@wordpress/i18n';

import {
	getStorageStatus,
	subscribeToStorageStatus,
} from '../state/storage-status';

/**
 * Shows a snackbar the first time in a session that versions can't be saved because
 * the browser's storage is full, so people who never open the sidebar find out too.
 * The sidebar keeps showing the state for as long as it lasts.
 */
export const startStorageFullSnackbar = () => {
	const unsubscribe = subscribeToStorageStatus( () => {
		if ( getStorageStatus() !== 'full' ) {
			return;
		}

		unsubscribe();
		dispatch( 'core/notices' ).createNotice(
			'warning',
			__(
				'Block history isn’t being saved: the browser’s storage is full.',
				'block-rewind'
			),
			{
				id: 'block-rewind-storage-full',
				type: 'snackbar',
				isDismissible: true,
				actions: [
					{
						label: __( 'View', 'block-rewind' ),
						onClick: () =>
							dispatch(
								'core/interface'
							).enableComplementaryArea(
								'core',
								'block-rewind/block-rewind-sidebar'
							),
					},
				],
			}
		);
	} );
};
