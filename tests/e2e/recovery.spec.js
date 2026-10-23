const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );

const {
	clickVersionAction,
	editParagraph,
	flushHistory,
	getBlockIds,
	getFirstBlock,
	getVersionRows,
	openHistorySidebar,
	openSavedPost,
	readSnapshotContents,
} = require( './utils' );

const contentsOf = ( page, blockId ) => async () =>
	( await readSnapshotContents( page, blockId ) ).map(
		( snapshot ) => snapshot.content
	);

test.describe( 'Recovery after a reload', () => {
	test( 'keeps recent edits and re-links the history when an unsaved post is reloaded', async ( {
		admin,
		editor,
		page,
	} ) => {
		await openSavedPost( { admin, editor, page } );
		const blockId = await editParagraph( { editor, page } );
		const contents = contentsOf( page, blockId );
		await expect.poll( contents ).toEqual( [ 'Hello' ] );

		// Edits made after the last save, then a real reload before any checkpoint.
		await page.keyboard.type( ' more' );
		await page.waitForTimeout( 500 );
		await page.reload();

		// The reloaded block has the last saved content and gets its history back.
		await expect.poll( () => getBlockIds( page ) ).toEqual( [ blockId ] );
		expect( await contents() ).toEqual( [ 'Hello', 'Hello world more' ] );
		expect( ( await getFirstBlock( page ) ).content ).toBe( 'Hello' );
		expect(
			await page.evaluate( () =>
				window.wp.data.select( 'core/editor' ).isEditedPostDirty()
			)
		).toBe( false );

		// The unsaved edits can be restored from the history.
		await editor.canvas
			.getByRole( 'document', { name: 'Block: Paragraph' } )
			.click();
		const sidebar = await openHistorySidebar( page );
		const entries = getVersionRows( sidebar );
		await expect( entries ).toHaveCount( 2 );
		await expect( entries.last() ).toContainText( 'Current' );
		await clickVersionAction( entries.first(), 'Restore' );
		await expect
			.poll( async () => ( await getFirstBlock( page ) ).content )
			.toBe( 'Hello world more' );
	} );

	test( 'does not re-link when several blocks have the matching content', async ( {
		admin,
		editor,
		page,
	} ) => {
		await admin.createNewPost();
		await editor.insertBlock( {
			name: 'core/paragraph',
			attributes: { content: 'Same' },
		} );
		await editor.insertBlock( {
			name: 'core/paragraph',
			attributes: { content: 'Same' },
		} );
		await editor.saveDraft();
		const postId = await page.evaluate( () =>
			window.wp.data.select( 'core/editor' ).getCurrentPostId()
		);
		await admin.editPost( postId );

		await editor.canvas
			.getByRole( 'document', { name: 'Block: Paragraph' } )
			.first()
			.click();
		await page.keyboard.press( 'End' );
		await page.keyboard.type( ' edited' );
		await expect
			.poll( async () => ( await getBlockIds( page ) )[ 0 ] )
			.not.toBe( '' );

		await page.reload();
		await page.waitForFunction(
			() =>
				window.wp?.data?.select( 'core/block-editor' ).getBlocks()
					.length
		);
		await page.waitForTimeout( 1000 );

		expect( await getBlockIds( page ) ).toEqual( [ '', '' ] );
	} );
} );

test.describe( 'Empty versions', () => {
	test( 'skips the empty first version of a new block but keeps a later empty state', async ( {
		admin,
		editor,
		page,
		pageUtils,
	} ) => {
		await admin.createNewPost();
		await editor.insertBlock( { name: 'core/paragraph' } );
		await editor.canvas.locator( '[data-type="core/paragraph"]' ).click();
		await page.keyboard.type( 'New text' );
		await expect
			.poll( async () => ( await getBlockIds( page ) )[ 0 ] )
			.not.toBe( '' );
		const [ blockId ] = await getBlockIds( page );
		const contents = contentsOf( page, blockId );

		await page.waitForTimeout( 500 );
		expect( await contents() ).toEqual( [] );
		const sidebar = await openHistorySidebar( page );
		await expect(
			sidebar.getByText( /first version is saved within a minute/ )
		).toBeVisible();

		await flushHistory( page );
		await expect.poll( contents ).toEqual( [ 'New text' ] );

		// Clearing the block later is a real change and is kept.
		await editor.canvas.locator( '[data-type="core/paragraph"]' ).click();
		await pageUtils.pressKeys( 'primary+a' );
		await page.keyboard.press( 'Backspace' );
		await page.waitForTimeout( 500 );
		await flushHistory( page );
		await expect.poll( contents ).toEqual( [ 'New text', '' ] );
	} );
} );
