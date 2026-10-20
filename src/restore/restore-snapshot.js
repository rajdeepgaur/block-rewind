import { createBlock, getBlockType } from '@wordpress/blocks';
import { dispatch, select } from '@wordpress/data';
import { __, sprintf } from '@wordpress/i18n';

import { LEHFG_BLOCK_ID_ATTRIBUTE } from '../constants';
import { getTrackedBlock } from '../change-detection/subscribe-store';
import { claimBlockId } from '../identity/resolve-block-identities';
import { computeBlockHash } from '../serialization/serialize-block';
import {
	findSnapshotByHash,
	persistSnapshotIfChanged,
} from '../snapshots/snapshot-service';
import { runtimeState } from '../state/runtime-state';

const showNotice = ( status, message, options = {} ) =>
	dispatch( 'core/notices' ).createNotice( status, message, {
		type: 'snackbar',
		isDismissible: true,
		...options,
	} );

// Collects block types used by a snapshot that are no longer registered.
const findMissingBlockTypes = ( node, missing = new Set() ) => {
	if ( ! getBlockType( node.blockName ) ) {
		missing.add( node.blockName );
	}

	( node.innerBlocks || [] ).forEach( ( innerBlock ) =>
		findMissingBlockTypes( innerBlock, missing )
	);

	return missing;
};

// Rebuilds nested block instances from serialized snapshot inner blocks.
const rehydrateInnerBlocks = ( serializedInnerBlocks = [] ) =>
	serializedInnerBlocks.map( ( serializedBlock ) =>
		createBlock(
			serializedBlock.blockName,
			serializedBlock.attributes || {},
			rehydrateInnerBlocks( serializedBlock.innerBlocks || [] )
		)
	);

// Attributes that turn the current block's attributes into exactly the restored ones.
const getAttributeUpdate = ( currentAttributes, restoredAttributes ) => {
	const update = { ...restoredAttributes };

	for ( const key of Object.keys( currentAttributes ) ) {
		if ( ! ( key in restoredAttributes ) ) {
			update[ key ] = undefined;
		}
	}

	return update;
};

// Restores a snapshot of the same block type in place, keeping the block's client ID
// and selection. Inner blocks are replaced first; the attribute update is then merged
// into the same undo step, so a single undo reverts the whole restore.
const restoreInPlace = ( targetBlock, restoredBlock ) => {
	const {
		__unstableMarkNextChangeAsNotPersistent: markNextChangeAsNotPersistent,
		replaceInnerBlocks,
		updateBlockAttributes,
	} = dispatch( 'core/block-editor' );

	if ( targetBlock.innerBlocks.length || restoredBlock.innerBlocks.length ) {
		replaceInnerBlocks(
			targetBlock.clientId,
			restoredBlock.innerBlocks,
			false
		);
		markNextChangeAsNotPersistent();
	}

	updateBlockAttributes(
		targetBlock.clientId,
		getAttributeUpdate( targetBlock.attributes, restoredBlock.attributes )
	);

	return targetBlock.clientId;
};

// Replaces the block with the snapshot's block type, if the editor allows it here.
const restoreAsOtherBlockType = ( targetBlock, restoredBlock ) => {
	const blockEditorSelect = select( 'core/block-editor' );
	const rootClientId = blockEditorSelect.getBlockRootClientId(
		targetBlock.clientId
	);

	if (
		! blockEditorSelect.canRemoveBlock( targetBlock.clientId ) ||
		! blockEditorSelect.canInsertBlockType(
			restoredBlock.name,
			rootClientId
		)
	) {
		return null;
	}

	dispatch( 'core/block-editor' ).replaceBlock(
		targetBlock.clientId,
		restoredBlock
	);

	return blockEditorSelect.getBlock( restoredBlock.clientId )
		? restoredBlock.clientId
		: null;
};

/**
 * Replaces the current content of a tracked block with a stored snapshot.
 *
 * The current state is saved to history first, and the restore is a single undo step.
 *
 * @param {Object} snapshot Snapshot record from IndexedDB.
 * @return {Promise<boolean>} Whether the block was restored.
 */
export const restoreSnapshotToEditor = async ( snapshot ) => {
	const blockId = snapshot?.blockId;
	if ( ! blockId ) {
		return false;
	}

	try {
		const targetBlock = getTrackedBlock( blockId );
		if ( ! targetBlock ) {
			showNotice(
				'error',
				__(
					'The block for this version is no longer in the post.',
					'lehfg'
				)
			);
			return false;
		}

		const currentHash = computeBlockHash( targetBlock );
		if ( currentHash === snapshot.hash ) {
			showNotice(
				'info',
				__(
					'This version is already the current content of the block.',
					'lehfg'
				)
			);
			return false;
		}

		const missingBlockTypes = Array.from(
			findMissingBlockTypes( snapshot )
		);
		if ( missingBlockTypes.length ) {
			showNotice(
				'error',
				sprintf(
					/* translators: %s: comma-separated block type names, e.g. "my-plugin/slider". */
					__(
						'This version can’t be restored because it uses blocks that are no longer available: %s',
						'lehfg'
					),
					missingBlockTypes.join( ', ' )
				)
			);
			return false;
		}

		runtimeState.isRestoringSnapshot = true;

		// Save the current state first so the restore can be reverted from history too.
		const postId = select( 'core/editor' ).getCurrentPostId();
		if (
			postId &&
			! ( await findSnapshotByHash( postId, blockId, currentHash ) )
		) {
			await persistSnapshotIfChanged( blockId, targetBlock, postId );
		}

		const latestTargetBlock = getTrackedBlock( blockId );
		if ( ! latestTargetBlock ) {
			return false;
		}

		const restoredBlock = createBlock(
			snapshot.blockName,
			{
				...( snapshot.attributes || {} ),
				[ LEHFG_BLOCK_ID_ATTRIBUTE ]: blockId,
			},
			rehydrateInnerBlocks( snapshot.innerBlocks || [] )
		);

		const restoredClientId =
			restoredBlock.name === latestTargetBlock.name
				? restoreInPlace( latestTargetBlock, restoredBlock )
				: restoreAsOtherBlockType( latestTargetBlock, restoredBlock );

		if ( ! restoredClientId ) {
			showNotice(
				'error',
				__(
					'This version can’t be restored here because the block is locked or not allowed in this position.',
					'lehfg'
				)
			);
			return false;
		}

		// The restored content is already in history, so it is not recorded again.
		claimBlockId( runtimeState.identity, restoredClientId, blockId );
		runtimeState.observedByBlockId.set( blockId, restoredBlock );

		showNotice( 'success', __( 'Version restored.', 'lehfg' ), {
			actions: [
				{
					label: __( 'Undo', 'lehfg' ),
					onClick: () => dispatch( 'core/editor' ).undo(),
				},
			],
		} );
		return true;
	} catch ( error ) {
		// eslint-disable-next-line no-console
		console.error( 'LEHFG restore error:', error );
		showNotice(
			'error',
			__( 'This version could not be restored.', 'lehfg' )
		);
		return false;
	} finally {
		runtimeState.isRestoringSnapshot = false;
	}
};
