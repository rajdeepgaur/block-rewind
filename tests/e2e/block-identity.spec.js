const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );

const {
	editParagraph,
	getBlockIds,
	getVersionRows,
	openHistorySidebar,
	openSavedPost,
	readSnapshotContents,
} = require( './utils' );

test.describe( 'Block identity', () => {
	test( 'selecting a block does not change the post', async ( {
		admin,
		editor,
		page,
	} ) => {
		await openSavedPost( { admin, editor, page } );

		await editor.canvas
			.getByRole( 'document', { name: 'Block: Paragraph' } )
			.click();
		// Longer than the scan throttle.
		await page.waitForTimeout( 500 );

		expect( await getBlockIds( page ) ).toEqual( [ '' ] );
		expect(
			await page.evaluate( () => {
				const editorSelect = window.wp.data.select( 'core/editor' );
				return {
					dirty: editorSelect.isEditedPostDirty(),
					undo: editorSelect.hasEditorUndo(),
				};
			} )
		).toEqual( { dirty: false, undo: false } );
	} );

	test( 'the first edit assigns an ID and saves the pre-edit state', async ( {
		admin,
		editor,
		page,
	} ) => {
		await openSavedPost( { admin, editor, page } );
		const blockId = await editParagraph( { editor, page } );

		await expect
			.poll( () => readSnapshotContents( page, blockId ) )
			.toEqual( [ { blockName: 'core/paragraph', content: 'Hello' } ] );

		// The block was edited after its only version, so no version is current.
		const sidebar = await openHistorySidebar( page );
		const entries = getVersionRows( sidebar );
		await expect( entries ).toHaveCount( 1 );
		await expect( entries.first() ).toContainText( 'Before editing' );
		await expect( entries.first() ).not.toContainText( 'Current' );
		await expect(
			sidebar.locator( '.block-rewind-timeline__now' )
		).toContainText( 'Edited since the last version' );
	} );

	test( 'duplicating a block keeps the ID on the original only', async ( {
		admin,
		editor,
		page,
	} ) => {
		await openSavedPost( { admin, editor, page } );
		const blockId = await editParagraph( { editor, page } );

		await page.evaluate( () => {
			const { select, dispatch } = window.wp.data;
			const [ original ] = select( 'core/block-editor' ).getBlocks();
			dispatch( 'core/block-editor' ).duplicateBlocks( [
				original.clientId,
			] );
		} );

		await expect
			.poll( () => getBlockIds( page ) )
			.toEqual( [ blockId, '' ] );
	} );

	test( 'pasting a copy above the original keeps the ID on the original', async ( {
		admin,
		editor,
		page,
	} ) => {
		await openSavedPost( { admin, editor, page } );
		const blockId = await editParagraph( { editor, page } );

		await page.evaluate( () => {
			const { select, dispatch } = window.wp.data;
			const [ original ] = select( 'core/block-editor' ).getBlocks();
			dispatch( 'core/block-editor' ).insertBlocks(
				[ window.wp.blocks.cloneBlock( original ) ],
				0
			);
		} );

		await expect
			.poll( () => getBlockIds( page ) )
			.toEqual( [ '', blockId ] );
	} );

	test( 'transforming a block keeps its ID and history', async ( {
		admin,
		editor,
		page,
	} ) => {
		await openSavedPost( { admin, editor, page } );
		const blockId = await editParagraph( { editor, page } );

		await page.evaluate( () => {
			const { select, dispatch } = window.wp.data;
			const [ paragraph ] = select( 'core/block-editor' ).getBlocks();
			dispatch( 'core/block-editor' ).replaceBlocks(
				paragraph.clientId,
				window.wp.blocks.switchToBlockType( paragraph, 'core/heading' )
			);
		} );

		await expect
			.poll( () =>
				page.evaluate( () =>
					window.wp.data
						.select( 'core/block-editor' )
						.getBlocks()
						.map( ( block ) => [
							block.name,
							block.attributes.blockRewindId,
						] )
				)
			)
			.toEqual( [ [ 'core/heading', blockId ] ] );
		expect( await readSnapshotContents( page, blockId ) ).toEqual( [
			{ blockName: 'core/paragraph', content: 'Hello' },
		] );
	} );

	test( 'undo and redo after the first edit keep the content and the ID', async ( {
		admin,
		editor,
		page,
		pageUtils,
	} ) => {
		await openSavedPost( { admin, editor, page } );
		const blockId = await editParagraph( { editor, page } );

		const readParagraph = () =>
			page.evaluate( () => {
				const [ block ] = window.wp.data
					.select( 'core/block-editor' )
					.getBlocks();
				return {
					content: String( block.attributes.content ),
					id: block.attributes.blockRewindId,
				};
			} );

		await pageUtils.pressKeys( 'primary+z' );
		await expect.poll( readParagraph ).toEqual( {
			content: 'Hello',
			id: blockId,
		} );

		await pageUtils.pressKeys( 'primaryShift+z' );
		await expect.poll( readParagraph ).toEqual( {
			content: 'Hello world',
			id: blockId,
		} );
	} );

	test( 'the ID survives saving and reloading', async ( {
		admin,
		editor,
		page,
	} ) => {
		const postId = await openSavedPost( { admin, editor, page } );
		const blockId = await editParagraph( { editor, page } );

		await editor.saveDraft();
		await admin.editPost( postId );

		expect( await getBlockIds( page ) ).toEqual( [ blockId ] );
		// Leaving the page saved the edit as well as the first snapshot.
		await expect
			.poll( () => readSnapshotContents( page, blockId ) )
			.toEqual( [
				{ blockName: 'core/paragraph', content: 'Hello' },
				{ blockName: 'core/paragraph', content: 'Hello world' },
			] );
	} );
} );
