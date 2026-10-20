const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );

const getBlockIds = ( page ) =>
	page.evaluate( () =>
		window.wp.data
			.select( 'core/block-editor' )
			.getBlocks()
			.map( ( block ) => block.attributes.lehfgBlockId || '' )
	);

const readSnapshots = ( page, blockId ) =>
	page.evaluate(
		( id ) =>
			new Promise( ( resolve, reject ) => {
				const request = window.indexedDB.open( 'lehfgHistoryDB' );
				request.onerror = () => reject( request.error );
				request.onsuccess = () => {
					const db = request.result;
					const all = db
						.transaction( 'snapshots', 'readonly' )
						.objectStore( 'snapshots' )
						.getAll();
					all.onsuccess = () => {
						db.close();
						resolve(
							all.result
								.filter(
									( snapshot ) => snapshot.blockId === id
								)
								.sort( ( a, b ) => a.timestamp - b.timestamp )
								.map( ( snapshot ) => ( {
									blockName: snapshot.blockName,
									content: snapshot.attributes.content,
								} ) )
						);
					};
				};
			} ),
		blockId
	);

// Creates and saves a post with one paragraph, then reloads it so the editor starts clean.
const openSavedPost = async ( { admin, editor, page } ) => {
	await admin.createNewPost();
	await editor.insertBlock( {
		name: 'core/paragraph',
		attributes: { content: 'Hello' },
	} );
	await editor.saveDraft();
	const postId = await page.evaluate( () =>
		window.wp.data.select( 'core/editor' ).getCurrentPostId()
	);
	await admin.editPost( postId );
	return postId;
};

// Selects the paragraph and appends text, which makes it a tracked block.
const editParagraph = async ( { editor, page }, text = ' world' ) => {
	await editor.canvas
		.getByRole( 'document', { name: 'Block: Paragraph' } )
		.first()
		.click();
	await page.keyboard.press( 'End' );
	await page.keyboard.type( text );
	await expect
		.poll( async () => ( await getBlockIds( page ) )[ 0 ] )
		.toMatch( /^lehfg-/ );
	return ( await getBlockIds( page ) )[ 0 ];
};

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
			.poll( () => readSnapshots( page, blockId ) )
			.toEqual( [ { blockName: 'core/paragraph', content: 'Hello' } ] );

		await page.evaluate( () =>
			window.wp.data
				.dispatch( 'core/interface' )
				.enableComplementaryArea(
					'core',
					'lehfg-sidebar/lehfg-sidebar'
				)
		);
		await expect(
			page
				.getByRole( 'region', { name: 'Editor settings' } )
				.getByRole( 'button', { name: /Today/ } )
		).toHaveCount( 1 );
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
							block.attributes.lehfgBlockId,
						] )
				)
			)
			.toEqual( [ [ 'core/heading', blockId ] ] );
		expect( await readSnapshots( page, blockId ) ).toEqual( [
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
					id: block.attributes.lehfgBlockId,
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
		await expect
			.poll( () => readSnapshots( page, blockId ) )
			.toEqual( [ { blockName: 'core/paragraph', content: 'Hello' } ] );
	} );
} );
