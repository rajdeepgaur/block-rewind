const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );

const {
	clickVersionAction,
	editParagraph,
	flushHistory,
	getBlockIds,
	getFirstBlock,
	getVersionRows,
	hideTab,
	openHistorySidebar,
	openSavedPost,
	putSnapshot,
	readSnapshotContents,
	readSnapshots,
	seedExpiredSnapshots,
	selectParagraph,
} = require( './utils' );

// Waits for the expected number of versions, then clicks one of the actions of
// the oldest. The newest version is listed first.
const clickOldestEntryAction = async ( sidebar, entryCount, action ) => {
	const entries = getVersionRows( sidebar );
	await expect( entries ).toHaveCount( entryCount );
	await clickVersionAction( entries.last(), action );
};

// Keeps a write transaction open on the history store for a while, like a slow write,
// so the plugin's own reads and writes wait. Resolves once it has started.
const holdHistoryStore = ( page, durationMs ) =>
	page.evaluate(
		( duration ) =>
			new Promise( ( resolve, reject ) => {
				const request = window.indexedDB.open(
					`block-rewind-history-${ window.blockRewindSettings.storageKey }`
				);
				request.onerror = () => reject( request.error );
				request.onsuccess = () => {
					const db = request.result;
					const transaction = db.transaction(
						'snapshots',
						'readwrite'
					);
					const store = transaction.objectStore( 'snapshots' );
					const deadline = Date.now() + duration;
					const keepBusy = () => {
						if ( Date.now() < deadline ) {
							store.count().onsuccess = keepBusy;
						}
					};
					keepBusy();
					transaction.oncomplete = () => db.close();
					resolve();
				};
			} ),
		durationMs
	);

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

	test( 'saves text typed while a restore waits for storage', async ( {
		admin,
		editor,
		page,
	} ) => {
		await openSavedPost( { admin, editor, page } );
		const blockId = await editParagraph( { editor, page } );
		await flushHistory( page );
		await expect
			.poll( () => readSnapshots( page, blockId ) )
			.toHaveLength( 2 );

		const sidebar = await openHistorySidebar( page );
		await holdHistoryStore( page, 1500 );
		await clickOldestEntryAction( sidebar, 2, 'Restore' );
		await selectParagraph( editor );
		await page.keyboard.press( 'End' );
		await page.keyboard.type( ' typed' );

		await expect
			.poll( async () => ( await getFirstBlock( page ) ).content, {
				timeout: 10000,
			} )
			.toBe( 'Hello' );
		await expect
			.poll( () => readSnapshotContents( page, blockId ) )
			.toEqual( [
				{ blockName: 'core/paragraph', content: 'Hello' },
				{ blockName: 'core/paragraph', content: 'Hello world' },
				{ blockName: 'core/paragraph', content: 'Hello world typed' },
				{ blockName: 'core/paragraph', content: 'Hello' },
			] );
	} );

	test( 'keeps keyboard focus on the restored version', async ( {
		admin,
		editor,
		page,
	} ) => {
		await openSavedPost( { admin, editor, page } );
		const blockId = await editParagraph( { editor, page } );
		await flushHistory( page );
		await expect
			.poll( () => readSnapshots( page, blockId ) )
			.toHaveLength( 2 );

		const sidebar = await openHistorySidebar( page );
		const entries = getVersionRows( sidebar );
		await expect( entries ).toHaveCount( 2 );
		const currentHeading = entries
			.first()
			.locator( '.block-rewind-timeline__heading' );

		// From the sidebar: Tab from Compare to Restore, then Enter.
		await entries
			.last()
			.getByRole( 'button', { name: 'Compare', exact: true } )
			.focus();
		await page.keyboard.press( 'Tab' );
		await expect(
			entries
				.last()
				.getByRole( 'button', { name: 'Restore', exact: true } )
		).toBeFocused();
		await page.keyboard.press( 'Enter' );

		await expect( entries ).toHaveCount( 3 );
		await expect( entries.first() ).toContainText( 'Current' );
		await expect( entries.first() ).toContainText( 'Restored' );
		await expect( currentHeading ).toBeFocused();

		// From the compare modal of the "Hello world" version.
		await entries
			.nth( 1 )
			.getByRole( 'button', { name: 'Compare', exact: true } )
			.focus();
		await page.keyboard.press( 'Enter' );
		const restoreInModal = page
			.getByRole( 'dialog' )
			.getByRole( 'button', { name: 'Restore this version' } );
		await restoreInModal.focus();
		await page.keyboard.press( 'Enter' );

		await expect( entries ).toHaveCount( 4 );
		await expect( entries.first() ).toContainText( 'Current' );
		await expect( currentHeading ).toBeFocused();
		expect( ( await getFirstBlock( page ) ).content ).toBe( 'Hello world' );
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
		const entries = getVersionRows( sidebar );
		const currentEntries = sidebar.locator(
			'.block-rewind-timeline__version.is-current'
		);
		const nowRow = sidebar.locator( '.block-rewind-timeline__now' );

		// Only the newest of the two identical versions is current.
		await expect( entries ).toHaveCount( 3 );
		await expect( currentEntries ).toHaveCount( 1 );
		await expect( entries.first() ).toContainText( 'Current' );
		await expect( nowRow ).toHaveCount( 0 );

		// After a new edit no version is current; a "Now" row says the block changed since.
		await editor.canvas
			.getByRole( 'document', { name: 'Block: Paragraph' } )
			.click();
		await page.keyboard.press( 'End' );
		await page.keyboard.type( ' again' );
		await expect( nowRow ).toContainText( 'Edited since the last version' );
		await expect( currentEntries ).toHaveCount( 0 );
		await expect( entries ).toHaveCount( 3 );

		// Restore the older of the two identical versions.
		await clickVersionAction( entries.last(), 'Restore' );

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
		await expect( nowRow ).toHaveCount( 0 );
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
			blockName: 'block-rewind-e2e/missing',
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
					/uses blocks that are no longer available: block-rewind-e2e\/missing/
				)
		).toBeVisible();
		expect( ( await getFirstBlock( page ) ).content ).toBe( 'Hello world' );
	} );

	test( 'restores from the compare modal', async ( {
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
		await clickOldestEntryAction( sidebar, 1, 'Compare' );

		const modal = page.getByRole( 'dialog', {
			name: 'Version from before editing',
		} );
		await expect(
			modal.getByRole( 'row', { name: /^Text 2 words 1 word/ } )
		).toBeVisible();
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
	test( 'keeps history in a database per site and user', async ( {
		admin,
		editor,
		page,
	} ) => {
		await openSavedPost( { admin, editor, page } );

		const storageKey = await page.evaluate(
			() => window.blockRewindSettings.storageKey
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
			.toEqual( [ `block-rewind-history-${ storageKey }` ] );
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

	test( 'tracks edits made while expired versions are being removed', async ( {
		admin,
		editor,
		page,
	} ) => {
		const postId = await openSavedPost( { admin, editor, page } );
		await seedExpiredSnapshots( page, 20000, 'Expired '.repeat( 100 ) );

		// The cleanup starts with the editor; edit before it can finish.
		await admin.editPost( postId );
		const blockId = await editParagraph( { editor, page } );
		await flushHistory( page );

		await expect
			.poll( () => readSnapshotContents( page, blockId ) )
			.toEqual( [
				{ blockName: 'core/paragraph', content: 'Hello' },
				{ blockName: 'core/paragraph', content: 'Hello world' },
			] );
		await expect
			.poll(
				async () => ( await readSnapshots( page, 'expired' ) ).length
			)
			.toBe( 0 );
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
				name: 'block_rewind_e2e_ttl',
				value: '600',
				url: 'http://localhost:8889',
			},
			{
				name: 'block_rewind_e2e_max',
				value: '5',
				url: 'http://localhost:8889',
			},
		] );

		await openSavedPost( { admin, editor, page } );
		// Regular checkpoints prune; the page-exit save skips pruning to commit faster.
		await page.clock.install();
		const blockId = await editParagraph( { editor, page }, ' 1' );

		for ( let edit = 2; edit <= 6; edit += 1 ) {
			await page.keyboard.type( ` ${ edit }` );
			await page.waitForTimeout( 300 );
			await page.clock.fastForward( 61 * 1000 );
			await expect
				.poll(
					async () =>
						( await readSnapshotContents( page, blockId ) ).pop()
							?.content,
					{ timeout: 10000 }
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

	test( 'shows when storage is full and saves the block once there is space', async ( {
		admin,
		editor,
		page,
	} ) => {
		// While the flag is set, every write aborts with a quota error once its requests
		// are done, as a full storage does when the transaction commits.
		await page.addInitScript( () => {
			window.blockRewindE2eStorageFull = true;
			const { put } = window.IDBObjectStore.prototype;
			const errorGetter = Object.getOwnPropertyDescriptor(
				window.IDBTransaction.prototype,
				'error'
			).get;

			Object.defineProperty( window.IDBTransaction.prototype, 'error', {
				get() {
					return this.quotaError || errorGetter.call( this );
				},
			} );
			window.IDBObjectStore.prototype.put = function ( ...args ) {
				const request = put.apply( this, args );
				if ( window.blockRewindE2eStorageFull ) {
					const { transaction } = this;
					transaction.quotaError = new DOMException(
						'Quota exceeded',
						'QuotaExceededError'
					);
					request.addEventListener( 'success', () => {
						try {
							transaction.abort();
						} catch ( error ) {
							// The transaction already finished.
						}
					} );
				}
				return request;
			};
		} );

		await openSavedPost( { admin, editor, page } );
		const blockId = await editParagraph( { editor, page } );

		const snackbar = page.getByTestId( 'snackbar' );
		await expect( snackbar ).toContainText(
			'Block history isn’t being saved: the browser’s storage is full.'
		);
		await snackbar.getByRole( 'button', { name: 'View' } ).click();
		const sidebar = page.getByRole( 'region', { name: 'Editor settings' } );
		await expect(
			sidebar.getByText( 'New versions can’t be saved' )
		).toBeVisible();
		await expect(
			sidebar.locator( '.block-rewind-timeline__now' )
		).toContainText( 'the browser’s storage is full' );

		// A page-exit save that fails while the page stays open keeps both for later.
		await flushHistory( page );
		// Lets the aborted write report back.
		await page.waitForTimeout( 300 );
		expect( await readSnapshotContents( page, blockId ) ).toEqual( [] );

		// Space is available again: the next save stores the pre-edit state and the edit.
		await page.evaluate( () => {
			window.blockRewindE2eStorageFull = false;
		} );
		await flushHistory( page );
		await expect
			.poll( () => readSnapshotContents( page, blockId ) )
			.toEqual( [
				{ blockName: 'core/paragraph', content: 'Hello' },
				{ blockName: 'core/paragraph', content: 'Hello world' },
			] );
		await expect(
			sidebar.getByText( 'New versions can’t be saved' )
		).toBeHidden();
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
			sidebar.getByText( 'Block history is off in this browser' )
		).toBeVisible();

		await editor.canvas
			.getByRole( 'document', { name: 'Block: Paragraph' } )
			.click();
		await page.keyboard.type( ' world' );
		await page.waitForTimeout( 500 );
		expect( await getBlockIds( page ) ).toEqual( [ '' ] );
	} );
} );
