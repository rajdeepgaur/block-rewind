const { expect } = require( '@wordpress/e2e-test-utils-playwright' );

const getBlockIds = ( page ) =>
	page.evaluate( () =>
		window.wp.data
			.select( 'core/block-editor' )
			.getBlocks()
			.map( ( block ) => block.attributes.lehfgBlockId || '' )
	);

const getFirstBlock = ( page ) =>
	page.evaluate( () => {
		const [ block ] = window.wp.data
			.select( 'core/block-editor' )
			.getBlocks();
		return {
			clientId: block.clientId,
			name: block.name,
			content: String( block.attributes.content ),
			id: block.attributes.lehfgBlockId,
		};
	} );

// Runs a callback against the history database of the current site and user.
const withHistoryStore = ( page, mode, callbackSource, argument ) =>
	page.evaluate(
		( [ storeMode, source, arg ] ) =>
			new Promise( ( resolve, reject ) => {
				const dbName = `lehfg-history-${ window.lehfgSettings.storageKey }`;
				const request = window.indexedDB.open( dbName );
				request.onerror = () => reject( request.error );
				request.onsuccess = () => {
					const db = request.result;
					const transaction = db.transaction(
						'snapshots',
						storeMode
					);
					// eslint-disable-next-line no-new-func
					const result = new Function( 'store', 'arg', source )(
						transaction.objectStore( 'snapshots' ),
						arg
					);
					transaction.oncomplete = () => {
						db.close();
						resolve(
							result && 'result' in result
								? result.result
								: result
						);
					};
				};
			} ),
		[ mode, callbackSource, argument ]
	);

// Returns a block's snapshots, oldest first.
const readSnapshots = async ( page, blockId ) => {
	const all = await withHistoryStore(
		page,
		'readonly',
		'return store.getAll();'
	);
	return all
		.filter( ( snapshot ) => snapshot.blockId === blockId )
		.sort( ( a, b ) => a.timestamp - b.timestamp );
};

const readSnapshotContents = async ( page, blockId ) =>
	( await readSnapshots( page, blockId ) ).map( ( snapshot ) => ( {
		blockName: snapshot.blockName,
		content: snapshot.attributes.content,
	} ) );

const putSnapshot = ( page, snapshot ) =>
	withHistoryStore( page, 'readwrite', 'store.put( arg );', snapshot );

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

const selectParagraph = ( editor ) =>
	editor.canvas
		.getByRole( 'document', { name: 'Block: Paragraph' } )
		.first()
		.click();

// Selects the paragraph and appends text, which makes it a tracked block.
const editParagraph = async ( { editor, page }, text = ' world' ) => {
	await selectParagraph( editor );
	await page.keyboard.press( 'End' );
	await page.keyboard.type( text );
	await expect
		.poll( async () => ( await getBlockIds( page ) )[ 0 ] )
		.toMatch( /^lehfg-/ );
	return ( await getBlockIds( page ) )[ 0 ];
};

// Simulates leaving the page, which saves every edited block immediately.
const flushHistory = ( page ) =>
	page.evaluate( () => window.dispatchEvent( new Event( 'pagehide' ) ) );

// Simulates switching to another tab.
const hideTab = ( page ) =>
	page.evaluate( () => {
		Object.defineProperty( document, 'visibilityState', {
			configurable: true,
			get: () => 'hidden',
		} );
		document.dispatchEvent( new Event( 'visibilitychange' ) );
		delete document.visibilityState;
	} );

const openHistorySidebar = async ( page ) => {
	await page.evaluate( () =>
		window.wp.data
			.dispatch( 'core/interface' )
			.enableComplementaryArea( 'core', 'lehfg-sidebar/lehfg-sidebar' )
	);
	return page.getByRole( 'region', { name: 'Editor settings' } );
};

module.exports = {
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
	selectParagraph,
};
