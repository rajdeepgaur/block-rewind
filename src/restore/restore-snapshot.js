import { createBlock, getBlockType } from '@wordpress/blocks';
import { dispatch, select } from '@wordpress/data';
import { __, sprintf } from '@wordpress/i18n';

import { BLOCK_ID_ATTRIBUTE } from '../constants';
import { clearDirtyBlock } from '../change-detection/dirty-registry';
import { getTrackedBlock } from '../change-detection/subscribe-store';
import { claimBlockId } from '../identity/resolve-block-identities';
import { computeBlockHash } from '../serialization/serialize-block';
import {
	findSnapshotByHash,
	persistSnapshotIfChanged,
	persistSnapshotsNow,
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

// History IDs of the tracked blocks inside a block, by position, e.g. "0.2".
const getTrackedInnerBlocksByPath = (
	innerBlocks,
	prefix = '',
	tracked = new Map()
) => {
	innerBlocks.forEach( ( block, index ) => {
		const path = `${ prefix }${ index }`;
		const blockId = runtimeState.idByClientId.get( block.clientId );

		if ( blockId ) {
			tracked.set( path, { blockId, name: block.name } );
		}
		getTrackedInnerBlocksByPath( block.innerBlocks, `${ path }.`, tracked );
	} );

	return tracked;
};

// Collects the history IDs stored on serialized inner blocks.
const collectStoredIds = ( serializedInnerBlocks = [], ids = new Set() ) => {
	serializedInnerBlocks.forEach( ( serializedBlock ) => {
		const blockId = serializedBlock.attributes?.[ BLOCK_ID_ATTRIBUTE ];
		if ( blockId ) {
			ids.add( blockId );
		}
		collectStoredIds( serializedBlock.innerBlocks, ids );
	} );

	return ids;
};

/**
 * Rebuilds nested block instances from serialized snapshot inner blocks.
 *
 * An inner block saved before it had a history ID gets the ID of the tracked block
 * now at the same position, if it is the same block type, so restoring a parent
 * keeps the blocks inside connected to their own history.
 *
 * @param {Object[]}    serializedInnerBlocks Inner blocks of a snapshot.
 * @param {Map}         trackedByPath         From getTrackedInnerBlocksByPath().
 * @param {Set<string>} usedIds               IDs already present in the restored tree.
 * @param {string}      prefix                Position path of the parent.
 * @return {Object[]} Blocks.
 */
const rehydrateInnerBlocks = (
	serializedInnerBlocks = [],
	trackedByPath = new Map(),
	usedIds = new Set(),
	prefix = ''
) =>
	serializedInnerBlocks.map( ( serializedBlock, index ) => {
		const path = `${ prefix }${ index }`;
		const attributes = { ...( serializedBlock.attributes || {} ) };
		const tracked = trackedByPath.get( path );

		if (
			! attributes[ BLOCK_ID_ATTRIBUTE ] &&
			tracked?.name === serializedBlock.blockName &&
			! usedIds.has( tracked.blockId )
		) {
			attributes[ BLOCK_ID_ATTRIBUTE ] = tracked.blockId;
			usedIds.add( tracked.blockId );
		}

		return createBlock(
			serializedBlock.blockName,
			attributes,
			rehydrateInnerBlocks(
				serializedBlock.innerBlocks || [],
				trackedByPath,
				usedIds,
				`${ path }.`
			)
		);
	} );

// Tracked blocks inside a block, as history ID -> editor block. Uses the latest scan.
const getTrackedDescendants = ( clientId ) => {
	const descendants = new Map();
	const descendantClientIds = select(
		'core/block-editor'
	).getClientIdsOfDescendants( [ clientId ] );

	for ( const descendantClientId of descendantClientIds ) {
		const blockId = runtimeState.idByClientId.get( descendantClientId );
		const block = blockId && runtimeState.blockByBlockId.get( blockId );

		if ( block ) {
			descendants.set( blockId, block );
		}
	}

	return descendants;
};

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
 * Tracked blocks inside are saved first too, so each can be brought back on its own;
 * those the restore changes get a version marked as changed by this restore.
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
					'block-rewind'
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
					'block-rewind'
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
						'block-rewind'
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

		const savedTargetBlock = getTrackedBlock( blockId );
		if ( ! savedTargetBlock ) {
			return false;
		}

		const savedHashes = new Map( [ [ blockId, currentHash ] ] );
		for ( const [ innerBlockId, innerBlock ] of getTrackedDescendants(
			savedTargetBlock.clientId
		) ) {
			savedHashes.set( innerBlockId, computeBlockHash( innerBlock ) );
			clearDirtyBlock( innerBlockId );
			await persistSnapshotIfChanged( innerBlockId, innerBlock, postId );
		}

		// Edits made while the saves above were pending are saved too, synchronously, so
		// nothing can change between this save and the restore.
		const latestTargetBlock = getTrackedBlock( blockId );
		if ( ! latestTargetBlock ) {
			return false;
		}

		const hashesBefore = new Map();
		const newerStates = [];
		for ( const [ trackedId, trackedBlock ] of [
			[ blockId, latestTargetBlock ],
			...getTrackedDescendants( latestTargetBlock.clientId ),
		] ) {
			const hash = computeBlockHash( trackedBlock );
			hashesBefore.set( trackedId, hash );

			if ( hash !== savedHashes.get( trackedId ) ) {
				clearDirtyBlock( trackedId );
				newerStates.push( { blockId: trackedId, block: trackedBlock } );
			}
		}

		if (
			newerStates.length &&
			! persistSnapshotsNow( newerStates, postId )
		) {
			throw new Error( 'Edits made during the restore were not saved.' );
		}

		const restoredBlock = createBlock(
			snapshot.blockName,
			{
				...( snapshot.attributes || {} ),
				[ BLOCK_ID_ATTRIBUTE ]: blockId,
			},
			rehydrateInnerBlocks(
				snapshot.innerBlocks || [],
				getTrackedInnerBlocksByPath( latestTargetBlock.innerBlocks ),
				collectStoredIds( snapshot.innerBlocks )
			)
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
					'block-rewind'
				)
			);
			return false;
		}

		claimBlockId( runtimeState.identity, restoredClientId, blockId );
		runtimeState.observedByBlockId.set( blockId, restoredBlock );

		// Record the restore as the newest version, so the history reads as a timeline
		// even when several versions have identical content.
		await persistSnapshotIfChanged( blockId, restoredBlock, postId, {
			restoredFrom: snapshot.timestamp,
		} );

		// The scan in getTrackedBlock() picks up the restored inner blocks, which keep
		// their history IDs. Their new state is saved now, marked as caused by this
		// restore, instead of later as an ordinary edit.
		getTrackedBlock( blockId );
		const restoredWithParent = {
			blockId,
			blockName: snapshot.blockName,
			timestamp: snapshot.timestamp,
		};
		for ( const [ innerBlockId, innerBlock ] of getTrackedDescendants(
			restoredClientId
		) ) {
			if (
				computeBlockHash( innerBlock ) !==
				hashesBefore.get( innerBlockId )
			) {
				clearDirtyBlock( innerBlockId );
				await persistSnapshotIfChanged(
					innerBlockId,
					innerBlock,
					postId,
					{
						restoredWithParent,
					}
				);
			}
		}

		showNotice( 'success', __( 'Version restored.', 'block-rewind' ), {
			actions: [
				{
					label: __( 'Undo', 'block-rewind' ),
					onClick: () => dispatch( 'core/editor' ).undo(),
				},
			],
		} );
		return true;
	} catch ( error ) {
		// eslint-disable-next-line no-console
		console.error( 'Block Rewind restore error:', error );
		showNotice(
			'error',
			__( 'This version could not be restored.', 'block-rewind' )
		);
		return false;
	} finally {
		runtimeState.isRestoringSnapshot = false;
	}
};
