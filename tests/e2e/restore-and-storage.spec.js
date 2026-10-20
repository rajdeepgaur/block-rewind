const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );

const {
	editParagraph,
	flushHistory,
	getBlockIds,
	getFirstBlock,
	openHistorySidebar,
	openSavedPost,
	putSnapshot,
	readSnapshotContents,
	readSnapshots,
} = require( './utils' );

// Expands the newest history entry in the sidebar and clicks one of its actions.
const clickNewestEntryAction = async ( sidebar, action ) => {
	await sidebar.getByRole( 'button', { name: /Today/ } ).first().click();
	await sidebar.getByRole( 'button', { name: action, exact: true } ).click();
};

test.describe( 'Restore', () => {
	test( 'restores an earlier version in place as a single undo step', async ( {
		admin,
		editor,
		page,
	} ) => {
		await openSavedPost( { admin, editor, page } );
		const blockId = await editParagraph( { editor, page } );
		const { clientId } = await getFirstBlock( page );
		await expect
			.poll( () => readSnapshots( page, blockId ) )
			.toHaveLength( 1 );

		const sidebar = await openHistorySidebar( page );
		await clickNewestEntryAction( sidebar, 'Restore' );

		await expect
			.poll( () => getFirstBlock( page ) )
			.toEqual( {
				clientId,
				name: 'core/paragraph',
				content: 'Hello',
				id: blockId,
			} );
		// The state before the restore was saved, so the restore can be reverted from history.
		await expect
			.poll( () => readSnapshotContents( page, blockId ) )
			.toEqual( [
				{ blockName: 'core/paragraph', content: 'Hello' },
				{ blockName: 'core/paragraph', content: 'Hello world' },
			] );
		await expect(
			sidebar.getByRole( 'button', { name: /Current/ } )
		).toHaveCount( 1 );

		await page
			.getByRole( 'button', { name: 'Undo', exact: true } )
			.last()
			.click();
		await expect
			.poll( async () => ( await getFirstBlock( page ) ).content )
			.toBe( 'Hello world' );
	} );

	test( 'restores a version of another block type', async ( {
		admin,
		editor,
		page,
	} ) => {
		await openSavedPost( { admin, editor, page } );
		const blockId = await editParagraph( { editor, page } );
		await expect
			.poll( () => readSnapshots( page, blockId ) )
			.toHaveLength( 1 );

		await page.evaluate( () => {
			const { select, dispatch } = window.wp.data;
			const [ paragraph ] = select( 'core/block-editor' ).getBlocks();
			dispatch( 'core/block-editor' ).replaceBlocks(
				paragraph.clientId,
				window.wp.blocks.switchToBlockType( paragraph, 'core/heading' )
			);
		} );
		await expect
			.poll( async () => ( await getFirstBlock( page ) ).name )
			.toBe( 'core/heading' );

		const sidebar = await openHistorySidebar( page );
		await expect(
			sidebar.getByRole( 'button', { name: /Today/ } )
		).toHaveCount( 1 );
		await clickNewestEntryAction( sidebar, 'Restore' );

		await expect
			.poll( () => getFirstBlock( page ) )
			.toMatchObject( {
				name: 'core/paragraph',
				content: 'Hello',
				id: blockId,
			} );
	} );

	test( 'refuses to restore a version that uses unregistered blocks', async ( {
		admin,
		editor,
		page,
	} ) => {
		const postId = await openSavedPost( { admin, editor, page } );
		const blockId = await editParagraph( { editor, page } );
		await expect
			.poll( () => readSnapshots( page, blockId ) )
			.toHaveLength( 1 );

		await putSnapshot( page, {
			snapshotId: 'e2e-missing',
			blockId,
			postId,
			blockName: 'lehfg-e2e/missing',
			attributes: {},
			innerBlocks: [],
			timestamp: Date.now() + 1000,
			expiresAt: Date.now() + 60 * 60 * 1000,
			hash: 'e2e-missing',
		} );

		const sidebar = await openHistorySidebar( page );
		// Reopen the sidebar so it reloads the history that was written directly.
		await page.evaluate( () =>
			window.wp.data
				.dispatch( 'core/interface' )
				.disableComplementaryArea( 'core' )
		);
		await openHistorySidebar( page );
		await expect(
			sidebar.getByRole( 'button', { name: /Today/ } )
		).toHaveCount( 2 );
		await clickNewestEntryAction( sidebar, 'Restore' );

		await expect(
			page
				.locator( '.components-snackbar' )
				.getByText(
					/uses blocks that are no longer available: lehfg-e2e\/missing/
				)
		).toBeVisible();
		expect( ( await getFirstBlock( page ) ).content ).toBe( 'Hello world' );
	} );

	test( 'restores from the preview modal', async ( {
		admin,
		editor,
		page,
	} ) => {
		await openSavedPost( { admin, editor, page } );
		const blockId = await editParagraph( { editor, page } );
		await expect
			.poll( () => readSnapshots( page, blockId ) )
			.toHaveLength( 1 );

		const sidebar = await openHistorySidebar( page );
		await clickNewestEntryAction( sidebar, 'Preview' );

		const modal = page.getByRole( 'dialog', { name: 'Snapshot Preview' } );
		await expect( modal.getByText( 'Changed:' ) ).toBeVisible();
		await modal
			.getByRole( 'button', { name: 'Restore this version' } )
			.click();

		await expect( modal ).toBeHidden();
		await expect
			.poll( async () => ( await getFirstBlock( page ) ).content )
			.toBe( 'Hello' );
	} );
} );

test.describe( 'Storage', () => {
	test( 'keeps history per site and user and removes the shared legacy database', async ( {
		admin,
		editor,
		page,
	} ) => {
		await admin.createNewPost();
		await page.evaluate(
			() =>
				new Promise( ( resolve ) => {
					const request = window.indexedDB.open( 'lehfgHistoryDB' );
					request.onsuccess = () => {
						request.result.close();
						resolve();
					};
				} )
		);

		await openSavedPost( { admin, editor, page } );

		const storageKey = await page.evaluate(
			() => window.lehfgSettings.storageKey
		);
		expect( storageKey ).toMatch( /^[0-9a-f]{12}-1$/ );

		await expect
			.poll( () =>
				page.evaluate( async () =>
					( await window.indexedDB.databases() ).map(
						( db ) => db.name
					)
				)
			)
			.toEqual( [ `lehfg-history-${ storageKey }` ] );
	} );

	test( 'saves pending edits when the tab is hidden', async ( {
		admin,
		editor,
		page,
	} ) => {
		await openSavedPost( { admin, editor, page } );
		const blockId = await editParagraph( { editor, page } );

		await flushHistory( page );

		await expect
			.poll( () => readSnapshotContents( page, blockId ) )
			.toEqual( [
				{ blockName: 'core/paragraph', content: 'Hello' },
				{ blockName: 'core/paragraph', content: 'Hello world' },
			] );
	} );

	test( 'applies the retention and per-block limit filters', async ( {
		admin,
		context,
		editor,
		page,
	} ) => {
		await context.addCookies( [
			{
				name: 'lehfg_e2e_ttl',
				value: '600',
				url: 'http://localhost:8889',
			},
			{ name: 'lehfg_e2e_max', value: '5', url: 'http://localhost:8889' },
		] );

		await openSavedPost( { admin, editor, page } );
		const blockId = await editParagraph( { editor, page }, ' 1' );

		for ( let edit = 2; edit <= 6; edit += 1 ) {
			await page.keyboard.type( ` ${ edit }` );
			await page.waitForTimeout( 300 );
			await flushHistory( page );
			await expect
				.poll(
					async () =>
						( await readSnapshotContents( page, blockId ) ).pop()
							?.content
				)
				.toBe(
					`Hello 1${ ' 2 3 4 5 6'.slice( 0, ( edit - 1 ) * 2 ) }`
				);
		}

		const snapshots = await readSnapshots( page, blockId );
		expect( snapshots ).toHaveLength( 5 );
		// The oldest version ("Hello") was removed first.
		expect( snapshots[ 0 ].attributes.content ).toBe( 'Hello 1 2' );
		expect( snapshots[ 0 ].expiresAt - snapshots[ 0 ].timestamp ).toBe(
			600 * 1000
		);
	} );

	test( 'shows a notice and tracks nothing when browser storage is unavailable', async ( {
		admin,
		editor,
		page,
	} ) => {
		await page.addInitScript( () => {
			window.indexedDB.open = () => {
				throw new DOMException( 'Blocked', 'SecurityError' );
			};
		} );

		await openSavedPost( { admin, editor, page } );
		const sidebar = await openHistorySidebar( page );
		await expect(
			sidebar.getByText( /Block history is unavailable/ )
		).toBeVisible();

		await editor.canvas
			.getByRole( 'document', { name: 'Block: Paragraph' } )
			.click();
		await page.keyboard.type( ' world' );
		await page.waitForTimeout( 500 );
		expect( await getBlockIds( page ) ).toEqual( [ '' ] );
	} );
} );
