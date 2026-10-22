const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );

const {
	editParagraph,
	flushHistory,
	getBlockIds,
	getFirstBlock,
	hideTab,
	openHistorySidebar,
	openSavedPost,
	putSnapshot,
	readSnapshotContents,
	readSnapshots,
} = require( './utils' );

// Waits for the expected number of history entries, then expands the oldest one
// and clicks one of its actions. The newest entry is the current version.
const clickOldestEntryAction = async ( sidebar, entryCount, action ) => {
	const entries = sidebar.getByRole( 'button', { name: /Today/ } );
	await expect( entries ).toHaveCount( entryCount );
	await entries.last().click();
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
		await clickOldestEntryAction( sidebar, 1, 'Restore' );

		await expect
			.poll( () => getFirstBlock( page ) )
			.toEqual( {
				clientId,
				name: 'core/paragraph',
				content: 'Hello',
				id: blockId,
			} );
		// The state before the restore is saved, then the restore itself is recorded.
		await expect
			.poll( () => readSnapshotContents( page, blockId ) )
			.toEqual( [
				{ blockName: 'core/paragraph', content: 'Hello' },
				{ blockName: 'core/paragraph', content: 'Hello world' },
				{ blockName: 'core/paragraph', content: 'Hello' },
			] );

		await page
			.getByRole( 'button', { name: 'Undo', exact: true } )
			.last()
			.click();
		await expect
			.poll( async () => ( await getFirstBlock( page ) ).content )
			.toBe( 'Hello world' );
	} );

	test( 'marks one version as current and records which identical version was restored', async ( {
		admin,
		editor,
		page,
	} ) => {
		await openSavedPost( { admin, editor, page } );
		const blockId = await editParagraph( { editor, page } );
		await page.waitForTimeout( 300 );
		await flushHistory( page );

		// Return to the original text, so two saved versions have identical content.
		for ( let index = 0; index < ' world'.length; index += 1 ) {
			await page.keyboard.press( 'Backspace' );
		}
		await page.waitForTimeout( 300 );
		await flushHistory( page );
		await expect
			.poll( async () =>
				( await readSnapshotContents( page, blockId ) ).map(
					( snapshot ) => snapshot.content
				)
			)
			.toEqual( [ 'Hello', 'Hello world', 'Hello' ] );

		const sidebar = await openHistorySidebar( page );
		const entries = sidebar.getByRole( 'button', { name: /Today/ } );
		const currentEntries = sidebar.getByRole( 'button', {
			name: /Current/,
		} );

		// Only the newest of the two identical versions is current.
		await expect( entries ).toHaveCount( 3 );
		await expect( currentEntries ).toHaveCount( 1 );
		await expect( entries.first() ).toContainText( 'Current' );

		// After a new edit no version is current; the latest says the block changed since.
		await editor.canvas
			.getByRole( 'document', { name: 'Block: Paragraph' } )
			.click();
		await page.keyboard.press( 'End' );
		await page.keyboard.type( ' again' );
		await expect( entries.first() ).toContainText( 'Edited since' );
		await expect( currentEntries ).toHaveCount( 0 );
		await expect( entries ).toHaveCount( 3 );

		// Restore the older of the two identical versions.
		await entries.last().click();
		await sidebar
			.getByRole( 'button', { name: 'Restore', exact: true } )
			.click();

		await expect
			.poll( async () => ( await getFirstBlock( page ) ).content )
			.toBe( 'Hello' );
		await expect
			.poll( async () =>
				( await readSnapshots( page, blockId ) ).map( ( snapshot ) => [
					snapshot.attributes.content,
					Boolean( snapshot.restoredFrom ),
				] )
			)
			.toEqual( [
				[ 'Hello', false ],
				[ 'Hello world', false ],
				[ 'Hello', false ],
				[ 'Hello again', false ],
				[ 'Hello', true ],
			] );

		const snapshots = await readSnapshots( page, blockId );
		expect( snapshots[ 4 ].restoredFrom ).toBe( snapshots[ 0 ].timestamp );
		await expect( entries ).toHaveCount( 5 );
		await expect( currentEntries ).toHaveCount( 1 );
		await expect( entries.first() ).toContainText( 'Restored' );
		await expect( entries.first() ).toContainText( 'Current' );
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
		await clickOldestEntryAction( sidebar, 1, 'Restore' );

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
			// Earlier today than every real version, so it is listed last.
			timestamp: new Date().setHours( 0, 0, 0, 0 ),
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
		await clickOldestEntryAction( sidebar, 2, 'Restore' );

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
		await clickOldestEntryAction( sidebar, 1, 'Preview' );

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

	test( 'saves every edited block when the page is closed', async ( {
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

	test( 'saves each edited block at most once a minute, including on tab switches', async ( {
		admin,
		editor,
		page,
	} ) => {
		await openSavedPost( { admin, editor, page } );
		// Installed after load: timers keep real time, but "is a save due" reads Date.now().
		await page.clock.install();
		const blockId = await editParagraph( { editor, page } );
		const contents = async () =>
			( await readSnapshotContents( page, blockId ) ).map(
				( snapshot ) => snapshot.content
			);
		await expect.poll( contents ).toEqual( [ 'Hello' ] );

		// The first snapshot was just saved, so neither a tab switch nor a tick saves yet.
		await hideTab( page );
		await page.clock.fastForward( 30 * 1000 );
		await page.waitForTimeout( 500 );
		expect( await contents() ).toEqual( [ 'Hello' ] );

		// A minute after the first snapshot, the edit is saved.
		await page.clock.fastForward( 35 * 1000 );
		await expect.poll( contents ).toEqual( [ 'Hello', 'Hello world' ] );

		// A tab switch right after that save does not save again.
		await page.keyboard.type( ' again' );
		await page.waitForTimeout( 500 );
		await hideTab( page );
		await page.waitForTimeout( 500 );
		expect( await contents() ).toEqual( [ 'Hello', 'Hello world' ] );

		// Leaving the page always saves.
		await flushHistory( page );
		await expect
			.poll( contents )
			.toEqual( [ 'Hello', 'Hello world', 'Hello world again' ] );
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
