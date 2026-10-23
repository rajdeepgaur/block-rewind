const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );

const {
	clickVersionAction,
	editParagraph,
	flushHistory,
	getBlockIds,
	getVersionRows,
	openHistorySidebar,
	openSavedPost,
	readSnapshots,
} = require( './utils' );

// Deselects and selects the block again, so the sidebar reloads its history after
// a save that does not notify it (the page-exit save).
const reselectFirstBlock = async ( page ) => {
	await page.evaluate( () => {
		const { select, dispatch } = window.wp.data;
		const [ block ] = select( 'core/block-editor' ).getBlocks();
		dispatch( 'core/block-editor' ).clearSelectedBlock();
		dispatch( 'core/block-editor' ).selectBlock( block.clientId, null );
	} );
};

test.describe( 'History sidebar', () => {
	test( 'flags the version saved before editing', async ( {
		admin,
		editor,
		page,
	} ) => {
		await openSavedPost( { admin, editor, page } );
		const blockId = await editParagraph( { editor, page } );
		await flushHistory( page );

		await expect
			.poll( async () =>
				( await readSnapshots( page, blockId ) ).map( ( snapshot ) => [
					snapshot.attributes.content,
					Boolean( snapshot.isBaseline ),
				] )
			)
			.toEqual( [
				[ 'Hello', true ],
				[ 'Hello world', false ],
			] );

		const sidebar = await openHistorySidebar( page );
		await reselectFirstBlock( page );
		const entries = getVersionRows( sidebar );
		await expect( entries ).toHaveCount( 2 );
		await expect( entries.first() ).toContainText( 'Current' );
		await expect( entries.first() ).toContainText( 'Text: 1 word added' );
		await expect( entries.last() ).toContainText( 'Before editing' );
	} );

	test( 'asks for a single block when several are selected', async ( {
		admin,
		editor,
		page,
	} ) => {
		await admin.createNewPost();
		await editor.insertBlock( {
			name: 'core/paragraph',
			attributes: { content: 'One' },
		} );
		await editor.insertBlock( {
			name: 'core/paragraph',
			attributes: { content: 'Two' },
		} );
		await page.evaluate( () => {
			const { select, dispatch } = window.wp.data;
			const [ first, second ] = select( 'core/block-editor' ).getBlocks();
			dispatch( 'core/block-editor' ).multiSelect(
				first.clientId,
				second.clientId
			);
		} );

		const sidebar = await openHistorySidebar( page );
		await expect(
			sidebar.getByText( 'Select a single block' )
		).toBeVisible();
		await expect(
			sidebar.getByText( /You have 2 blocks selected/ )
		).toBeVisible();
	} );

	test( 'lists the blocks inside a parent that have history', async ( {
		admin,
		editor,
		page,
	} ) => {
		await admin.createNewPost();
		await editor.insertBlock( {
			name: 'core/group',
			innerBlocks: [
				{ name: 'core/paragraph', attributes: { content: 'Inside' } },
			],
		} );
		// Reload so the group is not selected: a block selected before an edit inside
		// it is tracked too, and this test needs a parent without history.
		await editor.saveDraft();
		const postId = await page.evaluate( () =>
			window.wp.data.select( 'core/editor' ).getCurrentPostId()
		);
		await admin.editPost( postId );
		await editor.canvas
			.getByRole( 'document', { name: 'Block: Paragraph' } )
			.click();
		await page.keyboard.press( 'End' );
		await page.keyboard.type( ' edited' );
		await expect
			.poll( () =>
				page.evaluate(
					() =>
						window.wp.data
							.select( 'core/block-editor' )
							.getBlocks()[ 0 ].innerBlocks[ 0 ].attributes
							.blockRewindId || ''
				)
			)
			.not.toBe( '' );

		// Select the group: it has no history of its own.
		await page.evaluate( () => {
			const { select, dispatch } = window.wp.data;
			const [ group ] = select( 'core/block-editor' ).getBlocks();
			dispatch( 'core/block-editor' ).selectBlock( group.clientId );
		} );

		const sidebar = await openHistorySidebar( page );
		await expect(
			sidebar.getByText( 'History is kept per block' )
		).toBeVisible();
		await sidebar
			.getByRole( 'button', { name: /Paragraph\s*Inside edited/ } )
			.click();

		await expect
			.poll( () =>
				page.evaluate(
					() =>
						window.wp.data
							.select( 'core/block-editor' )
							.getSelectedBlock()?.name
				)
			)
			.toBe( 'core/paragraph' );
		await expect(
			sidebar.locator( '.block-rewind-block-header' )
		).toContainText( 'Paragraph' );
		await expect( getVersionRows( sidebar ) ).toHaveCount( 1 );
	} );
} );

test.describe( 'Compare modal', () => {
	test( 'shows what restoring changes, with a text diff and a visible footer', async ( {
		admin,
		editor,
		page,
	} ) => {
		await page.setViewportSize( { width: 1024, height: 700 } );
		await openSavedPost( { admin, editor, page } );
		await editParagraph( { editor, page }, ' and a much longer ending' );
		expect( ( await getBlockIds( page ) )[ 0 ] ).not.toBe( '' );

		const sidebar = await openHistorySidebar( page );
		const entries = getVersionRows( sidebar );
		await expect( entries ).toHaveCount( 1 );
		await clickVersionAction( entries.first(), 'Compare' );

		const modal = page.getByRole( 'dialog', {
			name: 'Version from before editing',
		} );
		await expect(
			modal.getByRole( 'row', { name: /^Text 6 words 1 word 5 removed/ } )
		).toBeVisible();

		// The footer stays inside the window (it used to be pushed out of view).
		const restoreButton = modal.getByRole( 'button', {
			name: 'Restore this version',
		} );
		await expect( restoreButton ).toBeInViewport();

		// Now comes first, as in the table above.
		await expect(
			modal.locator( '.block-rewind-compare__pane-title' )
		).toHaveText( [ 'Now', 'After restoring' ] );

		const textTab = modal.getByRole( 'tab', { name: 'Text changes' } );
		await textTab.click();
		await expect( textTab ).toHaveAttribute( 'aria-selected', 'true' );
		await expect(
			modal.locator( '.block-rewind-text-diff del' )
		).toHaveText( ' and a much longer ending' );

		await modal.getByRole( 'button', { name: 'Cancel' } ).click();
		await expect( modal ).toBeHidden();
	} );
} );

test.describe( 'Restoring a parent block', () => {
	const selectGroup = ( page ) =>
		page.evaluate( () => {
			const { select, dispatch } = window.wp.data;
			const [ group ] = select( 'core/block-editor' ).getBlocks();
			dispatch( 'core/block-editor' ).clearSelectedBlock();
			dispatch( 'core/block-editor' ).selectBlock( group.clientId );
		} );

	test( 'warns about blocks inside and marks their changes', async ( {
		admin,
		editor,
		page,
	} ) => {
		await admin.createNewPost();
		await editor.insertBlock( {
			name: 'core/group',
			innerBlocks: [
				{ name: 'core/paragraph', attributes: { content: 'Inside' } },
			],
		} );
		await editor.saveDraft();
		const postId = await page.evaluate( () =>
			window.wp.data.select( 'core/editor' ).getCurrentPostId()
		);
		await admin.editPost( postId );

		// Selecting the group before editing inside it tracks both blocks.
		await selectGroup( page );
		await editor.canvas
			.getByRole( 'document', { name: 'Block: Paragraph' } )
			.click();
		await page.keyboard.press( 'End' );
		await page.keyboard.type( ' one' );
		const getParagraphId = () =>
			page.evaluate(
				() =>
					window.wp.data
						.select( 'core/block-editor' )
						.getBlocks()[ 0 ].innerBlocks[ 0 ].attributes
						.blockRewindId || ''
			);
		await expect.poll( getParagraphId ).not.toBe( '' );
		const paragraphId = await getParagraphId();
		await flushHistory( page );

		// An edit that is not saved yet: the restore saves it first.
		await page.keyboard.type( ' two' );

		await selectGroup( page );
		const sidebar = await openHistorySidebar( page );
		const groupRows = getVersionRows( sidebar );
		await expect( groupRows ).toHaveCount( 2 );
		await clickVersionAction( groupRows.last(), 'Compare' );

		const modal = page.getByRole( 'dialog', {
			name: 'Version from before editing',
		} );
		await expect(
			modal.getByText( 'Also changes 1 block inside: Paragraph.' )
		).toBeVisible();
		await modal
			.getByRole( 'button', { name: 'Restore this version' } )
			.click();

		await expect
			.poll( async () =>
				( await readSnapshots( page, paragraphId ) ).map(
					( snapshot ) => [
						snapshot.attributes.content,
						snapshot.restoredWithParent?.blockName || null,
					]
				)
			)
			.toEqual( [
				[ 'Inside', null ],
				[ 'Inside one', null ],
				[ 'Inside one two', null ],
				[ 'Inside', 'core/group' ],
			] );

		await page.evaluate( () => {
			const { select, dispatch } = window.wp.data;
			const [ group ] = select( 'core/block-editor' ).getBlocks();
			dispatch( 'core/block-editor' ).selectBlock(
				group.innerBlocks[ 0 ].clientId
			);
		} );
		const paragraphRow = getVersionRows( sidebar ).first();
		await expect( paragraphRow ).toContainText( 'Restored with Group' );
		await expect( paragraphRow ).toContainText(
			'Changed when the Group around it was restored'
		);
	} );
} );
